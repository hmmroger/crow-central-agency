import crypto from "node:crypto";

/**
 * Hash a string with SHA-256 for timing-safe comparison.
 * Normalizes key length so timingSafeEqual works with variable-length inputs.
 */
export function sha256(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

/**
 * Compare two strings in constant time using SHA-256 hashing.
 * Returns true if the values match.
 */
export function timingSafeCompare(provided: string, expected: string): boolean {
  return crypto.timingSafeEqual(sha256(provided), sha256(expected));
}
