/**
 * KV-backed sliding-window rate limiter.
 *
 * Usage:
 *   app.use('/api/auth/request', rateLimit({ key: emailFromBody, limit: 3, windowSec: 3600 }))
 *
 * The limiter groups requests into discrete buckets of `windowSec`, counting
 * how many requests fall into the *current* bucket. This is simpler than a
 * true sliding window and is acceptable here because:
 *
 *   1. We're rate-limiting, not authentication — KV's eventual consistency
 *      might let a handful of extra requests through but will never reject
 *      a legitimate user twice.
 *   2. Magic-link abuse is low-frequency and spikes are what we care about;
 *      a fixed window over 1 hour already bounds total email volume.
 *
 * We purposefully increment via a read-modify-write rather than a conditional
 * update. KV has no CAS; two parallel workers may race and under-count.
 * That's fine for the threat we're defending against (spam, not auth bypass).
 *
 * Key format: `rl:<scope>:<bucket>` where bucket = floor(now / windowSec).
 * TTL is set to 2*windowSec so old buckets self-expire.
 */
import type { Context, MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../types';

export interface RateLimitOptions {
  /** Logical scope prefix for key isolation, e.g. "auth:email" or "auth:ip". */
  scope: string;
  /** Extract the rate-limit key for this request. Return null to skip limiting. */
  key: (c: Context<HonoEnv>) => string | null | Promise<string | null>;
  /** Max requests per window. */
  limit: number;
  /** Window size in seconds. */
  windowSec: number;
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const subject = await opts.key(c);
    if (!subject) {
      // No identifiable subject — let the request through; other limiters may catch it.
      return next();
    }

    const now = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(now / opts.windowSec);
    const kvKey = `rl:${opts.scope}:${subject}:${bucket}`;
    const ttl = opts.windowSec * 2;

    const current = await c.env.KV_RL.get(kvKey);
    const count = current ? parseInt(current, 10) || 0 : 0;

    if (count >= opts.limit) {
      const bucketEnds = (bucket + 1) * opts.windowSec;
      const retryAfter = Math.max(1, bucketEnds - now);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'rate_limited', retry_after: retryAfter }, 429);
    }

    // Best-effort increment. We don't await-block on hot paths but we do
    // await here so subsequent requests in the same millisecond see the bump.
    await c.env.KV_RL.put(kvKey, String(count + 1), { expirationTtl: ttl });

    await next();
  };
}
