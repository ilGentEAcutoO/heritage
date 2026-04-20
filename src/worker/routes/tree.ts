/**
 * tree.ts — /api/tree/* CRUD routes
 *
 * Public:
 *   GET /api/tree/:slug  → full tree snapshot (TreeQueryResult)
 *
 * Authenticated (requireAuth applied per route):
 *   POST   /api/tree                         → create tree
 *   PATCH  /api/tree/:slug                   → update tree (owner only)
 *   POST   /api/tree/:slug/people            → add person (editor+)
 *   PATCH  /api/tree/:slug/people/:id        → update person (editor+)
 *   DELETE /api/tree/:slug/people/:id        → delete person (editor+)
 *   POST   /api/tree/:slug/relations         → add relation (editor+)
 *   DELETE /api/tree/:slug/relations/:id     → delete relation (editor+)
 *   POST   /api/tree/:slug/stories           → add story (editor+)
 *   PUT    /api/tree/:slug/overrides         → upsert position overrides (any authed)
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { HonoEnv } from '../types';
import type { DB } from '../../db/client';
import {
  trees,
  tree_members,
  people,
  relations,
  stories,
  position_overrides,
} from '../../db/schema';
import { getTreeData } from '../lib/tree-query';
import {
  PersonInputSchema,
  PersonPatchSchema,
  StoryInputSchema,
  TreeInputSchema,
  RelationInputSchema,
  PositionOverridesInputSchema,
} from '../../shared/schemas';
import { requireAuth } from '../middleware/session';

// ---------------------------------------------------------------------------
// Role helper
// ---------------------------------------------------------------------------

type Role = 'owner' | 'editor' | 'viewer';

/**
 * Returns the membership role of `userId` in the tree `treeId`.
 * Returns `null` if no membership row found.
 */
async function getTreeRole(
  db: DB,
  treeId: string,
  userId: string | null,
): Promise<Role | null> {
  if (!userId) return null;
  const row = await db
    .select({ role: tree_members.role })
    .from(tree_members)
    .where(and(eq(tree_members.tree_id, treeId), eq(tree_members.user_id, userId)))
    .get();
  return (row?.role as Role) ?? null;
}

const ROLE_RANK: Record<Role, number> = { owner: 3, editor: 2, viewer: 1 };

function hasRole(actual: Role | null, required: Role): boolean {
  if (!actual) return false;
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

// ---------------------------------------------------------------------------
// ID generation helper (simple ULID-style without external dep)
// ---------------------------------------------------------------------------

function newId(): string {
  const ts = Date.now().toString(36).toUpperCase().padStart(9, '0');
  const rand = Math.random().toString(36).substring(2, 13).toUpperCase().padEnd(11, '0');
  return `${ts}${rand}`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const treeRouter = new Hono<HonoEnv>();

// ---------------------------------------------------------------------------
// GET /api/tree/:slug  — public (with access control)
// ---------------------------------------------------------------------------

treeRouter.get('/:slug', async (c) => {
  const db = c.var.db;
  const { slug } = c.req.param();

  const data = await getTreeData(db, slug);
  if (!data) return c.json({ error: 'not found' }, 404);

  const user = c.var.user;

  // Access control: if not public, require membership
  if (!data.tree.isPublic) {
    const role = await getTreeRole(db, (await db.select({ id: trees.id }).from(trees).where(eq(trees.slug, slug)).get())!.id, user?.id ?? null);
    if (!role) return c.json({ error: 'forbidden' }, 403);
  }

  return c.json(data);
});

// ---------------------------------------------------------------------------
// POST /api/tree  — create tree [auth]
// ---------------------------------------------------------------------------

treeRouter.post('/', requireAuth, async (c) => {
  const db = c.var.db;
  const user = c.var.user!;

  const body = await c.req.json();
  const parsed = TreeInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation', issues: parsed.error.issues }, 400);
  }

  const { slug, name, name_en, is_public } = parsed.data;

  // Check slug uniqueness
  const existing = await db.select({ id: trees.id }).from(trees).where(eq(trees.slug, slug)).get();
  if (existing) return c.json({ error: 'slug already taken' }, 409);

  const treeId = newId();
  const memberId = newId();

  await db.batch([
    db.insert(trees).values({
      id: treeId,
      slug,
      name,
      name_en: name_en ?? null,
      owner_id: user.id,
      is_public,
    }),
    db.insert(tree_members).values({
      id: memberId,
      tree_id: treeId,
      user_id: user.id,
      role: 'owner',
    }),
  ]);

  const tree = await db.select().from(trees).where(eq(trees.id, treeId)).get();
  return c.json({ tree }, 201);
});

// ---------------------------------------------------------------------------
// PATCH /api/tree/:slug  — update tree [auth, owner]
// ---------------------------------------------------------------------------

treeRouter.patch('/:slug', requireAuth, async (c) => {
  const db = c.var.db;
  const user = c.var.user!;
  const { slug } = c.req.param();

  const treeRow = await db.select().from(trees).where(eq(trees.slug, slug)).get();
  if (!treeRow) return c.json({ error: 'not found' }, 404);

  const role = await getTreeRole(db, treeRow.id, user.id);
  if (!hasRole(role, 'owner')) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json();
  const parsed = TreeInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation', issues: parsed.error.issues }, 400);
  }

  const updates: Partial<typeof treeRow> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.name_en !== undefined) updates.name_en = parsed.data.name_en;
  if (parsed.data.is_public !== undefined) updates.is_public = parsed.data.is_public;

  if (Object.keys(updates).length > 0) {
    await db.update(trees).set(updates).where(eq(trees.id, treeRow.id));
  }

  const updated = await db.select().from(trees).where(eq(trees.id, treeRow.id)).get();
  return c.json({ tree: updated });
});

