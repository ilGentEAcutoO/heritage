/**
 * rate-limit.ts — KV-backed fixed-window rate limiter (write/mutation paths).
 *
 * Mirrors the per-IP / per-tree limiter already used by img.ts (the read path),
 * extracted here so write endpoints (photo upload/delete, tree creation) can
 * share one implementation.
 *
 * KV get + put is NOT atomic, so under a concurrent burst the cap may be
 * exceeded by a small margin. This is the same tolerated race documented in
 * img.ts; acceptable for abuse-prevention (not for hard security invariants).
 */

/**
 * Returns true if the action is allowed (under the cap for the current window),
 * false if it should be rejected (429). No-op-allow if `kv` is absent (e.g.
 * unit/integration harness without the KV binding) so callers can guard with a
 * simple `if (kv) { ... }`.
 *
 * @param kv        the KV_RL namespace
 * @param bucket    a namespace for the limiter (e.g. 'photo-upload', 'tree-create')
 * @param key       the per-subject key (e.g. a user id or IP)
 * @param max       max actions allowed per window
 * @param windowSecs window length in seconds
 */
export async function checkRateLimit(
  kv: KVNamespace,
  bucket: string,
  key: string,
  max: number,
  windowSecs: number,
): Promise<boolean> {
  const window = Math.floor(Date.now() / 1000 / windowSecs);
  const kvKey = `rl:${bucket}:${key}:${window}`;
  const raw = await kv.get(kvKey);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= max) return false;
  // TTL = 2 windows so the counter self-expires well after the window closes.
  await kv.put(kvKey, String(count + 1), { expirationTtl: windowSecs * 2 });
  return true;
}
