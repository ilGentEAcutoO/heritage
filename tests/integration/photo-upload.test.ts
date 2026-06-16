/**
 * Integration tests for photo upload/delete routes:
 *   POST   /api/tree/:slug/person/:personId/photos
 *   DELETE /api/tree/:slug/person/:personId/photos/:photoId
 *
 * Uses the same in-memory SQLite D1 shim as other integration tests.
 * Provides a minimal in-memory PHOTOS R2 mock — passed as the second arg
 * to app.fetch() so Hono populates c.env (same pattern as img-read.test.ts).
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import * as schema from '../../src/db/schema';
import { photosRouter, PHOTO_MUTATE_MAX } from '../../src/worker/routes/photos';
import { treeRouter } from '../../src/worker/routes/tree';
import type { HonoEnv } from '../../src/worker/types';

// ---------------------------------------------------------------------------
// Minimal in-memory PHOTOS binding for tests
// ---------------------------------------------------------------------------

/** A simple in-memory R2 bucket stub satisfying c.env.PHOTOS usage. */
class PhotosBucketMock {
  private store = new Map<string, { body: ArrayBuffer; contentType: string }>();
  public deletedKeys: string[] = [];

  /** Number of objects currently held — lets tests assert "no R2 write happened". */
  get objectCount(): number {
    return this.store.size;
  }

  async put(
    key: string,
    body: ArrayBuffer | Uint8Array,
    opts?: { httpMetadata?: { contentType?: string } },
  ): Promise<void> {
    const buf = body instanceof Uint8Array ? body.buffer as ArrayBuffer : body as ArrayBuffer;
    this.store.set(key, {
      body: buf,
      contentType: opts?.httpMetadata?.contentType ?? 'application/octet-stream',
    });
  }

