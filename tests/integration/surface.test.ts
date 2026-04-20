/**
 * Surface tests — assert that every deleted route now returns 404.
 *
 * Covers:
 *   - All auth routes (deleted)
 *   - POST /api/upload (deleted)
 *   - All tree mutation routes (deleted)
 */

import { describe, test, expect } from 'vitest';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import { R2BucketStub, KVNamespaceStub } from '../helpers/mock-env';

async function importApp() {
  const mod = await import('../../src/worker/index');
  return mod.default;
}

function makeEnv() {
  const d1 = createSqliteD1();
  const r2 = new R2BucketStub();
  const kv = new KVNamespaceStub();
  return {
    DB: d1 as unknown as D1Database,
    PHOTOS: r2 as unknown as R2Bucket,
    KV_RL: kv as unknown as KVNamespace,
    ASSETS: {
      fetch: async () => new Response('not found', { status: 404 }),
    } as unknown as Fetcher,
    APP_URL: 'http://localhost:5173',
  };
}

async function hit(
  method: string,
  path: string,
  env: ReturnType<typeof makeEnv>,
): Promise<Response> {
  const handler = await importApp();
  const url = `http://localhost${path}`;
  const req = new Request(url, { method });
  return handler.fetch(req, env, {} as ExecutionContext);
}

describe('deleted routes → 404', () => {
  const env = makeEnv();

  test('GET /api/auth/me → 404', async () => {
    const res = await hit('GET', '/api/auth/me', env);
    expect(res.status).toBe(404);
  });

  test('POST /api/auth/request → 404', async () => {
    const res = await hit('POST', '/api/auth/request', env);
    expect(res.status).toBe(404);
  });

  test('GET /api/auth/verify → 404', async () => {
    const res = await hit('GET', '/api/auth/verify?tk=x', env);
    expect(res.status).toBe(404);
  });

  test('POST /api/auth/logout → 404', async () => {
    const res = await hit('POST', '/api/auth/logout', env);
    expect(res.status).toBe(404);
  });

  test('POST /api/upload → 404', async () => {
    const res = await hit('POST', '/api/upload', env);
    expect(res.status).toBe(404);
  });

  test('POST /api/tree/some-slug/people → 404', async () => {
    const res = await hit('POST', '/api/tree/some-slug/people', env);
    expect(res.status).toBe(404);
  });

  test('POST /api/tree/some-slug/relations → 404', async () => {
    const res = await hit('POST', '/api/tree/some-slug/relations', env);
    expect(res.status).toBe(404);
  });

  test('POST /api/tree/some-slug/stories → 404', async () => {
    const res = await hit('POST', '/api/tree/some-slug/stories', env);
    expect(res.status).toBe(404);
  });

  test('PUT /api/tree/some-slug/overrides → 404', async () => {
    const res = await hit('PUT', '/api/tree/some-slug/overrides', env);
    expect(res.status).toBe(404);
  });

  test('PATCH /api/tree/some-slug → 404', async () => {
    const res = await hit('PATCH', '/api/tree/some-slug', env);
    expect(res.status).toBe(404);
  });

  test('POST /api/tree (create) → 404', async () => {
    const res = await hit('POST', '/api/tree', env);
    expect(res.status).toBe(404);
  });
});
