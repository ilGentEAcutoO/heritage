/**
 * Integration tests for GET /api/img/:key (read-only, no auth).
 *
 * Minimal smoke tests for the post-auth img route:
 *   - nonexistent key → 404
 *   - path-traversal attempt → 404 (key not in DB)
 *   - seeded photo row for public tree, object not in R2 → 404
 *   - seeded photo row for public tree, object in R2 → 200
 *   - seeded photo row for private tree → 403
 *
 * Full header / rate-limit assertions come in PR-2.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createSqliteD1, type SqliteD1Database } from '../helpers/sqlite-d1';
import { createDb } from '@db/client';
import { users, trees, tree_members, people, photos } from '@db/schema';
import imgRouter from '@worker/routes/img';
import { dbMiddleware } from '@worker/middleware/db';
import type { HonoEnv } from '@worker/types';
import { R2BucketStub, KVNamespaceStub } from '../helpers/mock-env';

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function makeApp(d1: SqliteD1Database, r2: R2BucketStub, kv: KVNamespaceStub) {
  const app = new Hono<HonoEnv>();
  app.use('*', dbMiddleware);
  app.route('/api/img', imgRouter);
  return app;
}

function makeEnv(d1: SqliteD1Database, r2: R2BucketStub, kv: KVNamespaceStub): Record<string, unknown> {
  return {
    DB: d1 as unknown as D1Database,
    PHOTOS: r2 as unknown as R2Bucket,
    KV_RL: kv as unknown as KVNamespace,
    ASSETS: null,
    APP_URL: 'http://localhost:5173',
  };
}

async function getImg(
  app: ReturnType<typeof makeApp>,
  key: string,
  env: Record<string, unknown>,
): Promise<Response> {
  const req = new Request(`http://localhost/api/img/${key}`, { method: 'GET' });
  return app.fetch(req, env);
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const OWNER_ID = 'img-owner-001';
const TREE_ID = 'img-tree-001';
const PERSON_ID = 'img-person-001';

async function seedPublicTree(d1: SqliteD1Database) {
  const db = createDb(d1 as unknown as D1Database);
  await db.insert(users).values({ id: OWNER_ID, email: 'owner@test.com', display_name: 'Owner' });
  await db.insert(trees).values({ id: TREE_ID, slug: 'img-tree', name: 'Img Tree', owner_id: OWNER_ID, is_public: true });
  await db.insert(tree_members).values({ id: 'mb-img-001', tree_id: TREE_ID, user_id: OWNER_ID, role: 'owner' });
  await db.insert(people).values({ id: PERSON_ID, tree_id: TREE_ID, name: 'Img Person', is_me: false, external: false });
}

async function seedPrivateTree(d1: SqliteD1Database) {
  const db = createDb(d1 as unknown as D1Database);
  await db.insert(users).values({ id: OWNER_ID, email: 'owner@test.com', display_name: 'Owner' });
  await db.insert(trees).values({ id: TREE_ID, slug: 'img-tree-priv', name: 'Private Img Tree', owner_id: OWNER_ID, is_public: false });
  await db.insert(tree_members).values({ id: 'mb-img-001', tree_id: TREE_ID, user_id: OWNER_ID, role: 'owner' });
  await db.insert(people).values({ id: PERSON_ID, tree_id: TREE_ID, name: 'Img Person', is_me: false, external: false });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/img/:key', () => {
  let d1: SqliteD1Database;
  let r2: R2BucketStub;
  let kv: KVNamespaceStub;
  let app: ReturnType<typeof makeApp>;
  let env: Record<string, unknown>;

  beforeEach(() => {
    d1 = createSqliteD1();
    r2 = new R2BucketStub();
    kv = new KVNamespaceStub();
    app = makeApp(d1, r2, kv);
    env = makeEnv(d1, r2, kv);
  });

  test('nonexistent key → 404', async () => {
    const res = await getImg(app, 'photos/nonexistent/key.jpg', env);
    expect(res.status).toBe(404);
  });

  test('path-traversal attempt → 404 (key not in DB)', async () => {
    // URL-encoded traversal: ..%2F..%2Fetc%2Fpasswd
    const req = new Request('http://localhost/api/img/..%2F..%2Fetc%2Fpasswd', { method: 'GET' });
    const res = await app.fetch(req, env);
    // Either 404 (no DB row) or 400 (rejected key) — must not be 200
    expect(res.status === 404 || res.status === 400).toBe(true);
  });

  test('seeded photo row for public tree, object not in R2 → 404', async () => {
    await seedPublicTree(d1);
    const db = createDb(d1 as unknown as D1Database);
    const objectKey = 'photos/img-person-001/fake.jpg';
    await db.insert(photos).values({
      id: 'photo-001',
      person_id: PERSON_ID,
      object_key: objectKey,
      mime: 'image/jpeg',
      bytes: 16,
      uploaded_by: OWNER_ID,
    });
    // R2 has no object → get() returns null → 404
    const res = await getImg(app, objectKey, env);
    expect(res.status).toBe(404);
  });

  test('seeded photo row for public tree with R2 object → 200 + correct headers', async () => {
    await seedPublicTree(d1);
    const db = createDb(d1 as unknown as D1Database);
    const objectKey = 'photos/img-person-001/real.jpg';
    await db.insert(photos).values({
      id: 'photo-002',
      person_id: PERSON_ID,
      object_key: objectKey,
      mime: 'image/jpeg',
      bytes: 16,
      uploaded_by: OWNER_ID,
    });
    // Seed R2 with valid JPEG magic bytes
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    r2.seed(objectKey, jpegBytes);

    const res = await getImg(app, objectKey, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
  });

  test('seeded photo row for private tree → 403', async () => {
    await seedPrivateTree(d1);
    const db = createDb(d1 as unknown as D1Database);
    const objectKey = 'photos/img-person-001/private.jpg';
    await db.insert(photos).values({
      id: 'photo-003',
      person_id: PERSON_ID,
      object_key: objectKey,
      mime: 'image/jpeg',
      bytes: 16,
      uploaded_by: OWNER_ID,
    });
    r2.seed(objectKey, new Uint8Array(16));

    const res = await getImg(app, objectKey, env);
    expect(res.status).toBe(403);
  });
});
