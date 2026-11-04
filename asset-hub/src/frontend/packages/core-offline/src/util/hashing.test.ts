import { describe, it, expect } from 'vitest';
import { monotonicNow } from './monotonic';
import { sha256 } from './hashing';

describe('monotonic & hashing utilities (T033)', () => {
  it('returns valid monotonic numbers that increase or stay equal', () => {
    const t1 = monotonicNow();
    const t2 = monotonicNow();
    expect(t2).toBeGreaterThanOrEqual(t1);
  });

  it('computes consistent sha256 hex digests', async () => {
    // Known SHA-256 for "hello world"
    const hash = await sha256('hello world');
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('computes sha256 for Uint8Array and Blob', async () => {
    const uint8 = new TextEncoder().encode('test buffer');
    const hashUint8 = await sha256(uint8);

    const blob = new Blob(['test buffer']);
    const hashBlob = await sha256(blob);

    expect(hashUint8).toBe(hashBlob);
    expect(hashUint8).toHaveLength(64);
  });
});

