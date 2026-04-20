/**
 * Heritage Worker entry.
 *
 * Hono handles `/api/*`; everything else is served from the ASSETS binding
 * (Vite-built SPA). `run_worker_first: ["/api/*"]` in wrangler.jsonc makes
 * this routing deterministic even when the asset path matches.
 *
 * Middleware order is significant:
 *   1. dbMiddleware — every request gets c.var.db
 *   2. route handlers
 */
import { Hono } from 'hono';
import { treeRouter } from './routes/tree';
import imgRouter from './routes/img';
import { dbMiddleware } from './middleware/db';
import type { Env, HonoEnv } from './types';

export type { Env } from './types';

const app = new Hono<HonoEnv>();

app.use('*', dbMiddleware);

app.get('/api/health', (c) => c.json({ ok: true, name: 'heritage', ts: Date.now() }));

app.route('/api/tree', treeRouter);
app.route('/api/img', imgRouter);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