  async get(key: string): Promise<{ body: ReadableStream; httpEtag: string } | null> {
    const item = this.store.get(key);
    if (!item) return null;
    const bytes = new Uint8Array(item.body);
    return {
      httpEtag: '"mock-etag"',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    this.deletedKeys.push(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

type SessionUser = { id: string; email: string } | null;

/**
 * Creates the Hono test app + a minimal env object.
 * Pass `env` as the second arg to `app.fetch(req, env)` so Hono populates
 * `c.env.PHOTOS`. Same pattern as img-read.test.ts.
 */
function makeApp(
  d1: SqliteD1Database,
  asUser: SessionUser = null,
  photosBucket?: PhotosBucketMock,
  kvRl?: KVNamespace,
) {
  const db = drizzle(d1 as unknown as D1Database, { schema });
  const photos = photosBucket ?? new PhotosBucketMock();

  const app = new Hono<HonoEnv>();

  // Inject db + session (no real session cookie needed)
  app.use(async (c, next) => {
    c.set('db', db);
    c.set(
      'user',
      asUser ? { ...asUser, displayName: null, email_verified_at: 1 } : null,
    );
    return next();
  });

  app.route('/api/tree', photosRouter);
  app.route('/api/tree', treeRouter);

  // Minimal env object — Hono reads this as c.env on Workers runtime.
  // KV_RL is only present when a test supplies one (the rate-limit guard is
  // `if (c.env?.KV_RL)`, so omitting it keeps the other suites unthrottled).
  const env = {
    DB: d1 as unknown as D1Database,
    PHOTOS: photos as unknown as R2Bucket,
    ...(kvRl ? { KV_RL: kvRl } : {}),
  };

  return { app, db, photos, env };
}

/**
 * A KV mock that always reports the limiter is over cap, regardless of key —
 * so the very first mutation through the route returns 429. Deterministic
 * (no dependence on the wall-clock window boundary).
 */
function makeSaturatedKv(): KVNamespace {
  return {
    get: async () => '999',
    put: async () => {},
  } as unknown as KVNamespace;
}

/** A real in-memory fixed-window KV (get/put) for under-cap happy-path checks. */
function makeCountingKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => {
      store.set(k, v);
    },
  } as unknown as KVNamespace;
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedOwnerAndTree(db: ReturnType<typeof drizzle<typeof schema>>) {
  await db.insert(schema.users).values({
    id: 'owner1',
    email: 'owner@example.com',
    email_verified_at: 1,
  });
  await db.insert(schema.trees).values({
    id: 'tree1',
    slug: 'test-tree',
    name: 'Test Tree',
    owner_id: 'owner1',
    visibility: 'public',
  });
}

async function seedPerson(db: ReturnType<typeof drizzle<typeof schema>>) {
  await db.insert(schema.people).values({
    id: 'person1',
    tree_id: 'tree1',
    name: 'Test Person',
    deceased: false,
  });
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

type AppHandle = ReturnType<typeof makeApp>;

/** Build a multipart POST with a "file" field (or empty form if file is null). */
function makeUploadReq(handle: AppHandle, path: string, file: File | null) {
  const fd = new FormData();
  if (file !== null) {
    fd.append('file', file, file.name);
  }
  return handle.app.fetch(
    new Request(`http://localhost${path}`, { method: 'POST', body: fd }),
    handle.env,
  );
}

function makeDeleteReq(handle: AppHandle, path: string) {
  return handle.app.fetch(
    new Request(`http://localhost${path}`, { method: 'DELETE' }),
    handle.env,
  );
}

/** Create a minimal File object with the given mime type and byte size. */
function makeFile(opts: { name?: string; type?: string; sizeBytes?: number }): File {
  const { name = 'photo.jpg', type = 'image/jpeg', sizeBytes = 1024 } = opts;
  const bytes = new Uint8Array(sizeBytes);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  return new File([bytes], name, { type });
}

// ---------------------------------------------------------------------------
// Suite: POST — auth & ownership
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/person/:personId/photos — auth + ownership', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const handle = makeApp(d1, null);
    await seedOwnerAndTree(handle.db);
    await seedPerson(handle.db);
  });

  test('no session → 401', async () => {
    const handle = makeApp(d1, null);
    const res = await makeUploadReq(handle, '/api/tree/test-tree/person/person1/photos', makeFile({}));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  test('non-owner → 404 (anti-enumeration)', async () => {
    const handle = makeApp(d1, { id: 'other1', email: 'other@example.com' });
    const res = await makeUploadReq(handle, '/api/tree/test-tree/person/person1/photos', makeFile({}));
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('not_found');
  });
});

// ---------------------------------------------------------------------------
// Suite: POST — person not in tree
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/person/:personId/photos — person not in tree', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(handle.db);
    // Create a second tree with its own person (cross-tree isolation test)
    await handle.db.insert(schema.trees).values({
      id: 'tree2',
      slug: 'other-tree',
      name: 'Other Tree',
      owner_id: 'owner1',
      visibility: 'public',
    });
    await handle.db.insert(schema.people).values({
      id: 'person-other',
      tree_id: 'tree2',
      name: 'Other Person',
      deceased: false,
    });
  });

  test('person in another tree → 404', async () => {
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    // person-other belongs to tree2, not test-tree
    const res = await makeUploadReq(handle, '/api/tree/test-tree/person/person-other/photos', makeFile({}));
    expect(res.status).toBe(404);
  });

  test('nonexistent person → 404', async () => {
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const res = await makeUploadReq(handle, '/api/tree/test-tree/person/no-such-person/photos', makeFile({}));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Suite: POST — validation errors
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/person/:personId/photos — validation errors', () => {
  let d1: SqliteD1Database;

  beforeEach(async () => {
    d1 = createSqliteD1();
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    await seedOwnerAndTree(handle.db);
    await seedPerson(handle.db);
  });

  test('no "file" field → 400 no_file', async () => {
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    // null triggers empty FormData (no "file" field)
    const res = await makeUploadReq(handle, '/api/tree/test-tree/person/person1/photos', null);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('no_file');
  });

  test('unsupported MIME type → 415 unsupported_type', async () => {
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const file = makeFile({ name: 'document.pdf', type: 'application/pdf' });
    const res = await makeUploadReq(handle, '/api/tree/test-tree/person/person1/photos', file);
    expect(res.status).toBe(415);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unsupported_type');
  });

  test('file too large (> 5 MB) → 413 too_large', async () => {
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' });
    const overLimit = 5 * 1024 * 1024 + 1;
    const file = makeFile({ sizeBytes: overLimit });
    const res = await makeUploadReq(handle, '/api/tree/test-tree/person/person1/photos', file);
    expect(res.status).toBe(413);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('too_large');
  });
});

