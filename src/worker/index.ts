/**
 * Heritage Worker entry.
 *
 * Hono handles `/api/*`; everything else is served from the ASSETS binding
 * (Vite-built SPA). `run_worker_first: ["/api/*"]` in wrangler.jsonc makes
 * this routing deterministic even when the asset path matches.
 *
 * Middleware order is significant:
 *   1. securityHeaders — outermost; layered onto every response
 *   2. dbMiddleware — every request gets c.var.db
 *   3. route handlers
 *
 * The fetch handler validates `env` on first request (M2). A failed
 * validation returns an opaque 500 — we don't leak config details to clients.
 */
import { Hono } from 'hono';
import { treeRouter } from './routes/tree';
import imgRouter from './routes/img';
import { authRouter } from './routes/auth';
import { sharesRouter } from './routes/shares';
import { treesRouter } from './routes/trees';
import { dbMiddleware } from './middleware/db';
import { sessionMiddleware } from './middleware/session';
import { originCheck } from './middleware/origin-check';
import { securityHeaders, applySecurityHeaders } from './middleware/security-headers';
import { getValidatedEnv } from './lib/config';
import { deleteExpiredSessions } from './lib/session-cleanup';
import { createDb } from '../db/client';
import type { Env, HonoEnv } from './types';

export type { Env } from './types';

const app = new Hono<HonoEnv>();

// Middleware stack:
//   1. securityHeaders — outermost
//   2. dbMiddleware — c.var.db
//   3. sessionMiddleware — reads __Host-session cookie, sets c.var.user | null
//   4. originCheck — N-R3-2: CSRF defense-in-depth on mutation methods.
//      No-op on GET/HEAD/OPTIONS, so read traffic is unaffected.
//   5. routes
app.use('*', securityHeaders);
app.use('*', dbMiddleware);
app.use('*', sessionMiddleware);
app.use('*', originCheck);

app.get('/api/health', (c) => c.json({ ok: true, name: 'heritage', ts: Date.now() }));

app.route('/api/auth', authRouter);
app.route('/api/tree', sharesRouter); // paths: /api/tree/:slug/shares, /:slug/visibility
app.route('/api/tree', treeRouter);   // paths: /api/tree/:slug (gated read)
app.route('/api/trees', treesRouter);
app.route('/api/img', imgRouter);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      getValidatedEnv(env);
    } catch (err) {
      console.error('[worker] env validation failed:', err);
      return new Response('Server configuration error', { status: 500 });
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }
    // SPA/static-asset path bypasses Hono middleware, so apply security
    // headers here too (CSP/HSTS/X-CTO/Referrer-Policy/Permissions-Policy).
    const assetRes = await env.ASSETS.fetch(request);
    const secured = applySecurityHeaders(assetRes);

    // Versioned assets under /assets/* are content-addressed (Vite adds a
    // content hash to filenames), so they are safe to cache indefinitely.
    // Override Cache-Control here; security headers from applySecurityHeaders
    // are already present on `secured` and must not be disturbed.
    if (url.pathname.startsWith('/assets/')) {
      const out = new Response(secured.body, secured);
      out.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return out;
    }

    return secured;
  },

  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      getValidatedEnv(env);
      const db = createDb(env.DB);
      const count = await deleteExpiredSessions(db);
      console.log(JSON.stringify({ event: 'sessions_purged', count }));
    } catch (err) {
      console.error('[scheduled] session cleanup failed:', err);
    }
  },
} satisfies ExportedHandler<Env>;
