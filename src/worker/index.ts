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
import { dbMiddleware } from './middleware/db';
import { securityHeaders, applySecurityHeaders } from './middleware/security-headers';
import { getValidatedEnv } from './lib/config';
import type { Env, HonoEnv } from './types';

export type { Env } from './types';

const app = new Hono<HonoEnv>();

// Outermost: security headers. Must run before dbMiddleware so it wraps every
// downstream response including DB-error paths.
app.use('*', securityHeaders);
app.use('*', dbMiddleware);

app.get('/api/health', (c) => c.json({ ok: true, name: 'heritage', ts: Date.now() }));

app.route('/api/tree', treeRouter);
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
    return applySecurityHeaders(assetRes);
  },
} satisfies ExportedHandler<Env>;
