/**
 * High-resolution monotonic timestamp wrapper.
 * Falls back to Date.now() if performance.now() is unavailable.
 */
export function monotonicNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

