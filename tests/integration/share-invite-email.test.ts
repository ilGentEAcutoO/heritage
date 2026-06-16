/**
 * Integration tests for share-invitation email behaviour.
 *
 * Covers task 1 (sendShareInvitationEmail) and task 2 (best-effort send in
 * POST /:slug/shares) from ws09 Stage 3 contract.
 *
 * We mount the sharesRouter with a mock EMAIL binding injected via c.env so
 * the tests exercise the real route code path without hitting Cloudflare.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import * as schema from '../../src/db/schema';
import { sharesRouter } from '../../src/worker/routes/shares';
import type { HonoEnv } from '../../src/worker/types';
import type { SendEmailBinding } from '../../src/worker/lib/email';

// ---------------------------------------------------------------------------
// Mock EMAIL binding
// ---------------------------------------------------------------------------

function makeMockEmail(throwOnSend = false): SendEmailBinding & { calls: Parameters<SendEmailBinding['send']>[] } {
  const calls: Parameters<SendEmailBinding['send']>[] = [];
  return {
    calls,
    async send(msg) {
      if (throwOnSend) throw new Error('EMAIL binding error (simulated)');
      calls.push([msg]);
    },
  };
}

// ---------------------------------------------------------------------------
// App factory — accepts an optional EMAIL binding and APP_URL
// ---------------------------------------------------------------------------

async function setup(
  asUser: { id: string; email: string; displayName?: string | null } | null = null,
  emailBinding?: (SendEmailBinding & { calls: Parameters<SendEmailBinding['send']>[] }) | null,
  appUrl?: string,
) {
  const d1 = createSqliteD1();
  const db = drizzle(d1 as unknown as D1Database, { schema });
  const app = new Hono<HonoEnv>();

  // Inject db
  app.use(async (c, next) => {
    c.set('db', db);
    return next();
  });

  // Inject user
  app.use(async (c, next) => {
    c.set(
      'user',
      asUser
        ? {
            ...asUser,
            displayName: asUser.displayName ?? null,
            email_verified_at: 1,
          }
        : null,
    );
    return next();
  });

  // Inject EMAIL binding and APP_URL into c.env (best-effort; Hono sets env
  // from the platform fetch event, but in tests we patch the raw env object)
  if (emailBinding !== undefined || appUrl !== undefined) {
    app.use(async (c, next) => {
      // @ts-expect-error — mutating env in tests only
      if (emailBinding !== undefined && emailBinding !== null) c.env = { ...c.env, EMAIL: emailBinding };
      if (appUrl !== undefined) c.env = { ...(c.env ?? {}), APP_URL: appUrl };
      return next();
    });
  }

  app.route('/api/tree', sharesRouter);
  return { app, db, d1 };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedOwnerAndTree(db: ReturnType<typeof drizzle<typeof schema>>) {
  await db.insert(schema.users).values({
    id: 'owner1',
    email: 'owner@example.com',
    display_name: 'Tree Owner',
    email_verified_at: 1,
  });
  await db.insert(schema.trees).values({
    id: 'tree1',
    slug: 'test-tree',
    name: 'Test Tree',
    owner_id: 'owner1',
    visibility: 'private',
  });
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

function makeReq(app: Hono<HonoEnv>, method: string, path: string, body?: unknown) {
  const opts: RequestInit = { method };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { 'Content-Type': 'application/json' };
  }
  return app.fetch(new Request(`http://localhost${path}`, opts));
}

// ---------------------------------------------------------------------------
// Suite: email binding is called on successful invite
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/shares — email invitation', () => {
  test('binding.send is called with the invitee email as `to`', async () => {
    const emailMock = makeMockEmail();
    const { app, db } = await setup(
      { id: 'owner1', email: 'owner@example.com', displayName: 'Tree Owner' },
      emailMock,
      'https://heritage.example.com',
    );
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'invitee@example.com',
    });

    expect(res.status).toBe(201);
    expect(emailMock.calls).toHaveLength(1);
    const [msg] = emailMock.calls[0];
    expect(msg.to).toBe('invitee@example.com');
  });

  test('subject references the tree name', async () => {
    const emailMock = makeMockEmail();
    const { app, db } = await setup(
      { id: 'owner1', email: 'owner@example.com', displayName: 'Tree Owner' },
      emailMock,
      'https://heritage.example.com',
    );
    await seedOwnerAndTree(db);

    await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'invitee@example.com',
    });

    const [msg] = emailMock.calls[0];
    expect(msg.subject).toContain('Test Tree');
  });

  test('email body (text) contains the tree URL', async () => {
    const emailMock = makeMockEmail();
    const { app, db } = await setup(
      { id: 'owner1', email: 'owner@example.com', displayName: 'Tree Owner' },
      emailMock,
      'https://heritage.example.com',
    );
    await seedOwnerAndTree(db);

    await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'invitee@example.com',
    });

    const [msg] = emailMock.calls[0];
    const body = (msg.text ?? '') + (msg.html ?? '');
    expect(body).toContain('https://heritage.example.com/tree/test-tree');
  });

  test('email body references the tree name', async () => {
    const emailMock = makeMockEmail();
    const { app, db } = await setup(
      { id: 'owner1', email: 'owner@example.com', displayName: 'Tree Owner' },
      emailMock,
      'https://heritage.example.com',
    );
    await seedOwnerAndTree(db);

    await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'invitee@example.com',
    });

    const [msg] = emailMock.calls[0];
    const body = (msg.text ?? '') + (msg.html ?? '');
    expect(body).toContain('Test Tree');
  });
});

// ---------------------------------------------------------------------------
// Suite: best-effort — email error must NOT fail the invite
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/shares — best-effort email (binding throws)', () => {
  test('returns 201 and creates the share row even when binding.send throws', async () => {
    const throwingEmail = makeMockEmail(/* throwOnSend */ true);
    const { app, db } = await setup(
      { id: 'owner1', email: 'owner@example.com' },
      throwingEmail,
      'https://heritage.example.com',
    );
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'bob@example.com',
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { share: Record<string, unknown> };
    expect(body.share.email).toBe('bob@example.com');
    expect(body.share.status).toBe('pending');
  });

  test('share row is persisted in DB even when binding.send throws', async () => {
    const throwingEmail = makeMockEmail(true);
    const { app, db } = await setup(
      { id: 'owner1', email: 'owner@example.com' },
      throwingEmail,
    );
    await seedOwnerAndTree(db);

    await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'carol@example.com',
    });

    const shares = await db.query.tree_shares.findMany();
    expect(shares).toHaveLength(1);
    expect(shares[0].email).toBe('carol@example.com');
  });
});

