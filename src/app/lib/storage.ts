/**
 * storage.ts
 * Validated localStorage helpers.
 * - readLocal: parses + schema-validates; removes key and returns null on failure.
 * - writeLocal: validates then writes; throws on schema failure; swallows QuotaExceededError.
 * Both are no-ops / null-returns when localStorage is unavailable (SSR, old browser).
 */

import { z } from 'zod';

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Read and validate a value from localStorage.
 * Returns null (silently) on missing key, JSON parse failure, or schema mismatch.
 * On schema mismatch or invalid JSON, the key is removed to avoid serving bad data again.
 */
export function readLocal<T>(key: string, schema: z.ZodType<T>): T | null {
  if (!hasStorage()) return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Invalid JSON — evict poisoned entry
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    return null;
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    return null;
  }
  return result.data;
}

/**
 * Validate and write a value to localStorage.
 * Throws a TypeError on schema validation failure (invalid writes are developer bugs).
 * Swallows QuotaExceededError — logs a warning instead.
 * No-ops silently when localStorage is unavailable.
 */
export function writeLocal<T>(key: string, value: T, schema: z.ZodType<T>): void {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new TypeError(
      `writeLocal("${key}"): value failed schema validation — ${result.error.message}`,
    );
  }

  if (!hasStorage()) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(result.data));
  } catch (err) {
    if (err instanceof Error && err.name === 'QuotaExceededError') {
      console.warn(`writeLocal("${key}"): QuotaExceededError — write skipped`);
      return;
    }
    // Re-throw any other unexpected storage error
    throw err;
  }
}
