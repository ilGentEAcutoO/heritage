/**
 * people.ts — /api/tree/:slug/person/:personId mutations
 *
 * All routes are owner-only. Anti-enumeration: non-owner gets 404, not 403.
 *
 * Coordinator mounts this router at /api/tree so paths resolve as:
 *   PATCH  /api/tree/:slug/person/:personId
 *   POST   /api/tree/:slug/person
 *   DELETE /api/tree/:slug/person/:personId
 *   POST   /api/tree/:slug/relation
 *   DELETE /api/tree/:slug/relation/:relationId
 */

import { Hono } from 'hono';
import { eq, and, or } from 'drizzle-orm';
import { z } from 'zod';
import type { HonoEnv } from '../types';
import * as schema from '../../db/schema';
import { purgeTreeCache } from '../lib/cache-purge';
import { resolveOwnerTree } from '../lib/resolve-owner-tree';
import { newId } from '../lib/ids';

export const peopleRouter = new Hono<HonoEnv>();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const currentYear = () => new Date().getFullYear();

/**
 * Enforce deceased/died consistency rules.
 * Returns { ok: true, deceased, died } on success or { ok: false, error, status } on failure.
 */
function enforceDeceasedDied(
  effectiveDeceased: boolean,
  effectiveDied: number | null,
  effectiveBorn: number | null,
): { ok: true; deceased: boolean; died: number | null } | { ok: false; error: string; status: 422 } {
  if (!effectiveDeceased) {
    // alive → force died to null
    return { ok: true, deceased: false, died: null };
  }

  if (effectiveDied !== null) {
    if (effectiveDied > currentYear()) {
      return { ok: false, error: 'invalid_year', status: 422 };
    }
    if (effectiveBorn !== null && effectiveDied < effectiveBorn) {
      return { ok: false, error: 'invalid_year', status: 422 };
    }
  }

  return { ok: true, deceased: true, died: effectiveDied };
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

// Used by the legacy ws08 status-only PATCH — kept for backward compat
const personStatusSchema = z.object({
  deceased: z.boolean(),
  died: z.number().int().nullable(),
});

// Extended partial-update schema (ws09)
const personPatchSchema = z
  .object({
    name: z.string().min(1).max(200).trim().optional(),
    nameEn: z.string().nullable().optional(),
    nick: z.string().nullable().optional(),
    born: z.number().int().nullable().optional(),
    hometown: z.string().nullable().optional(),
    gender: z.enum(['m', 'f']).optional(),
    deceased: z.boolean().optional(),
    died: z.number().int().nullable().optional(),
  })
  .strict();

// POST person schema
const personCreateSchema = z
  .object({
    name: z.string().min(1).max(200).trim(),
    nameEn: z.string().nullable().optional(),
    nick: z.string().nullable().optional(),
    born: z.number().int().nullable().optional(),
    hometown: z.string().nullable().optional(),
    gender: z.enum(['m', 'f']).default('m'),
    deceased: z.boolean().default(false),
    died: z.number().int().nullable().optional(),
  })
  .strict();

// POST relation schema
const relationCreateSchema = z
  .object({
    fromId: z.string(),
    toId: z.string(),
    kind: z.enum(['parent', 'spouse']),
  })
  .strict();

// ---------------------------------------------------------------------------
// PATCH /:slug/person/:personId — owner only (extended ws09 partial update)
// ---------------------------------------------------------------------------

peopleRouter.patch('/:slug/person/:personId', async (c) => {
  const { slug, personId } = c.req.param();

  // 1. Resolve tree + verify ownership (401 no user, 404 no tree / non-owner)
  const ctx = await resolveOwnerTree(c, slug);
  if (!ctx.ok) {
    return c.json({ error: ctx.status === 401 ? 'unauthorized' : 'not found' }, ctx.status);
  }

  const { db, tree } = ctx;

  // 2. Fetch the person — must belong to this tree (anti-enumeration: 404 not 403)
  const person = await db.query.people.findFirst({
    where: and(
      eq(schema.people.id, personId),
      eq(schema.people.tree_id, tree.id),
    ),
  });

  if (!person) {
    return c.json({ error: 'not found' }, 404);
  }

  // 3. Parse + validate request body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  // Try extended patch schema first — if it has fields beyond {deceased, died},
  // or if deceased/died fields are missing, we try the partial schema.
  // Strategy: attempt personPatchSchema (strict), which accepts all fields.
  const patchParsed = personPatchSchema.safeParse(body);
  if (!patchParsed.success) {
    // Fall back: try the legacy status-only schema
    const statusParsed = personStatusSchema.safeParse(body);
    if (!statusParsed.success) {
      return c.json({ error: 'invalid_body', details: patchParsed.error.flatten() }, 400);
    }
    // Legacy path: only deceased + died
    const { deceased, died: rawDied } = statusParsed.data;
    let died = rawDied;
    if (!deceased) {
      died = null;
    } else if (died !== null) {
      const yr = currentYear();
      if (died > yr) {
        return c.json({ error: 'invalid_year', detail: 'died cannot be in the future' }, 422);
      }
      if (person.born !== null && died < person.born) {
        return c.json({ error: 'invalid_year', detail: 'died cannot be before born' }, 422);
      }
    }
    await db
      .update(schema.people)
      .set({ deceased, died })
      .where(and(eq(schema.people.id, personId), eq(schema.people.tree_id, tree.id)));
    await purgeTreeCache(c.req.url, slug);
    return c.json({ deceased, died });
  }

  const data = patchParsed.data;

  // Require at least one field
  if (Object.keys(data).length === 0) {
    return c.json({ error: 'invalid_body', detail: 'at least one field required' }, 400);
  }

  // Compute effective values for cross-field validation
  const effectiveDeceased = data.deceased !== undefined ? data.deceased : person.deceased;
  const effectiveDied = 'died' in data ? (data.died ?? null) : person.died;
  const effectiveBorn = 'born' in data ? (data.born ?? null) : person.born;

  const consistency = enforceDeceasedDied(effectiveDeceased, effectiveDied, effectiveBorn);
  if (!consistency.ok) {
    return c.json({ error: consistency.error, detail: 'invalid year' }, consistency.status);
  }

  // Build update set — only fields that were provided
  const updateSet: Partial<typeof schema.people.$inferInsert> = {};
  if (data.name !== undefined) updateSet.name = data.name;
  if ('nameEn' in data) updateSet.name_en = data.nameEn ?? null;
  if ('nick' in data) updateSet.nick = data.nick ?? null;
  if ('born' in data) updateSet.born = data.born ?? null;
  if ('hometown' in data) updateSet.hometown = data.hometown ?? null;
  if (data.gender !== undefined) updateSet.gender = data.gender;
  // Always apply the effective deceased/died to maintain consistency
  if (data.deceased !== undefined || 'died' in data) {
    updateSet.deceased = consistency.deceased;
    updateSet.died = consistency.died;
  }

  await db
    .update(schema.people)
    .set(updateSet)
    .where(and(eq(schema.people.id, personId), eq(schema.people.tree_id, tree.id)));

  // Purge edge cache so the GET /api/tree/:slug response reflects the change
  await purgeTreeCache(c.req.url, slug);

  return c.json({ ...updateSet });
});

// ---------------------------------------------------------------------------
// POST /:slug/person — create a new person
// ---------------------------------------------------------------------------

peopleRouter.post('/:slug/person', async (c) => {
  const { slug } = c.req.param();

  const ctx = await resolveOwnerTree(c, slug);
  if (!ctx.ok) {
    return c.json({ error: ctx.status === 401 ? 'unauthorized' : 'not found' }, ctx.status);
  }

  const { db, tree } = ctx;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const parsed = personCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }

  const { name, nameEn, nick, born, hometown, gender, deceased, died: rawDied } = parsed.data;

  const consistency = enforceDeceasedDied(deceased, rawDied ?? null, born ?? null);
  if (!consistency.ok) {
    return c.json({ error: consistency.error, detail: 'invalid year' }, consistency.status);
  }

  const personId = newId();

  await db.insert(schema.people).values({
    id: personId,
    tree_id: tree.id,
    name,
    name_en: nameEn ?? null,
    nick: nick ?? null,
    born: born ?? null,
    hometown: hometown ?? null,
    gender: gender ?? 'm',
    deceased: consistency.deceased,
    died: consistency.died,
  });

  await purgeTreeCache(c.req.url, slug);

  return c.json(
    {
      person: {
        id: personId,
        tree_id: tree.id,
        name,
        // camelCase to match the rest of the API (ApiTreeResponse uses nameEn).
        nameEn: nameEn ?? null,
        nick: nick ?? null,
        born: born ?? null,
        hometown: hometown ?? null,
        gender: gender ?? 'm',
        deceased: consistency.deceased,
        died: consistency.died,
      },
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// DELETE /:slug/person/:personId — delete person (cascades relations)
// ---------------------------------------------------------------------------

peopleRouter.delete('/:slug/person/:personId', async (c) => {
  const { slug, personId } = c.req.param();

  const ctx = await resolveOwnerTree(c, slug);
  if (!ctx.ok) {
    return c.json({ error: ctx.status === 401 ? 'unauthorized' : 'not found' }, ctx.status);
  }

  const { db, tree } = ctx;

  const person = await db.query.people.findFirst({
    where: and(
      eq(schema.people.id, personId),
      eq(schema.people.tree_id, tree.id),
    ),
  });

  if (!person) {
    return c.json({ error: 'not found' }, 404);
  }

  // Delete person; FK ON DELETE CASCADE removes relations automatically
  await db
    .delete(schema.people)
    .where(and(eq(schema.people.id, personId), eq(schema.people.tree_id, tree.id)));

  await purgeTreeCache(c.req.url, slug);

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /:slug/relation — create a relation (parent or spouse)
// ---------------------------------------------------------------------------

peopleRouter.post('/:slug/relation', async (c) => {
  const { slug } = c.req.param();

  const ctx = await resolveOwnerTree(c, slug);
  if (!ctx.ok) {
    return c.json({ error: ctx.status === 401 ? 'unauthorized' : 'not found' }, ctx.status);
  }

  const { db, tree } = ctx;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const parsed = relationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }

  const { fromId, toId, kind } = parsed.data;

  // Self-relation guard
  if (fromId === toId) {
    return c.json({ error: 'self_relation' }, 422);
  }

  // Both persons must exist in this tree
  const [fromPerson, toPerson] = await Promise.all([
    db.query.people.findFirst({
      where: and(eq(schema.people.id, fromId), eq(schema.people.tree_id, tree.id)),
    }),
    db.query.people.findFirst({
      where: and(eq(schema.people.id, toId), eq(schema.people.tree_id, tree.id)),
    }),
  ]);

  if (!fromPerson || !toPerson) {
    return c.json({ error: 'not found' }, 404);
  }

  // Deduplicate
  if (kind === 'parent') {
    // directed: exact (from_id=fromId, to_id=toId, kind='parent')
    const existing = await db.query.relations.findFirst({
      where: and(
        eq(schema.relations.tree_id, tree.id),
        eq(schema.relations.from_id, fromId),
        eq(schema.relations.to_id, toId),
        eq(schema.relations.kind, 'parent'),
      ),
    });
    if (existing) {
      return c.json({ error: 'duplicate_relation' }, 409);
    }

    // Cycle guard for parent relations (from=child, to=parent):
    // reject if fromId is an ancestor of toId
    // i.e., walk ancestors of toId upward; if we reach fromId => cycle
    const visited = new Set<string>();
    const queue: string[] = [toId];
    let hasCycle = false;

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      // Find all parent edges where from_id=current (current is child, to_id is parent)
      const parentEdges = await db.query.relations.findMany({
        where: and(
          eq(schema.relations.tree_id, tree.id),
          eq(schema.relations.from_id, current),
          eq(schema.relations.kind, 'parent'),
        ),
      });

      for (const edge of parentEdges) {
        if (edge.to_id === fromId) {
          hasCycle = true;
          break;
        }
        queue.push(edge.to_id);
      }

      if (hasCycle) break;
    }

    if (hasCycle) {
      return c.json({ error: 'cycle' }, 422);
    }
  } else {
    // spouse — undirected dedupe: same pair in either direction
    const existing = await db.query.relations.findFirst({
      where: and(
        eq(schema.relations.tree_id, tree.id),
        eq(schema.relations.kind, 'spouse'),
        or(
          and(eq(schema.relations.from_id, fromId), eq(schema.relations.to_id, toId)),
          and(eq(schema.relations.from_id, toId), eq(schema.relations.to_id, fromId)),
        ),
      ),
    });
    if (existing) {
      return c.json({ error: 'duplicate_relation' }, 409);
    }
  }

  // Insert
  const result = await db
    .insert(schema.relations)
    .values({
      tree_id: tree.id,
      from_id: fromId,
      to_id: toId,
      kind,
    })
    .returning({ id: schema.relations.id });

  const newRelationId = result[0]?.id;

  await purgeTreeCache(c.req.url, slug);

  return c.json(
    {
      relation: {
        id: newRelationId,
        fromId,
        toId,
        kind,
      },
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// DELETE /:slug/relation/:relationId — delete a relation
// ---------------------------------------------------------------------------

peopleRouter.delete('/:slug/relation/:relationId', async (c) => {
  const { slug, relationId } = c.req.param();

  const ctx = await resolveOwnerTree(c, slug);
  if (!ctx.ok) {
    return c.json({ error: ctx.status === 401 ? 'unauthorized' : 'not found' }, ctx.status);
  }

  const { db, tree } = ctx;

  const relation = await db.query.relations.findFirst({
    where: and(
      eq(schema.relations.id, Number(relationId)),
      eq(schema.relations.tree_id, tree.id),
    ),
  });

  if (!relation) {
    return c.json({ error: 'not found' }, 404);
  }

  await db
    .delete(schema.relations)
    .where(
      and(
        eq(schema.relations.id, Number(relationId)),
        eq(schema.relations.tree_id, tree.id),
      ),
    );

  await purgeTreeCache(c.req.url, slug);

  return c.json({ ok: true });
});