// ---------------------------------------------------------------------------
// Suite: auto-accept for existing verified user still works
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/shares — existing verified user auto-accepts', () => {
  test('invite auto-accepts and returns 201 with status=accepted', async () => {
    const emailMock = makeMockEmail();
    const { app, db } = await setup(
      { id: 'owner1', email: 'owner@example.com' },
      emailMock,
      'https://heritage.example.com',
    );
    await seedOwnerAndTree(db);

    // Create a pre-existing verified user
    await db.insert(schema.users).values({
      id: 'diana1',
      email: 'diana@example.com',
      email_verified_at: 999,
    });

    const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'diana@example.com',
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { share: Record<string, unknown> };
    expect(body.share.status).toBe('accepted');
    expect(body.share.user_id).toBe('diana1');
    // Email should still be sent for notification purposes
    expect(emailMock.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Suite: no EMAIL binding — invite still succeeds silently
// ---------------------------------------------------------------------------

describe('POST /api/tree/:slug/shares — no EMAIL binding present', () => {
  test('invite returns 201 without throwing when c.env.EMAIL is absent', async () => {
    // setup with emailBinding=null means we do NOT inject EMAIL into c.env
    const { app, db } = await setup(
      { id: 'owner1', email: 'owner@example.com' },
      null, // no EMAIL binding
    );
    await seedOwnerAndTree(db);

    const res = await makeReq(app, 'POST', '/api/tree/test-tree/shares', {
      email: 'nomail@example.com',
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { share: Record<string, unknown> };
    expect(body.share.email).toBe('nomail@example.com');
  });
});
