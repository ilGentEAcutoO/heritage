/**
 * Integration tests for POST /api/upload (single-step) and GET /api/img/:key.
 *
 * Uses createMockEnv() which provides a real SQLite-backed D1 shim so Drizzle
 * queries actually execute SQL — no hand-rolled condition-matching needed.
 *
 * Auth is controlled by a pre-flight middleware that injects c.var.user.
 * R2 is the R2BucketStub (in-memory, tracks puts/deletes).
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createDb } from '@db/client';
import { users, trees, tree_members, people, photos } from '@db/schema';
import type { HonoEnv, SessionUser } from '@worker/types';
import { createMockEnv, R2BucketStub, KVNamespaceStub } from '../helpers/mock-env';

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function buildApp(opts: {
  user?: SessionUser | null;
  r2?: R2BucketStub;
  kv?: KVNamespaceStub;
  dbHandle: ReturnType<typeof createMockEnv>;
}) {
  const { default: uploadRouter } = await import('@worker/routes/upload');
  const { default: imgRouter } = await import('@worker/routes/img');

  const { env, r2: defaultR2, kv: defaultKv } = opts.dbHandle;
  const r2 = opts.r2 ?? defaultR2;
  const kv = opts.kv ?? defaultKv;

  const patchedEnv = {
    ...env,
    PHOTOS: r2 as unknown as R2Bucket,
    KV_RL: kv as unknown as KVNamespace,
  };

  const app = new Hono<HonoEnv>();

  // Pre-flight: inject db + user
  app.use('*', async (c, next) => {
    const db = createDb(patchedEnv.DB);
    c.set('db', db);
    if (opts.user) {
      c.set('user', opts.user);
    }
    await next();
  });

  app.route('/api/upload', uploadRouter);
  app.route('/api/img', imgRouter);

  return { app, env: patchedEnv, r2, kv };
}

// ---------------------------------------------------------------------------
// Multipart form helpers
// ---------------------------------------------------------------------------

function makeMultipartForm(file: File, personId: string): FormData {
  const form = new FormData();
  form.append('file', file);
  form.append('personId', personId);
  return form;
}

function makePngFile(size = 32): File {
  const data = new Uint8Array(size);
  // PNG magic bytes
  data[0] = 0x89; data[1] = 0x50; data[2] = 0x4e; data[3] = 0x47;
  data[4] = 0x0d; data[5] = 0x0a; data[6] = 0x1a; data[7] = 0x0a;
  return new File([data], 'test.png', { type: 'image/png' });
}

function makeJpegFile(size = 32): File {
  const data = new Uint8Array(size);
  data[0] = 0xff; data[1] = 0xd8; data[2] = 0xff; data[3] = 0xe0;
  return new File([data], 'test.jpg', { type: 'image/jpeg' });
}

function makeWebpFile(size = 32): File {
  const data = new Uint8Array(size);
  // RIFF
  data[0] = 0x52; data[1] = 0x49; data[2] = 0x46; data[3] = 0x46;
  // size
  data[4] = 0x24; data[5] = 0x00; data[6] = 0x00; data[7] = 0x00;
  // WEBP
  data[8] = 0x57; data[9] = 0x45; data[10] = 0x42; data[11] = 0x50;
  return new File([data], 'test.webp', { type: 'image/webp' });
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const TEST_USER: SessionUser = {
  id: 'user-001',
  email: 'test@example.com',
  displayName: 'Test User',
};

const TEST_PERSON_ID = 'person-001';
const TEST_TREE_ID = 'tree-001';

async function seedBase(
  dbHandle: ReturnType<typeof createMockEnv>,
  opts: { role?: string; isPublic?: boolean } = {},
) {
  const db = createDb(dbHandle.env.DB);
  const role = opts.role ?? 'editor';
  const isPublic = opts.isPublic ?? false;

  await db.insert(users).values({
    id: TEST_USER.id,
    email: TEST_USER.email,
    display_name: TEST_USER.displayName,
  });

  await db.insert(trees).values({
    id: TEST_TREE_ID,
    slug: 'test-tree',
    name: 'Test Tree',
    owner_id: TEST_USER.id,
    is_public: isPublic,
  });

  await db.insert(tree_members).values({
    id: 'member-001',
    tree_id: TEST_TREE_ID,
    user_id: TEST_USER.id,
    role: role as 'owner' | 'editor' | 'viewer',
  });

  await db.insert(people).values({
    id: TEST_PERSON_ID,
    tree_id: TEST_TREE_ID,
    name: 'Test Person',
    is_me: false,
    external: false,
  });
}

// ---------------------------------------------------------------------------
// POST /api/upload
// ---------------------------------------------------------------------------

describe('POST /api/upload', () => {
  test('without auth → 401', async () => {
    const dbHandle = createMockEnv();
    const { app, env } = await buildApp({ user: null, dbHandle });

    const form = makeMultipartForm(makePngFile(), TEST_PERSON_ID);
    const res = await app.request('/api/upload', { method: 'POST', body: form }, env);
    expect(res.status).toBe(401);
  });

  test('with auth + valid PNG → 200 + photo row inserted + R2 put called once', async () => {
    const dbHandle = createMockEnv();
    await seedBase(dbHandle);
    const r2 = new R2BucketStub();
    const { app, env } = await buildApp({ user: TEST_USER, r2, dbHandle });

    const file = makePngFile();
    const form = makeMultipartForm(file, TEST_PERSON_ID);
    const res = await app.request('/api/upload', { method: 'POST', body: form }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { photo: { id: string; personId: string; url: string; mime: string; bytes: number } };

    expect(body.photo.personId).toBe(TEST_PERSON_ID);
    expect(body.photo.mime).toBe('image/png');
    expect(body.photo.bytes).toBe(file.size);
    expect(body.photo.url).toMatch(/^\/api\/img\/photos\/person-001\/[A-Z0-9]+\.png$/);

    // R2 should have exactly one object stored
    const key = body.photo.url.replace('/api/img/', '');
    expect(r2.has(key)).toBe(true);

    // DB row should exist
    const db = createDb(dbHandle.env.DB);
    const row = await db.query.photos.findFirst();
    expect(row).toBeDefined();
    expect(row?.object_key).toBe(key);
    expect(row?.mime).toBe('image/png');
    expect(row?.person_id).toBe(TEST_PERSON_ID);
    expect(row?.uploaded_by).toBe(TEST_USER.id);
  });

  test('with auth + valid JPEG → 200', async () => {
    const dbHandle = createMockEnv();
    await seedBase(dbHandle);
    const { app, env } = await buildApp({ user: TEST_USER, dbHandle });

    const form = makeMultipartForm(makeJpegFile(), TEST_PERSON_ID);
    const res = await app.request('/api/upload', { method: 'POST', body: form }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { photo: { mime: string } };
    expect(body.photo.mime).toBe('image/jpeg');
  });

  test('with auth + valid WebP → 200', async () => {
    const dbHandle = createMockEnv();
    await seedBase(dbHandle);
    const { app, env } = await buildApp({ user: TEST_USER, dbHandle });

    const form = makeMultipartForm(makeWebpFile(), TEST_PERSON_ID);
    const res = await app.request('/api/upload', { method: 'POST', body: form }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { photo: { mime: string } };
    expect(body.photo.mime).toBe('image/webp');
  });

  test('bad mime (image/gif) → 400', async () => {
    const dbHandle = createMockEnv();
    await seedBase(dbHandle);
    const { app, env } = await buildApp({ user: TEST_USER, dbHandle });

    const gifData = new Uint8Array(32);
    gifData[0] = 0x47; gifData[1] = 0x49; gifData[2] = 0x46; // GIF
    const file = new File([gifData], 'test.gif', { type: 'image/gif' });
    const form = makeMultipartForm(file, TEST_PERSON_ID);
    const res = await app.request('/api/upload', { method: 'POST', body: form }, env);

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/mime/i);
  });

  test('oversized body (>2MB) → 400', async () => {
    const dbHandle = createMockEnv();
    await seedBase(dbHandle);
    const { app, env } = await buildApp({ user: TEST_USER, dbHandle });

    const MAX_BYTES = 2 * 1024 * 1024;
    // Create a file that is slightly over 2MB with valid PNG magic bytes
    const bigData = new Uint8Array(MAX_BYTES + 1);
    bigData[0] = 0x89; bigData[1] = 0x50; bigData[2] = 0x4e; bigData[3] = 0x47;
    bigData[4] = 0x0d; bigData[5] = 0x0a; bigData[6] = 0x1a; bigData[7] = 0x0a;
    const file = new File([bigData], 'big.png', { type: 'image/png' });
    const form = makeMultipartForm(file, TEST_PERSON_ID);
    const res = await app.request('/api/upload', { method: 'POST', body: form }, env);

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/too large/i);
  });

  test('mime=PNG but magic bytes say JPEG → 400 (magic-byte check wins)', async () => {
    const dbHandle = createMockEnv();
    await seedBase(dbHandle);
    const { app, env } = await buildApp({ user: TEST_USER, dbHandle });

    // File with JPEG magic but declared as PNG
    const jpegData = new Uint8Array(32);
    jpegData[0] = 0xff; jpegData[1] = 0xd8; jpegData[2] = 0xff; jpegData[3] = 0xe0;
    const file = new File([jpegData], 'mismatch.png', { type: 'image/png' });
    const form = makeMultipartForm(file, TEST_PERSON_ID);
    const res = await app.request('/api/upload', { method: 'POST', body: form }, env);

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid_image/i);
  });

  test('valid auth but user has no role on the tree → 403', async () => {
    const dbHandle = createMockEnv();
    // Seed without any membership
    const db = createDb(dbHandle.env.DB);
    await db.insert(users).values({
      id: TEST_USER.id,
      email: TEST_USER.email,
      display_name: TEST_USER.displayName,
    });
    await db.insert(trees).values({
      id: TEST_TREE_ID,
      slug: 'test-tree',
      name: 'Test Tree',
      owner_id: TEST_USER.id,
      is_public: false,
    });
    // NO tree_members row
    await db.insert(people).values({
      id: TEST_PERSON_ID,
      tree_id: TEST_TREE_ID,
      name: 'Test Person',
      is_me: false,
      external: false,
    });

    const { app, env } = await buildApp({ user: TEST_USER, dbHandle });

    const form = makeMultipartForm(makePngFile(), TEST_PERSON_ID);
    const res = await app.request('/api/upload', { method: 'POST', body: form }, env);

    expect(res.status).toBe(403);
  });

  test('viewer role (not editor) → 403', async () => {
    const dbHandle = createMockEnv();
    await seedBase(dbHandle, { role: 'viewer' });
    const { app, env } = await buildApp({ user: TEST_USER, dbHandle });

    const form = makeMultipartForm(makePngFile(), TEST_PERSON_ID);
    const res = await app.request('/api/upload', { method: 'POST', body: form }, env);

    expect(res.status).toBe(403);
  });

  test('missing personId field → 400', async () => {
    const dbHandle = createMockEnv();
    await seedBase(dbHandle);
    const { app, env } = await buildApp({ user: TEST_USER, dbHandle });

    const form = new FormData();
    form.append('file', makePngFile());
    // personId omitted
    const res = await app.request('/api/upload', { method: 'POST', body: form }, env);

    expect(res.status).toBe(400);
  });

  test('missing file field → 400', async () => {
    const dbHandle = createMockEnv();
    await seedBase(dbHandle);
    const { app, env } = await buildApp({ user: TEST_USER, dbHandle });

    const form = new FormData();
    form.append('personId', TEST_PERSON_ID);
    // file omitted
    const res = await app.request('/api/upload', { method: 'POST', body: form }, env);

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/img/:key
// ---------------------------------------------------------------------------

describe('GET /api/img/:key', () => {
  test('public tree — serves image without auth → 200 + correct headers', async () => {
    const key = 'photos/person-001/PUBLIC.jpg';
    const dbHandle = createMockEnv();
    await seedBase(dbHandle, { isPublic: true });

    const db = createDb(dbHandle.env.DB);
    await db.insert(photos).values({
      id: key,
      person_id: TEST_PERSON_ID,
      object_key: key,
      mime: 'image/jpeg',
      bytes: 16,
      uploaded_by: TEST_USER.id,
    });

    const r2 = new R2BucketStub();
    r2.seed(key, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));

    const { app, env } = await buildApp({ user: null, r2, dbHandle });

    const res = await app.request(`/api/img/${key}`, {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
  });

  test('private tree without auth → 401', async () => {
    const key = 'photos/person-001/PRIVATE.jpg';
    const dbHandle = createMockEnv();
    await seedBase(dbHandle, { isPublic: false });

    const db = createDb(dbHandle.env.DB);
    await db.insert(photos).values({
      id: key,
      person_id: TEST_PERSON_ID,
      object_key: key,
      mime: 'image/jpeg',
      bytes: 16,
      uploaded_by: TEST_USER.id,
    });

    const r2 = new R2BucketStub();
    r2.seed(key, new Uint8Array(16));

    const { app, env } = await buildApp({ user: null, r2, dbHandle });

    const res = await app.request(`/api/img/${key}`, {}, env);
    expect(res.status).toBe(401);
  });

  test('private tree with auth + membership → 200 + private cache-control', async () => {
    const key = 'photos/person-001/AUTHED.jpg';
    const dbHandle = createMockEnv();
    await seedBase(dbHandle, { role: 'viewer', isPublic: false });

    const db = createDb(dbHandle.env.DB);
    await db.insert(photos).values({
      id: key,
      person_id: TEST_PERSON_ID,
      object_key: key,
      mime: 'image/jpeg',
      bytes: 16,
      uploaded_by: TEST_USER.id,
    });

    const r2 = new R2BucketStub();
    r2.seed(key, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));

    const { app, env } = await buildApp({ user: TEST_USER, r2, dbHandle });

    const res = await app.request(`/api/img/${key}`, {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
  });

  test('private tree with auth but no membership → 403', async () => {
    const key = 'photos/person-001/FORBIDDEN.jpg';
    const dbHandle = createMockEnv();
    const db = createDb(dbHandle.env.DB);

    await db.insert(users).values({
      id: TEST_USER.id,
      email: TEST_USER.email,
      display_name: TEST_USER.displayName,
    });
    await db.insert(trees).values({
      id: TEST_TREE_ID,
      slug: 'test-tree',
      name: 'Test Tree',
      owner_id: TEST_USER.id,
      is_public: false,
    });
    await db.insert(people).values({
      id: TEST_PERSON_ID,
      tree_id: TEST_TREE_ID,
      name: 'Test Person',
      is_me: false,
      external: false,
    });
    await db.insert(photos).values({
      id: key,
      person_id: TEST_PERSON_ID,
      object_key: key,
      mime: 'image/jpeg',
      bytes: 16,
      uploaded_by: TEST_USER.id,
    });

    const r2 = new R2BucketStub();
    r2.seed(key, new Uint8Array(16));

    const { app, env } = await buildApp({ user: TEST_USER, r2, dbHandle });

    const res = await app.request(`/api/img/${key}`, {}, env);
    expect(res.status).toBe(403);
  });

  test('nonexistent photo key → 404', async () => {
    const dbHandle = createMockEnv();
    const { app, env } = await buildApp({ user: TEST_USER, dbHandle });
    const res = await app.request('/api/img/photos/nonexistent/photo.jpg', {}, env);
    expect(res.status).toBe(404);
  });
});
