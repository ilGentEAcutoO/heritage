/**
 * Upload route:
 *   POST /api/upload — receive multipart file, validate, write to R2 binding, insert DB row
 *
 * Single-step flow (replaces old presign → browser-PUT → finalize):
 *   1. Client POST /api/upload with multipart form { file: File, personId: string }
 *   2. Worker validates mime, size, magic bytes
 *   3. Worker writes to R2 via env.PHOTOS.put() — no credentials needed
 *   4. Worker inserts photos row and returns { photo }
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import type { HonoEnv } from '../types';
import { requireAuth } from '../middleware/session';
import { schema } from '../../db/client';

// ---------------------------------------------------------------------------
// ULID-lite: 48-bit timestamp + 80-bit random, base32-encoded (Crockford).
// ---------------------------------------------------------------------------

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function ulidLite(): string {
  const now = Date.now();
  let t = now;
  let ts = '';
  for (let i = 9; i >= 0; i--) {
    ts = CROCKFORD[t % 32]! + ts;
    t = Math.floor(t / 32);
  }
  const randBytes = new Uint8Array(10);
  crypto.getRandomValues(randBytes);
  let rnd = '';
  let acc = 0;
  let bits = 0;
  for (const b of randBytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      rnd += CROCKFORD[(acc >> bits) & 0x1f];
    }
  }
  if (bits > 0) rnd += CROCKFORD[(acc << (5 - bits)) & 0x1f];
  return ts + rnd;
}

// ---------------------------------------------------------------------------
// MIME helpers
// ---------------------------------------------------------------------------

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMime = (typeof ALLOWED_MIMES)[number];

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extFromMime(mime: string): string | undefined {
  return MIME_TO_EXT[mime];
}

function r2KeyFor(personId: string, ext: string): string {
  const safePersonId = personId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `photos/${safePersonId}/${ulidLite()}.${ext}`;
}

// ---------------------------------------------------------------------------
// Magic byte verification
// ---------------------------------------------------------------------------

function checkMagicBytes(buf: Uint8Array, mime: string): boolean {
  if (mime === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mime === 'image/png') {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return sig.every((b, i) => buf[i] === b);
  }
  if (mime === 'image/webp') {
    const riff = [0x52, 0x49, 0x46, 0x46];
    const webp = [0x57, 0x45, 0x42, 0x50];
    return (
      riff.every((b, i) => buf[i] === b) && webp.every((b, i) => buf[8 + i] === b)
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// Permission helper
// ---------------------------------------------------------------------------

async function requireEditorOnPersonTree(
  db: HonoEnv['Variables']['db'],
  personId: string,
  userId: string,
): Promise<string | null> {
  const person = await db.query.people.findFirst({
    where: eq(schema.people.id, personId),
    columns: { tree_id: true },
  });
  if (!person) return null;

  const treeId = person.tree_id;

  const membership = await db.query.tree_members.findFirst({
    where: and(
      eq(schema.tree_members.tree_id, treeId),
      eq(schema.tree_members.user_id, userId),
    ),
    columns: { role: true },
  });

  if (!membership) return null;
  if (membership.role !== 'owner' && membership.role !== 'editor') return null;

  return treeId;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const upload = new Hono<HonoEnv>();

upload.use('*', requireAuth);

// ---------------------------------------------------------------------------
// POST / — single-step upload
// ---------------------------------------------------------------------------

upload.post('/', async (c) => {
  const db = c.var.db;
  const user = c.var.user!;

  // Reject oversize before reading body — check Content-Length header first
  const contentLengthHeader = c.req.header('content-length');
  if (contentLengthHeader) {
    const declaredBytes = parseInt(contentLengthHeader, 10);
    if (!isNaN(declaredBytes) && declaredBytes > MAX_BYTES) {
      return c.json({ error: `file too large (max ${MAX_BYTES} bytes)` }, 400);
    }
  }

  // Parse multipart form
  let body: Record<string, string | File>;
  try {
    body = await c.req.parseBody();
  } catch {
    return c.json({ error: 'failed to parse multipart body' }, 400);
  }

  // Validate personId
  const personIdRaw = body['personId'];
  const personIdParsed = z.string().min(1).safeParse(personIdRaw);
  if (!personIdParsed.success) {
    return c.json({ error: 'personId is required' }, 400);
  }
  const personId = personIdParsed.data;

  // Validate file field
  const fileRaw = body['file'];
  if (!(fileRaw instanceof File)) {
    return c.json({ error: 'file field is required and must be a File' }, 400);
  }
  const file = fileRaw;

  // Validate MIME type from Content-Type of the file part
  const mime = file.type as AllowedMime;
  if (!(ALLOWED_MIMES as readonly string[]).includes(mime)) {
    return c.json({ error: 'mime must be image/jpeg, image/png, or image/webp' }, 400);
  }

  // Validate size
  const bytes = file.size;
  if (bytes <= 0) {
    return c.json({ error: 'file must not be empty' }, 400);
  }
  if (bytes > MAX_BYTES) {
    return c.json({ error: `file too large (max ${MAX_BYTES} bytes)` }, 400);
  }

  // Check editor+ role
  const treeId = await requireEditorOnPersonTree(db, personId, user.id);
  if (!treeId) {
    return c.json({ error: 'forbidden: insufficient role or person not found' }, 403);
  }

  // Read bytes
  const buf = await file.arrayBuffer();
  const header = new Uint8Array(buf.slice(0, 16));

  // Magic byte check
  if (!checkMagicBytes(header, mime)) {
    return c.json({ error: 'invalid_image: magic bytes do not match declared mime' }, 400);
  }

  // Generate server-side key
  const ext = extFromMime(mime)!;
  const key = r2KeyFor(personId, ext);

  // Write to R2
  try {
    await c.env.PHOTOS.put(key, buf, {
      httpMetadata: { contentType: mime },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'R2 write failed';
    return c.json({ error: msg }, 500);
  }

  // Generate photo id
  const photoId = ulidLite();

  // Insert DB row
  await db.insert(schema.photos).values({
    id: photoId,
    person_id: personId,
    object_key: key,
    mime,
    bytes,
    uploaded_by: user.id,
  });

  return c.json({
    photo: {
      id: photoId,
      personId,
      url: `/api/img/${key}`,
      mime,
      bytes,
    },
  });
});

export default upload;
