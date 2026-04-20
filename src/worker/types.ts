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

  // Vars (public config)
  APP_URL: string;
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
  };
};
