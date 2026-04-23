/**
 * Shared Worker types — Env bindings and Hono context variables.
 *
 * Imported by all routes and middleware. Keep the surface stable.
 */
import type { DB } from '../db/client';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  PHOTOS: R2Bucket;
  KV_RL: KVNamespace;

  // Email sending binding (Cloudflare Email Workers)
  EMAIL: SendEmail;

  // Rate-limit bindings
  RL_LOGIN: RateLimit;
  RL_LOGIN_IP: RateLimit;

  // Vars (public config)
  APP_URL: string;

  // Secrets (not in wrangler.jsonc; set via wrangler secret put or .dev.vars)
  SESSION_SECRET: string;
}

/**
 * Hono generic env — use `new Hono<HonoEnv>()` in every route module.
 *
 * `c.var.db` is guaranteed present (attached by dbMiddleware).
 */
export type HonoEnv = {
  Bindings: Env;
  Variables: {
    db: DB;
    user: { id: string; email: string; email_verified_at: number | null } | null;
  };
};
