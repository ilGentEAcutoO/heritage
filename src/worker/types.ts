/**
 * Shared Worker types — Env bindings, Hono context variables, session/user shapes.
 *
 * Imported by all routes and middleware. agent-tree-api and agent-upload
 * also import from here. Keep the surface stable.
 */
import type { DB } from '../db/client';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  PHOTOS: R2Bucket;
  KV_RL: KVNamespace;
  EMAIL: SendEmail;

  // Vars (public config)
  APP_URL: string;
  EMAIL_FROM: string;
  EMAIL_DEV_STUB: string;

  // Secrets (wrangler secret / .dev.vars)
  SESSION_SECRET: string;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: number; // unix seconds
}

/**
 * Hono generic env — use `new Hono<HonoEnv>()` in every route module.
 *
 * `c.var.db` is guaranteed present (attached by dbMiddleware).
 * `c.var.session` and `c.var.user` are set only if cookie resolves to a valid session.
 */
export type HonoEnv = {
  Bindings: Env;
  Variables: {
    db: DB;
    session?: Session;
    user?: SessionUser;
  };
};
