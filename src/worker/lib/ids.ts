/**
 * ids.ts — Crypto-random ID helpers (H4: no Math.random)
 *
 * newId()   → 26-char ULID using crypto.getRandomValues
 *             Format: 10-char Crockford-base32 timestamp + 16-char random suffix
 * newUuid() → RFC-4122 v4 UUID via crypto.randomUUID
 */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Returns a 26-character ULID string.
 * Uses crypto.getRandomValues — never Math.random.
 */
export function newId(): string {
  const now = Date.now();

  // 10-char timestamp (48-bit ms timestamp encoded in 5-bit chunks, big-endian)
  let ts = now;
  let timeStr = '';
  for (let i = 9; i >= 0; i--) {
    timeStr = CROCKFORD[ts & 0x1f] + timeStr;
    ts = Math.floor(ts / 32);
  }

  // 16-char random suffix (80 bits = 16 × 5-bit chunks)
  const randBytes = new Uint8Array(10);
  crypto.getRandomValues(randBytes);

  // Pack 80 bits into a 128-bit integer represented as two 40-bit halves
  // then extract 16 × 5-bit chunks
  let randStr = '';
  // Convert 10 bytes → 80 bits, read as 16 × 5-bit groups
  let bits = 0;
  let bitsCount = 0;
  for (let i = 0; i < randBytes.length; i++) {
    bits = (bits << 8) | randBytes[i];
    bitsCount += 8;
    while (bitsCount >= 5) {
      bitsCount -= 5;
      randStr += CROCKFORD[(bits >> bitsCount) & 0x1f];
    }
  }
  // Handle any remaining bits (80 mod 5 = 0, so nothing leftover)

  return timeStr + randStr;
}

/**
 * Returns an RFC-4122 v4 UUID string.
 * Uses crypto.randomUUID — never Math.random.
 */
export function newUuid(): string {
  return crypto.randomUUID();
}
