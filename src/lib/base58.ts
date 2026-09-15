/**
 * Base58 (Bitcoin alphabet) decoding — used for offline validation of
 * Solana addresses (mints and wallets are both 32-byte ed25519 pubkeys).
 * A string that merely matches the base58 character set can still be an
 * invalid address (checksum/length); decoding catches exactly that BEFORE
 * any provider is called.
 */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Decode a base58 string to bytes. Returns null on any non-alphabet char. */
export function decodeBase58(input: string): Uint8Array | null {
  if (!input || input.length > 64) return null;
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const value = ALPHABET.indexOf(input[i]);
    if (value < 0) return null;
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading '1' characters represent zero bytes (big-endian order).
  let zeros = 0;
  while (zeros < input.length && input[zeros] === "1") zeros++;
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[zeros + i] = bytes[bytes.length - 1 - i];
  }
  return out;
}

/** Cheap charset/length check (kept for pre-filtering). */
export function isBase58Shaped(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

/**
 * Strict Solana address validation: base58 charset AND decodes to exactly
 * 32 bytes (ed25519 pubkey). Use this everywhere a user-supplied address
 * is accepted — it rejects malformed/typo'd addresses with zero provider
 * calls.
 */
export function isValidSolanaAddress(s: string): boolean {
  if (!isBase58Shaped(s)) return false;
  const decoded = decodeBase58(s);
  return decoded != null && decoded.length === 32;
}