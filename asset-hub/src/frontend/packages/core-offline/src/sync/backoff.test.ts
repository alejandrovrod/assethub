import { describe, it, expect } from 'vitest';
import { nextDelayMs } from './backoff';

describe('nextDelayMs', () => {
  const fixedRand = (value: number) => () => value;

  it('returns 1000 ms for attempt 0 at zero jitter midpoint', () => {
    // rand=0.5 → jitter=1.0 → no change
    const delay = nextDelayMs(0, { rand: fixedRand(0.5) });
    expect(delay).toBe(1000);
  });

  it('returns 128000 ms for attempts >= 7 (cap)', () => {
    const delay = nextDelayMs(7, { rand: fixedRand(0.5) });
    expect(delay).toBe(128000);

    const delay2 = nextDelayMs(100, { rand: fixedRand(0.5) });
    expect(delay2).toBe(128000);
  });

  it('applies +20% jitter when rand=1', () => {
    // rand=1 → jitter=1.2
    const delay = nextDelayMs(0, { rand: fixedRand(1) });
    expect(delay).toBe(1200);
  });

  it('applies -20% jitter when rand=0', () => {
    // rand=0 → jitter=0.8
    const delay = nextDelayMs(0, { rand: fixedRand(0) });
    expect(delay).toBe(800);
  });

  it('doubles base delay with each attempt', () => {
    const delays = [0, 1, 2, 3, 4, 5, 6, 7].map((a) =>
      nextDelayMs(a, { rand: fixedRand(0.5) }),
    );
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000]);
  });

  it('respects retryAfterMs when it exceeds the calculated delay', () => {
    const delay = nextDelayMs(0, { rand: fixedRand(0.5), retryAfterMs: 5000 });
    expect(delay).toBe(5000);
  });

  it('ignores retryAfterMs when it is less than the calculated delay', () => {
    // attempt 7, base=128000, retryAfterMs=100 → should use calculated
    const delay = nextDelayMs(7, { rand: fixedRand(0.5), retryAfterMs: 100 });
    expect(delay).toBe(128000);
  });
});
