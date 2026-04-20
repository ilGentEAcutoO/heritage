/**
 * Integration tests for GET /api/img/:key (read-only, no auth).
 *
 * Coverage:
 *   - key shape validation (H5): only the tree-scoped ULID layout is accepted;
 *     old-format keys and path-traversal attempts 404
 *   - private tree → 403
 *   - public tree + object in R2 → 200 with the hardened security headers (H6)
 *   - IP trust (C3): `x-forwarded-for` is never consulted; requests with no
 *     `cf-connecting-ip` fall into the `__unknown__` bucket with a stricter cap
 *   - per-tree secondary cap (H3) fires once the tree-wide threshold is hit
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

function makeApp(_d1: SqliteD1Database, _r2: R2BucketStub, _kv: KVNamespaceStub) {
  const app = new Hono<HonoEnv>();
  app.use('*', dbMiddleware);
  app.route('/api/img', imgRouter);
  return app;
}

function makeEnv(
  d1: SqliteD1Database,
  r2: R2BucketStub,
  kv: KVNamespaceStub,
): Record<string, unknown> {
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
  headers: Record<string, string> = {},
): Promise<Response> {
  const req = new Request(`http://localhost/api/img/${key}`, {
    method: 'GET',
    headers,
  });
  return app.fetch(req, env);
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const OWNER_ID = 'img-owner-001';
const TREE_ID = 'demo-wongsuriya';
const TREE_SLUG = 'demo-wongsuriya';
const PERSON_ID = 'p1';

// A key that matches the post-PR-2 layout: photos/<treeId>/<personId>/<ULID>.<ext>
const VALID_ULID = '01J0000000000000000000000A'; // 26 Crockford-base32 chars
const VALID_KEY = `photos/${TREE_ID}/${PERSON_ID}/${VALID_ULID}.jpg`;

async function seedPublicTree(d1: SqliteD1Database): Promise<void> {
  const db = createDb(d1 as unknown as D1Database);
  await db.insert(users).values({ id: OWNER_ID, email: 'owner@test.com', display_name: 'Owner' });
  await db.insert(trees).values({
    id: TREE_ID,
    slug: TREE_SLUG,
    name: 'Public Tree',
    owner_id: OWNER_ID,
    is_public: true,
  });
  await db.insert(tree_members).values({
    id: 'mb-img-001',
    tree_id: TREE_ID,
    user_id: OWNER_ID,
    role: 'owner',
  });
  await db.insert(people).values({
    id: PERSON_ID,
    tree_id: TREE_ID,
    name: 'Subject',
    is_me: false,
    external: false,
  });
}

async function seedPrivateTree(d1: SqliteD1Database): Promise<void> {
  const db = createDb(d1 as unknown as D1Database);
  await db.insert(users).values({ id: OWNER_ID, email: 'owner@test.com', display_name: 'Owner' });
  await db.insert(trees).values({
    id: TREE_ID,
    slug: 'priv-tree',
    name: 'Private Tree',
    owner_id: OWNER_ID,
    is_public: false,
  });
  await db.insert(tree_members).values({
    id: 'mb-img-001',
    tree_id: TREE_ID,
    user_id: OWNER_ID,
    role: 'owner',
  });
  await db.insert(people).values({
    id: PERSON_ID,
    tree_id: TREE_ID,
    name: 'Subject',
    is_me: false,
    external: false,
  });
}

async function insertPhoto(
  d1: SqliteD1Database,
  photoId: string,
  objectKey: string,
): Promise<void> {
  const db = createDb(d1 as unknown as D1Database);
  await db.insert(photos).values({
    id: photoId,
    person_id: PERSON_ID,
    object_key: objectKey,
    mime: 'image/jpeg',
    bytes: 16,
    uploaded_by: OWNER_ID,
  });
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

  // ------------------------------------------------------------------
  // Key-shape validation (H5)
  // ------------------------------------------------------------------

  test('nonexistent key (new-format shape) → 404', async () => {
    const res = await getImg(
      app,
      `photos/nonexistent-tree/nobody/${VALID_ULID}.jpg`,
      env,
    );
    expect(res.status).toBe(404);
  });

  test('path-traversal attempt → 404', async () => {
    const req = new Request('http://localhost/api/img/photos/..%2F..%2Fetc%2Fpasswd', {
      method: 'GET',
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(404);
  });

  test('old-format key (photos/<personId>/<ulid>.jpg) → 404', async () => {
    // Even if a matching row existed, the shape check must reject before the DB lookup.
    // Seed a row with this legacy key to prove the 404 comes from the shape guard,
    // not from a missing row.
    await seedPublicTree(d1);
    const legacyKey = 'photos/p1/XYZ1234567890123456789012X.jpg';
    await insertPhoto(d1, 'photo-legacy', legacyKey);
    r2.seed(legacyKey, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));

    const res = await getImg(app, legacyKey, env);
    expect(res.status).toBe(404);
  });

  test('new-format key (photos/<treeId>/<personId>/<ULID>.jpg) is accepted', async () => {
    await seedPublicTree(d1);
    await insertPhoto(d1, 'photo-new', VALID_KEY);
    r2.seed(VALID_KEY, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));

    const res = await getImg(app, VALID_KEY, env);
    expect(res.status).toBe(200);
  });

  // ------------------------------------------------------------------
  // DB gating
  // ------------------------------------------------------------------

  test('valid-shape key but object not in R2 → 404', async () => {
    await seedPublicTree(d1);
    await insertPhoto(d1, 'photo-001', VALID_KEY);
    // R2 intentionally empty
    const res = await getImg(app, VALID_KEY, env);
    expect(res.status).toBe(404);
  });

  test('private tree → 403', async () => {
    await seedPrivateTree(d1);
    await insertPhoto(d1, 'photo-priv', VALID_KEY);
    r2.seed(VALID_KEY, new Uint8Array(16));

    const res = await getImg(app, VALID_KEY, env);
    expect(res.status).toBe(403);
  });

  // ------------------------------------------------------------------
  // H6 — response headers
  // ------------------------------------------------------------------

  test('200 response carries hardened security headers', async () => {
    await seedPublicTree(d1);
    await insertPhoto(d1, 'photo-200', VALID_KEY);
    r2.seed(VALID_KEY, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));

    const res = await getImg(app, VALID_KEY, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(res.headers.get('vary')).toBe('Cookie');

    const cd = res.headers.get('content-disposition');
    expect(cd).toBeTruthy();
    // Must be `inline; filename="..."` with the ULID filename
    expect(cd).toMatch(/^inline; filename="[^"/\\]+"$/);
    expect(cd).toContain(`${VALID_ULID}.jpg`);
  });

  // ------------------------------------------------------------------
  // C3 — IP trust: x-forwarded-for MUST NOT influence the bucket.
  // We prove this by exhausting the __unknown__ bucket's stricter cap
  // (RL_MAX_UNKNOWN = 15) while every request carries a unique spoofed XFF.
  // If x-forwarded-for were trusted, each request would go to its own bucket
  // and none would be rate-limited.
  // ------------------------------------------------------------------

  test('x-forwarded-for is not trusted; spoofed requests share the __unknown__ bucket', async () => {
    await seedPublicTree(d1);
    await insertPhoto(d1, 'photo-unk', VALID_KEY);
    r2.seed(VALID_KEY, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));

    const RL_MAX_UNKNOWN = 15;

    // First RL_MAX_UNKNOWN requests with unique spoofed XFF → all 200.
    for (let i = 0; i < RL_MAX_UNKNOWN; i++) {
      const res = await getImg(app, VALID_KEY, env, {
        'x-forwarded-for': `10.0.0.${i}`,
      });
      expect(res.status).toBe(200);
    }

    // Next one — still __unknown__ bucket because XFF is ignored — should be 429.
    const res = await getImg(app, VALID_KEY, env, {
      'x-forwarded-for': '10.0.0.99',
    });
    expect(res.status).toBe(429);
  });

  // ------------------------------------------------------------------
  // H3 — per-tree secondary cap fires after RL_MAX_PER_TREE hits, even
  // when requests come from many distinct trusted IPs.
  // ------------------------------------------------------------------

  test('per-tree secondary cap fires after 300 requests in window', async () => {
    await seedPublicTree(d1);
    await insertPhoto(d1, 'photo-tree-cap', VALID_KEY);
    r2.seed(VALID_KEY, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));

    const RL_MAX_PER_TREE = 300;

    // Rotate through many distinct trusted IPs so no per-IP bucket caps out.
    // Each IP does at most 50 hits ≪ RL_MAX (60). We do 300 total successes.
    let ipCounter = 0;
    for (let i = 0; i < RL_MAX_PER_TREE; i++) {
      if (i % 50 === 0) ipCounter++;
      const res = await getImg(app, VALID_KEY, env, {
        'cf-connecting-ip': `192.0.2.${ipCounter}`,
      });
      expect(res.status).toBe(200);
    }

    // 301st request — distinct IP (fresh per-IP bucket) but the tree bucket
    // is now full, so must 429.
    const res = await getImg(app, VALID_KEY, env, {
      'cf-connecting-ip': '192.0.2.250',
    });
    expect(res.status).toBe(429);
  });
});
