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
import { sessionMiddleware } from '@worker/middleware/session';
import type { HonoEnv } from '@worker/types';
import { R2BucketStub, KVNamespaceStub } from '../helpers/mock-env';
import {
  seedUser,
  seedSession,
  seedPrivateTree as fixturesSeedPrivateTree,
  seedSharedTree,
} from '../helpers/fixtures';

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function makeApp(_d1: SqliteD1Database, _r2: R2BucketStub, _kv: KVNamespaceStub) {
  const app = new Hono<HonoEnv>();
  app.use('*', dbMiddleware);
  app.use('*', sessionMiddleware); // so c.var.user is populated from __Host-session cookie
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
    SESSION_SECRET: 'test-secret-at-least-thirty-two-characters-long-padding',
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
    visibility: 'public',
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

async function seedPrivateTreeLocal(d1: SqliteD1Database): Promise<void> {
  const db = createDb(d1 as unknown as D1Database);
  await db.insert(users).values({ id: OWNER_ID, email: 'owner@test.com', display_name: 'Owner' });
  await db.insert(trees).values({
    id: TREE_ID,
    slug: 'priv-tree',
    name: 'Private Tree',
    owner_id: OWNER_ID,
    visibility: 'private',
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
    await seedPrivateTreeLocal(d1);
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

  // ------------------------------------------------------------------
  // visibility gate (H1) — IDOR fix S1-T1…S1-T8
  // ------------------------------------------------------------------

  describe('visibility gate (H1)', () => {
    // Helpers: unique IDs per test to avoid conflicts with existing seed data
    const newUlid = '01J0000000000000000000000B';
    const newKey = (treeId: string, personId: string) =>
      `photos/${treeId}/${personId}/${newUlid}.jpg`;

    async function insertPersonAndPhoto(
      d1: SqliteD1Database,
      treeId: string,
      personId: string,
      photoId: string,
      objectKey: string,
    ) {
      const db = createDb(d1 as unknown as D1Database);
      await db.insert(people).values({
        id: personId,
        tree_id: treeId,
        name: 'Subject',
        is_me: false,
        external: false,
      });
      await db.insert(photos).values({
        id: photoId,
        person_id: personId,
        object_key: objectKey,
        mime: 'image/jpeg',
        bytes: 16,
        uploaded_by: null,
      });
    }

    // S1-T1: visibility=private, anonymous → 403 (IDOR regression guard)
    // After S2: is_public column is dropped. Security intent is preserved:
    // a private tree must return 403 for anonymous requests regardless of any
    // legacy is_public value that may have existed before the migration.
    test('S1-T1: visibility=private, anonymous → 403 (IDOR regression guard)', async () => {
      const u1 = await seedUser(d1, { email: 's1t1-owner@test.com' });
      const { treeId } = await fixturesSeedPrivateTree(d1, {
        ownerId: u1.id,
        treeId: 's1t1-tree',
        slug: 's1t1-tree',
      });
      const personId = 's1t1-person';
      const key = newKey(treeId, personId);

      await insertPersonAndPhoto(d1, treeId, personId, 's1t1-photo', key);
      r2.seed(key, new Uint8Array(16));

      // Anonymous GET → must be 403 (visibility=private)
      const res = await getImg(app, key, env);
      expect(res.status).toBe(403);
    });

    // S1-T2: private + owner session → 200
    test('S1-T2: private tree + owner session → 200', async () => {
      const u1 = await seedUser(d1, { email: 's1t2-owner@test.com' });
      const { treeId } = await fixturesSeedPrivateTree(d1, { ownerId: u1.id, treeId: 's1t2-tree', slug: 's1t2-tree' });
      const personId = 's1t2-person';
      const key = newKey(treeId, personId);
      await insertPersonAndPhoto(d1, treeId, personId, 's1t2-photo', key);
      r2.seed(key, new Uint8Array(16));

      const { cookieHeader } = await seedSession(d1, u1.id);
      const res = await getImg(app, key, env, { Cookie: cookieHeader });
      expect(res.status).toBe(200);
    });

    // S1-T3: private + non-owner session → 403
    test('S1-T3: private tree + non-owner session → 403', async () => {
      const u1 = await seedUser(d1, { email: 's1t3-owner@test.com' });
      const u2 = await seedUser(d1, { email: 's1t3-other@test.com' });
      const { treeId } = await fixturesSeedPrivateTree(d1, { ownerId: u1.id, treeId: 's1t3-tree', slug: 's1t3-tree' });
      const personId = 's1t3-person';
      const key = newKey(treeId, personId);
      await insertPersonAndPhoto(d1, treeId, personId, 's1t3-photo', key);
      r2.seed(key, new Uint8Array(16));

      const { cookieHeader } = await seedSession(d1, u2.id);
      const res = await getImg(app, key, env, { Cookie: cookieHeader });
      expect(res.status).toBe(403);
    });

    // S1-T4: shared tree + accepted share (by user_id) → 200
    test('S1-T4: shared tree + accepted share user → 200', async () => {
      const u1 = await seedUser(d1, { email: 's1t4-owner@test.com' });
      const u2 = await seedUser(d1, { email: 's1t4-viewer@test.com' });
      const { treeId } = await seedSharedTree(d1, {
        ownerId: u1.id,
        treeId: 's1t4-tree',
        slug: 's1t4-tree',
        acceptedShareUserIds: [u2.id],
      });
      const personId = 's1t4-person';
      const key = newKey(treeId, personId);
      await insertPersonAndPhoto(d1, treeId, personId, 's1t4-photo', key);
      r2.seed(key, new Uint8Array(16));

      const { cookieHeader } = await seedSession(d1, u2.id);
      const res = await getImg(app, key, env, { Cookie: cookieHeader });
      expect(res.status).toBe(200);
    });

    // S1-T5: shared tree + pending share → 403
    test('S1-T5: shared tree + pending share → 403', async () => {
      const u1 = await seedUser(d1, { email: 's1t5-owner@test.com' });
      const u2 = await seedUser(d1, { email: 's1t5-pending@test.com' });
      const { treeId } = await seedSharedTree(d1, {
        ownerId: u1.id,
        treeId: 's1t5-tree',
        slug: 's1t5-tree',
        pendingShareUserIds: [u2.id],
      });
      const personId = 's1t5-person';
      const key = newKey(treeId, personId);
      await insertPersonAndPhoto(d1, treeId, personId, 's1t5-photo', key);
      r2.seed(key, new Uint8Array(16));

      const { cookieHeader } = await seedSession(d1, u2.id);
      const res = await getImg(app, key, env, { Cookie: cookieHeader });
      expect(res.status).toBe(403);
    });

    // S1-T6: shared tree + anonymous → 403
    test('S1-T6: shared tree + anonymous → 403', async () => {
      const u1 = await seedUser(d1, { email: 's1t6-owner@test.com' });
      const { treeId } = await seedSharedTree(d1, {
        ownerId: u1.id,
        treeId: 's1t6-tree',
        slug: 's1t6-tree',
      });
      const personId = 's1t6-person';
      const key = newKey(treeId, personId);
      await insertPersonAndPhoto(d1, treeId, personId, 's1t6-photo', key);
      r2.seed(key, new Uint8Array(16));

      const res = await getImg(app, key, env);
      expect(res.status).toBe(403);
    });

    // S1-T7: public tree + anonymous → 200 (regression guard with explicit visibility='public')
    test('S1-T7: public tree (visibility=public) + anonymous → 200', async () => {
      const db = createDb(d1 as unknown as D1Database);
      const u1 = await seedUser(d1, { email: 's1t7-owner@test.com' });
      const treeId = 's1t7-tree';
      const personId = 's1t7-person';
      const key = newKey(treeId, personId);

      await db.insert(trees).values({
        id: treeId,
        slug: 's1t7-tree',
        name: 'Public Tree',
        owner_id: u1.id,
        visibility: 'public',
      });
      await db.insert(tree_members).values({
        id: 's1t7-mb',
        tree_id: treeId,
        user_id: u1.id,
        role: 'owner',
      });
      await insertPersonAndPhoto(d1, treeId, personId, 's1t7-photo', key);
      r2.seed(key, new Uint8Array(16));

      const res = await getImg(app, key, env);
      expect(res.status).toBe(200);
    });

    // S1-T8: Cache-Control header varies by visibility
    test('S1-T8: Cache-Control is private for private/shared trees, public for public trees', async () => {
      // Part A: private + owner → 'private, max-age=60, must-revalidate'
      const u1a = await seedUser(d1, { email: 's1t8a-owner@test.com' });
      const { treeId: privTreeId } = await fixturesSeedPrivateTree(d1, {
        ownerId: u1a.id,
        treeId: 's1t8a-tree',
        slug: 's1t8a-tree',
      });
      const privPersonId = 's1t8a-person';
      const privKey = newKey(privTreeId, privPersonId);
      await insertPersonAndPhoto(d1, privTreeId, privPersonId, 's1t8a-photo', privKey);
      r2.seed(privKey, new Uint8Array(16));
      const { cookieHeader: cookieA } = await seedSession(d1, u1a.id);
      const resA = await getImg(app, privKey, env, { Cookie: cookieA });
      expect(resA.status).toBe(200);
      expect(resA.headers.get('cache-control')).toBe('private, max-age=60, must-revalidate');

      // Part B: shared + accepted share → 'private, max-age=60, must-revalidate'
      const u1b = await seedUser(d1, { email: 's1t8b-owner@test.com' });
      const u2b = await seedUser(d1, { email: 's1t8b-viewer@test.com' });
      const { treeId: sharedTreeId } = await seedSharedTree(d1, {
        ownerId: u1b.id,
        treeId: 's1t8b-tree',
        slug: 's1t8b-tree',
        acceptedShareUserIds: [u2b.id],
      });
      const sharedPersonId = 's1t8b-person';
      const sharedKey = newKey(sharedTreeId, sharedPersonId);
      await insertPersonAndPhoto(d1, sharedTreeId, sharedPersonId, 's1t8b-photo', sharedKey);
      r2.seed(sharedKey, new Uint8Array(16));
      const { cookieHeader: cookieB } = await seedSession(d1, u2b.id);
      const resB = await getImg(app, sharedKey, env, { Cookie: cookieB });
      expect(resB.status).toBe(200);
      expect(resB.headers.get('cache-control')).toBe('private, max-age=60, must-revalidate');

      // Part C: public + anonymous → 'public, max-age=60'
      const db = createDb(d1 as unknown as D1Database);
      const u1c = await seedUser(d1, { email: 's1t8c-owner@test.com' });
      const pubTreeId = 's1t8c-tree';
      const pubPersonId = 's1t8c-person';
      const pubKey = newKey(pubTreeId, pubPersonId);
      await db.insert(trees).values({
        id: pubTreeId,
        slug: 's1t8c-tree',
        name: 'Public Tree C',
        owner_id: u1c.id,
        visibility: 'public',
      });
      await db.insert(tree_members).values({
        id: 's1t8c-mb',
        tree_id: pubTreeId,
        user_id: u1c.id,
        role: 'owner',
      });
      await insertPersonAndPhoto(d1, pubTreeId, pubPersonId, 's1t8c-photo', pubKey);
      r2.seed(pubKey, new Uint8Array(16));
      const resC = await getImg(app, pubKey, env);
      expect(resC.status).toBe(200);
      expect(resC.headers.get('cache-control')).toBe('public, max-age=60');
    });
  });
});
