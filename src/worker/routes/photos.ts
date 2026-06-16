/**
 * photos.ts — /api/tree/:slug/person/:personId/photos mutations
 *
 * All routes are owner-only. Anti-enumeration: non-owner gets 404, not 403.
 * Person must belong to the resolved tree.
 *
 * Coordinator mounts this router at /api/tree so paths resolve as:
 *   POST   /api/tree/:slug/person/:personId/photos
 *   DELETE /api/tree/:slug/person/:personId/photos/:photoId
 *
 * R2 key layout (must match img.ts KEY_RE):
 *   photos/${treeId}/${personId}/${newId()}.${ext}
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { HonoEnv } from '../types';
import * as schema from '../../db/schema';
import { purgeTreeCache } from '../lib/cache-purge';
import { resolveOwnerTree } from '../lib/resolve-owner-tree';
import { newId } from '../lib/ids';
import { checkRateLimit } from '../lib/rate-limit';

export const photosRouter = new Hono<HonoEnv>();

// Per-owner rate limit for photo mutations (upload + delete share one budget).
// Exported so integration tests bind to the real values (no drift).
export const PHOTO_MUTATE_MAX = 30;
export const PHOTO_MUTATE_WINDOW_SECS = 60;

// ---------------------------------------------------------------------------
// MIME → extension mapping (must match KEY_RE in img.ts)
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/png':  return 'png';
    case 'image/webp': return 'webp';
    default: throw new Error(`Unsupported mime: ${mime}`);
  }
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// ---------------------------------------------------------------------------
// POST /:slug/person/:personId/photos — upload a photo (owner only)
// ---------------------------------------------------------------------------

photosRouter.post('/:slug/person/:personId/photos', async (c) => {
  const { slug, personId } = c.req.param();

  // 1. Resolve tree + verify ownership
  const ctx = await resolveOwnerTree(c, slug);
  if (!ctx.ok) {
    return c.json(
      { error: ctx.status === 401 ? 'unauthorized' : 'not_found' },
      ctx.status,
    );
  }

  const { db, tree, user } = ctx;

  // 2. Person must exist in this tree
  const person = await db.query.people.findFirst({
    where: and(
      eq(schema.people.id, personId),
      eq(schema.people.tree_id, tree.id),
    ),
  });

  if (!person) {
    return c.json({ error: 'not_found' }, 404);
  }

  // 2b. Per-owner rate limit (before the expensive multipart parse + R2 write).
  if (c.env?.KV_RL) {
    const allowed = await checkRateLimit(
      c.env.KV_RL, 'photo-mutate', user.id, PHOTO_MUTATE_MAX, PHOTO_MUTATE_WINDOW_SECS,
    );
    if (!allowed) return c.json({ error: 'rate_limited' }, 429);
  }

  // 3. Parse multipart form data
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const fileField = formData.get('file');

  // 4. Validate file presence
  if (!fileField || !(fileField instanceof File)) {
    return c.json({ error: 'no_file' }, 400);
  }

  const file = fileField as File;

  // 5. Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return c.json({ error: 'unsupported_type' }, 415);
  }

  // 6. Reject oversized uploads via the declared size BEFORE buffering the
  // whole file into memory, then re-check the actual bytes (defense-in-depth).
  if (file.size > MAX_BYTES) {
    return c.json({ error: 'too_large' }, 413);
  }

  const buffer = await file.arrayBuffer();
  const size = buffer.byteLength;

  if (size > MAX_BYTES) {
    return c.json({ error: 'too_large' }, 413);
  }

  // 7. Build R2 key and upload
  const ext = mimeToExt(file.type);
  const fileId = newId();
  const key = `photos/${tree.id}/${personId}/${fileId}.${ext}`;

  await c.env.PHOTOS.put(key, buffer, {
    httpMetadata: { contentType: file.type },
  });

  // 8. Insert DB row
  const photoId = newId();
  await db.insert(schema.photos).values({
    id: photoId,
    person_id: personId,
    object_key: key,
    mime: file.type,
    bytes: size,
    uploaded_by: user.id,
  });

  // 9. Purge edge cache
  await purgeTreeCache(c.req.url, slug);

  return c.json(
    {
      photo: {
        id: photoId,
        key,
        url: `/api/img/${key}`,
      },
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// DELETE /:slug/person/:personId/photos/:photoId — delete a photo (owner only)
// ---------------------------------------------------------------------------

photosRouter.delete('/:slug/person/:personId/photos/:photoId', async (c) => {
  const { slug, personId, photoId } = c.req.param();

  // 1. Resolve tree + verify ownership
  const ctx = await resolveOwnerTree(c, slug);
  if (!ctx.ok) {
    return c.json(
      { error: ctx.status === 401 ? 'unauthorized' : 'not_found' },
      ctx.status,
    );
  }

  const { db, tree, user } = ctx;

  // 2. Person must exist in this tree
  const person = await db.query.people.findFirst({
    where: and(
      eq(schema.people.id, personId),
      eq(schema.people.tree_id, tree.id),
    ),
  });

  if (!person) {
    return c.json({ error: 'not_found' }, 404);
  }

  // 2b. Per-owner rate limit (delete shares the photo-mutate budget with upload).
  if (c.env?.KV_RL) {
    const allowed = await checkRateLimit(
      c.env.KV_RL, 'photo-mutate', user.id, PHOTO_MUTATE_MAX, PHOTO_MUTATE_WINDOW_SECS,
    );
    if (!allowed) return c.json({ error: 'rate_limited' }, 429);
  }

  // 3. Photo row must exist AND belong to this person
  const photo = await db.query.photos.findFirst({
    where: and(
      eq(schema.photos.id, photoId),
      eq(schema.photos.person_id, personId),
    ),
  });

  if (!photo) {
    return c.json({ error: 'not_found' }, 404);
  }

  // 4. Delete from R2
  await c.env.PHOTOS.delete(photo.object_key);

  // 5. Delete from DB
  await db
    .delete(schema.photos)
    .where(
      and(
        eq(schema.photos.id, photoId),
        eq(schema.photos.person_id, personId),
      ),
    );

  // 6. Purge edge cache
  await purgeTreeCache(c.req.url, slug);

  return c.json({ ok: true });
});