// ---------------------------------------------------------------------------
// POST /api/tree/:slug/people  — add person [auth, editor+]
// ---------------------------------------------------------------------------

treeRouter.post('/:slug/people', requireAuth, async (c) => {
  const db = c.var.db;
  const user = c.var.user!;
  const { slug } = c.req.param();

  const treeRow = await db.select({ id: trees.id }).from(trees).where(eq(trees.slug, slug)).get();
  if (!treeRow) return c.json({ error: 'not found' }, 404);

  const role = await getTreeRole(db, treeRow.id, user.id);
  if (!hasRole(role, 'editor')) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json();
  const parsed = PersonInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation', issues: parsed.error.issues }, 400);
  }

  const personId = newId();
  await db.insert(people).values({
    id: personId,
    tree_id: treeRow.id,
    name: parsed.data.name,
    name_en: parsed.data.name_en ?? null,
    nick: parsed.data.nick ?? null,
    born: parsed.data.born ?? null,
    died: parsed.data.died ?? null,
    gender: parsed.data.gender ?? null,
    hometown: parsed.data.hometown ?? null,
    is_me: parsed.data.is_me ?? false,
    external: parsed.data.external ?? false,
    avatar_key: parsed.data.avatar_key ?? null,
    extra: null,
  });

  const person = await db.select().from(people).where(eq(people.id, personId)).get();
  return c.json({ person }, 201);
});

// ---------------------------------------------------------------------------
// PATCH /api/tree/:slug/people/:id  — update person [auth, editor+]
// ---------------------------------------------------------------------------

treeRouter.patch('/:slug/people/:id', requireAuth, async (c) => {
  const db = c.var.db;
  const user = c.var.user!;
  const { slug, id: personId } = c.req.param();

  const treeRow = await db.select({ id: trees.id }).from(trees).where(eq(trees.slug, slug)).get();
  if (!treeRow) return c.json({ error: 'not found' }, 404);

  const role = await getTreeRole(db, treeRow.id, user.id);
  if (!hasRole(role, 'editor')) return c.json({ error: 'forbidden' }, 403);

  const personRow = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.tree_id, treeRow.id)))
    .get();
  if (!personRow) return c.json({ error: 'person not found' }, 404);

  const body = await c.req.json();
  const parsed = PersonPatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation', issues: parsed.error.issues }, 400);
  }

  // Build update object
  const updates: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.name !== undefined) updates.name = d.name;
  if (d.name_en !== undefined) updates.name_en = d.name_en;
  if (d.nick !== undefined) updates.nick = d.nick;
  if (d.born !== undefined) updates.born = d.born;
  if (d.died !== undefined) updates.died = d.died;
  if (d.gender !== undefined) updates.gender = d.gender;
  if (d.hometown !== undefined) updates.hometown = d.hometown;
  if (d.is_me !== undefined) updates.is_me = d.is_me;
  if (d.external !== undefined) updates.external = d.external;
  if (d.avatar_key !== undefined) updates.avatar_key = d.avatar_key;

  if (Object.keys(updates).length > 0) {
    await db.update(people).set(updates).where(eq(people.id, personId));
  }

  const updated = await db.select().from(people).where(eq(people.id, personId)).get();
  return c.json({ person: updated });
});

// ---------------------------------------------------------------------------
// DELETE /api/tree/:slug/people/:id  — delete person [auth, editor+]
// ---------------------------------------------------------------------------

treeRouter.delete('/:slug/people/:id', requireAuth, async (c) => {
  const db = c.var.db;
  const user = c.var.user!;
  const { slug, id: personId } = c.req.param();

  const treeRow = await db.select({ id: trees.id }).from(trees).where(eq(trees.slug, slug)).get();
  if (!treeRow) return c.json({ error: 'not found' }, 404);

  const role = await getTreeRole(db, treeRow.id, user.id);
  if (!hasRole(role, 'editor')) return c.json({ error: 'forbidden' }, 403);

  const personRow = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.id, personId), eq(people.tree_id, treeRow.id)))
    .get();
  if (!personRow) return c.json({ error: 'person not found' }, 404);

  await db.delete(people).where(eq(people.id, personId));
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// POST /api/tree/:slug/relations  — add relation [auth, editor+]
// ---------------------------------------------------------------------------

