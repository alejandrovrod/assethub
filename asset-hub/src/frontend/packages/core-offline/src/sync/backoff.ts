/**
 * Exponential back-off with ±20 % jitter.
 *
 * 8 base steps (0-indexed):
 *   0 →  1 s
 *   1 →  2 s
 *   2 →  4 s
 *   3 →  8 s
 *   4 → 16 s
 *   5 → 32 s
 *   6 → 64 s
 *   7+ → 128 s (capped)
 */

const BASE_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000];

export interface BackoffOpts {
  /** Minimum delay enforced by a server Retry-After header (milliseconds). */
  retryAfterMs?: number;
  /** Seeded random function — default is Math.random(). */
  rand?: () => number;
}

/**
 * Calculate the next retry delay.
 *
 * @param attempt   0-indexed attempt number (0 = first retry).
 * @param opts      Optional overrides.
 * @returns         Delay in milliseconds.
 */
export function nextDelayMs(attempt: number, opts?: BackoffOpts): number {
  const rand = opts?.rand ?? Math.random;
  const clampedAttempt = Math.min(attempt, BASE_DELAYS_MS.length - 1);
  const base = BASE_DELAYS_MS[clampedAttempt];

  // ±20 % jitter: multiply by (0.8 … 1.2)
  const jitter = 1 + (rand() * 0.4 - 0.2);
  const calculated = Math.round(base * jitter);

  const retryAfterMs = opts?.retryAfterMs ?? 0;
  return retryAfterMs > calculated ? retryAfterMs : calculated;
}