// ---------------------------------------------------------------------------
// Suite: POST — happy path (201)
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/person/:personId/photos — happy path', () => {
  let d1: SqliteD1Database;
  let sharedPhotos: PhotosBucketMock;

  beforeEach(async () => {
    d1 = createSqliteD1();
    sharedPhotos = new PhotosBucketMock();
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    await seedOwnerAndTree(handle.db);
    await seedPerson(handle.db);
  });

  test('201 with photo id/key/url; row persisted in DB; R2 key present', async () => {
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    const file = makeFile({ name: 'me.jpg', type: 'image/jpeg', sizeBytes: 2048 });

    const res = await makeUploadReq(handle, '/api/tree/test-tree/person/person1/photos', file);
    expect(res.status).toBe(201);

    const body = await res.json() as { photo: { id: string; key: string; url: string } };
    expect(body.photo).toBeDefined();
    const { id, key, url } = body.photo;

    // Key layout: photos/${treeId}/${personId}/${26-char-ULID}.${ext}
    expect(key).toMatch(/^photos\/tree1\/person1\/[A-Z0-9]{26}\.jpg$/);
    expect(url).toBe(`/api/img/${key}`);

    // DB row persisted with correct fields
    const row = await handle.db.query.photos.findFirst({
      where: eq(schema.photos.id, id),
    });
    expect(row).toBeDefined();
    expect(row!.person_id).toBe('person1');
    expect(row!.object_key).toBe(key);
    expect(row!.mime).toBe('image/jpeg');
    expect(row!.bytes).toBe(2048);
    expect(row!.uploaded_by).toBe('owner1');

    // R2 object written
    expect(sharedPhotos.has(key)).toBe(true);
  });

  test('jpeg → .jpg, png → .png, webp → .webp extensions in key', async () => {
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);

    const cases: Array<[string, string, RegExp]> = [
      ['img.jpg',  'image/jpeg', /\.jpg$/],
      ['img.png',  'image/png',  /\.png$/],
      ['img.webp', 'image/webp', /\.webp$/],
    ];
    for (const [name, type, extPat] of cases) {
      const file = makeFile({ name, type });
      const res = await makeUploadReq(handle, '/api/tree/test-tree/person/person1/photos', file);
      expect(res.status).toBe(201);
      const body = await res.json() as { photo: { key: string } };
      expect(body.photo.key).toMatch(extPat);
    }
  });

  test('exact 5 MB boundary is accepted (not too_large)', async () => {
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    const file = makeFile({ sizeBytes: 5 * 1024 * 1024 });
    const res = await makeUploadReq(handle, '/api/tree/test-tree/person/person1/photos', file);
    expect(res.status).toBe(201);
  });

  test('key satisfies img.ts KEY_RE regex', async () => {
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    const res = await makeUploadReq(handle, '/api/tree/test-tree/person/person1/photos', makeFile({}));
    expect(res.status).toBe(201);
    const { photo } = await res.json() as { photo: { key: string } };

    // Must match exactly the regex from img.ts (H5 hardened key layout)
    const KEY_RE = /^photos\/[a-z0-9-]+\/[a-z0-9-]+\/[A-Z0-9]{26}\.(jpe?g|png|webp)$/;
    expect(KEY_RE.test(photo.key)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite: DELETE — happy path and error cases
// ---------------------------------------------------------------------------

describe('DELETE /api/tree/:slug/person/:personId/photos/:photoId', () => {
  let d1: SqliteD1Database;
  let sharedPhotos: PhotosBucketMock;

  beforeEach(async () => {
    d1 = createSqliteD1();
    sharedPhotos = new PhotosBucketMock();
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    await seedOwnerAndTree(handle.db);
    await seedPerson(handle.db);
  });

  /** Helper: upload a photo as owner1 and return { id, key }. */
  async function uploadPhoto(): Promise<{ id: string; key: string }> {
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    const res = await makeUploadReq(handle, '/api/tree/test-tree/person/person1/photos', makeFile({}));
    expect(res.status).toBe(201);
    const body = await res.json() as { photo: { id: string; key: string } };
    return body.photo;
  }

  test('DELETE 200 { ok: true }; DB row gone; R2 key removed', async () => {
    const { id: photoId, key } = await uploadPhoto();

    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);

    // Confirm presence before delete
    expect(sharedPhotos.has(key)).toBe(true);
    const rowBefore = await handle.db.query.photos.findFirst({
      where: eq(schema.photos.id, photoId),
    });
    expect(rowBefore).toBeDefined();

    const res = await makeDeleteReq(handle, `/api/tree/test-tree/person/person1/photos/${photoId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    // R2 object deleted
    expect(sharedPhotos.has(key)).toBe(false);
    expect(sharedPhotos.deletedKeys).toContain(key);

    // DB row removed
    const rowAfter = await handle.db.query.photos.findFirst({
      where: eq(schema.photos.id, photoId),
    });
    expect(rowAfter).toBeUndefined();
  });

  test('DELETE nonexistent photoId → 404', async () => {
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    const res = await makeDeleteReq(handle, '/api/tree/test-tree/person/person1/photos/nonexistent-id');
    expect(res.status).toBe(404);
  });

  test('DELETE photo belonging to a different person → 404 (cross-person isolation)', async () => {
    const setup = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);

    // Seed a second person in the same tree
    await setup.db.insert(schema.people).values({
      id: 'person2',
      tree_id: 'tree1',
      name: 'Person Two',
      deceased: false,
    });

    // Upload to person2
    const fd = new FormData();
    fd.append('file', makeFile({}), 'photo.jpg');
    const uploadRes = await setup.app.fetch(
      new Request('http://localhost/api/tree/test-tree/person/person2/photos', {
        method: 'POST',
        body: fd,
      }),
      setup.env,
    );
    expect(uploadRes.status).toBe(201);
    const { photo } = await uploadRes.json() as { photo: { id: string } };

    // Attempt to delete via person1's URL — should 404 (not found for this person)
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    const res = await makeDeleteReq(handle, `/api/tree/test-tree/person/person1/photos/${photo.id}`);
    expect(res.status).toBe(404);
  });

  test('DELETE — non-owner → 404 (anti-enumeration)', async () => {
    const { id: photoId } = await uploadPhoto();

    const otherHandle = makeApp(d1, { id: 'other1', email: 'other@example.com' }, sharedPhotos);
    const res = await makeDeleteReq(otherHandle, `/api/tree/test-tree/person/person1/photos/${photoId}`);
    expect(res.status).toBe(404);
  });

  test('DELETE — no session → 401', async () => {
    const { id: photoId } = await uploadPhoto();

    const anonHandle = makeApp(d1, null, sharedPhotos);
    const res = await makeDeleteReq(anonHandle, `/api/tree/test-tree/person/person1/photos/${photoId}`);
    expect(res.status).toBe(401);
  });

  test('DELETE — person in a different tree → 404', async () => {
    // person-tree2 is in tree2; photo belongs to person1 in tree1
    const setup = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    await setup.db.insert(schema.trees).values({
      id: 'tree2',
      slug: 'other-tree',
      name: 'Other Tree',
      owner_id: 'owner1',
      visibility: 'public',
    });
    await setup.db.insert(schema.people).values({
      id: 'person-tree2',
      tree_id: 'tree2',
      name: 'Tree2 Person',
      deceased: false,
    });

    const { id: photoId } = await uploadPhoto();

    // Attempt to delete person1's photo via other-tree/person-tree2 URL
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    const res = await makeDeleteReq(
      handle,
      `/api/tree/other-tree/person/person-tree2/photos/${photoId}`,
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Suite: POST then verify data integrity (GET tree path simulation)
// ---------------------------------------------------------------------------

describe('POST photo — data integrity (img-path + db verification)', () => {
  let d1: SqliteD1Database;
  let sharedPhotos: PhotosBucketMock;

  beforeEach(async () => {
    d1 = createSqliteD1();
    sharedPhotos = new PhotosBucketMock();
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    await seedOwnerAndTree(handle.db);
    await seedPerson(handle.db);
  });

  test('photos row queryable by person_id (as tree-query.ts would do)', async () => {
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    const file = makeFile({ name: 'portrait.png', type: 'image/png', sizeBytes: 512 });

    const res = await makeUploadReq(handle, '/api/tree/test-tree/person/person1/photos', file);
    expect(res.status).toBe(201);
    const { photo } = await res.json() as { photo: { id: string; key: string; url: string } };

    // Key must be accepted by img.ts KEY_RE (H5 hardened layout)
    const KEY_RE = /^photos\/[a-z0-9-]+\/[a-z0-9-]+\/[A-Z0-9]{26}\.(jpe?g|png|webp)$/;
    expect(KEY_RE.test(photo.key)).toBe(true);

    // URL correctly points to /api/img/<key>
    expect(photo.url).toBe(`/api/img/${photo.key}`);

    // DB row accessible by person_id (what tree-query.ts photoCounts / photos map does)
    const photoRow = await handle.db.query.photos.findFirst({
      where: eq(schema.photos.person_id, 'person1'),
    });
    expect(photoRow).toBeDefined();
    expect(photoRow!.object_key).toBe(photo.key);
    expect(photoRow!.mime).toBe('image/png');
    expect(photoRow!.bytes).toBe(512);
  });

  test('multiple uploads for same person accumulate distinct keys', async () => {
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    const upload = (name: string) =>
      makeUploadReq(handle, '/api/tree/test-tree/person/person1/photos', makeFile({ name }));

    const r1 = await upload('a.jpg');
    const r2 = await upload('b.jpg');
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);

    const { photo: p1 } = await r1.json() as { photo: { key: string } };
    const { photo: p2 } = await r2.json() as { photo: { key: string } };
    expect(p1.key).not.toBe(p2.key);
  });
});

// ---------------------------------------------------------------------------
// Suite: per-owner rate limit on photo mutations (upload + delete)
// ---------------------------------------------------------------------------

describe('photo mutations — per-owner rate limit', () => {
  let d1: SqliteD1Database;
  let sharedPhotos: PhotosBucketMock;

  beforeEach(async () => {
    d1 = createSqliteD1();
    sharedPhotos = new PhotosBucketMock();
    const handle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    await seedOwnerAndTree(handle.db);
    await seedPerson(handle.db);
  });

  test('POST over the budget → 429 rate_limited (no R2 write)', async () => {
    const handle = makeApp(
      d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos, makeSaturatedKv(),
    );
    const res = await makeUploadReq(handle, '/api/tree/test-tree/person/person1/photos', makeFile({}));
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('rate_limited');
    // Limiter fires before the multipart parse + R2 put → bucket received no object.
    expect(sharedPhotos.objectCount).toBe(0);
  });

  test('counter increments through the route: PHOTO_MUTATE_MAX uploads OK, next → 429', async () => {
    // A real in-memory KV shared across requests proves the route-level cap
    // actually fires (right max/window wired, count persists between calls).
    const kv = makeCountingKv();
    const handle = makeApp(
      d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos, kv,
    );

    for (let i = 0; i < PHOTO_MUTATE_MAX; i++) {
      const res = await makeUploadReq(
        handle, '/api/tree/test-tree/person/person1/photos', makeFile({ name: `p${i}.jpg` }),
      );
      expect(res.status).toBe(201);
    }
    // The (MAX+1)-th upload in the same window is rejected.
    const over = await makeUploadReq(
      handle, '/api/tree/test-tree/person/person1/photos', makeFile({ name: 'over.jpg' }),
    );
    expect(over.status).toBe(429);
    const body = await over.json() as { error: string };
    expect(body.error).toBe('rate_limited');
    // Exactly MAX objects were written, not MAX+1.
    expect(sharedPhotos.objectCount).toBe(PHOTO_MUTATE_MAX);
  });

  test('DELETE over the budget → 429 rate_limited', async () => {
    // Upload a photo first with an unthrottled handle (no KV).
    const upHandle = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    const upRes = await makeUploadReq(
      upHandle, '/api/tree/test-tree/person/person1/photos', makeFile({}),
    );
    expect(upRes.status).toBe(201);
    const { photo } = await upRes.json() as { photo: { id: string; key: string } };

    // Now attempt DELETE with a saturated limiter → 429, photo untouched.
    const handle = makeApp(
      d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos, makeSaturatedKv(),
    );
    const res = await makeDeleteReq(
      handle, `/api/tree/test-tree/person/person1/photos/${photo.id}`,
    );
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('rate_limited');
    // The R2 object must NOT have been deleted (guard fires before R2/DB delete).
    expect(sharedPhotos.has(photo.key)).toBe(true);
  });

  test('rate limit is keyed per owner — two owners share one KV without interfering', async () => {
    // The limiter key embeds the user id (`rl:photo-mutate:<userId>:<window>`),
    // so two distinct owners hitting the SAME KV namespace get independent
    // budgets — neither consumes the other's allowance.
    const kv = makeCountingKv();

    // Seed a second owner + tree + person.
    const setup = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos);
    await setup.db.insert(schema.users).values({
      id: 'owner2', email: 'owner2@example.com', email_verified_at: 1,
    });
    await setup.db.insert(schema.trees).values({
      id: 'tree2', slug: 'tree-two', name: 'Tree Two', owner_id: 'owner2', visibility: 'public',
    });
    await setup.db.insert(schema.people).values({
      id: 'person2', tree_id: 'tree2', name: 'Person Two', deceased: false,
    });

    const h1 = makeApp(d1, { id: 'owner1', email: 'owner@example.com' }, sharedPhotos, kv);
    const h2 = makeApp(d1, { id: 'owner2', email: 'owner2@example.com' }, sharedPhotos, kv);

    const r1 = await makeUploadReq(h1, '/api/tree/test-tree/person/person1/photos', makeFile({}));
    const r2 = await makeUploadReq(h2, '/api/tree/tree-two/person/person2/photos', makeFile({}));
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
  });
});