treeRouter.post('/:slug/relations', requireAuth, async (c) => {
  const db = c.var.db;
  const user = c.var.user!;
  const { slug } = c.req.param();

  const treeRow = await db.select({ id: trees.id }).from(trees).where(eq(trees.slug, slug)).get();
  if (!treeRow) return c.json({ error: 'not found' }, 404);

  const role = await getTreeRole(db, treeRow.id, user.id);
  if (!hasRole(role, 'editor')) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json();
  const parsed = RelationInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation', issues: parsed.error.issues }, 400);
  }

  const result = await db
    .insert(relations)
    .values({
      tree_id: treeRow.id,
      from_id: parsed.data.from_id,
      to_id: parsed.data.to_id,
      kind: parsed.data.kind,
    })
    .returning()
    .get();

  return c.json({ relation: result }, 201);
});

// ---------------------------------------------------------------------------
// DELETE /api/tree/:slug/relations/:id  — delete relation [auth, editor+]
// ---------------------------------------------------------------------------

treeRouter.delete('/:slug/relations/:id', requireAuth, async (c) => {
  const db = c.var.db;
  const user = c.var.user!;
  const { slug, id: relId } = c.req.param();

  const treeRow = await db.select({ id: trees.id }).from(trees).where(eq(trees.slug, slug)).get();
  if (!treeRow) return c.json({ error: 'not found' }, 404);

  const role = await getTreeRole(db, treeRow.id, user.id);
  if (!hasRole(role, 'editor')) return c.json({ error: 'forbidden' }, 403);

  const relRow = await db
    .select({ id: relations.id })
    .from(relations)
    .where(and(eq(relations.id, Number(relId)), eq(relations.tree_id, treeRow.id)))
    .get();
  if (!relRow) return c.json({ error: 'relation not found' }, 404);

  await db.delete(relations).where(eq(relations.id, Number(relId)));
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// POST /api/tree/:slug/stories  — add story [auth, editor+]
// ---------------------------------------------------------------------------

treeRouter.post('/:slug/stories', requireAuth, async (c) => {
  const db = c.var.db;
  const user = c.var.user!;
  const { slug } = c.req.param();

  const treeRow = await db.select({ id: trees.id }).from(trees).where(eq(trees.slug, slug)).get();
  if (!treeRow) return c.json({ error: 'not found' }, 404);

  const role = await getTreeRole(db, treeRow.id, user.id);
  if (!hasRole(role, 'editor')) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json();
  const parsed = StoryInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation', issues: parsed.error.issues }, 400);
  }

  // Verify person belongs to tree
  const personRow = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.id, parsed.data.personId), eq(people.tree_id, treeRow.id)))
    .get();
  if (!personRow) return c.json({ error: 'person not found in tree' }, 404);

  const storyId = newId();
  await db.insert(stories).values({
    id: storyId,
    person_id: parsed.data.personId,
    year: parsed.data.year ?? null,
    title: parsed.data.title ?? null,
    body: parsed.data.body,
    created_by: user.id,
  });

  const story = await db.select().from(stories).where(eq(stories.id, storyId)).get();
  return c.json({ story }, 201);
});

// ---------------------------------------------------------------------------
// PUT /api/tree/:slug/overrides  — upsert position overrides [auth]
// ---------------------------------------------------------------------------

treeRouter.put('/:slug/overrides', requireAuth, async (c) => {
  const db = c.var.db;
  const user = c.var.user!;
  const { slug } = c.req.param();

  const treeRow = await db.select({ id: trees.id }).from(trees).where(eq(trees.slug, slug)).get();
  if (!treeRow) return c.json({ error: 'not found' }, 404);

  const body = await c.req.json();
  const parsed = PositionOverridesInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'validation', issues: parsed.error.issues }, 400);
  }

  // Upsert each override individually (D1 lacks ON CONFLICT DO UPDATE via Drizzle easily)
  // We use batch for parallel efficiency
  const upserts = parsed.data.overrides.map((ov) =>
    db
      .insert(position_overrides)
      .values({
        user_id: user.id,
        tree_id: treeRow.id,
        person_id: ov.personId,
        dx: ov.dx,
        dy: ov.dy,
      })
      .onConflictDoUpdate({
        target: [position_overrides.user_id, position_overrides.person_id],
        set: {
          dx: ov.dx,
          dy: ov.dy,
          updated_at: new Date(),
        },
      }),
  );

  if (upserts.length === 1) {
    await upserts[0];
  } else {
    const [first, ...rest] = upserts as [typeof upserts[0], ...typeof upserts];
    await db.batch([first, ...rest]);
  }

  return c.body(null, 204);
});
