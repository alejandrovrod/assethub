import { describe, it, expect } from 'vitest';
import { ClockSkewManager } from './clock-skew';

describe('ClockSkewManager', () => {
  it('calculates median with odd number of samples', () => {
    const manager = new ClockSkewManager([100, 500, 200]);
    expect(manager.getMedianSkew()).toBe(200);
  });

  it('calculates median with even number of samples', () => {
    const manager = new ClockSkewManager([100, 400, 200, 300]);
    expect(manager.getMedianSkew()).toBe(250);
  });

  it('keeps rolling window of at most 5 samples', () => {
    const manager = new ClockSkewManager();
    manager.addSample(10);
    manager.addSample(20);
    manager.addSample(30);
    manager.addSample(40);
    manager.addSample(50);
    manager.addSample(100); // replaces 10

    expect(manager.getSamples()).toEqual([20, 30, 40, 50, 100]);
    expect(manager.getMedianSkew()).toBe(40);
  });

  it('correctly calculates displayNow with adjusted skew', () => {
    const manager = new ClockSkewManager([5000]); // +5 seconds ahead
    const localMs = 1700000000000;
    const adjusted = manager.displayNow(localMs);
    expect(adjusted.getTime()).toBe(localMs + 5000);
  });

  it('triggers critical skew guard when > 10 minutes', () => {
    const manager = new ClockSkewManager();
    manager.addSample(9 * 60 * 1000); // 9 min -> ok
    expect(manager.isSkewCritical()).toBe(false);

    manager.addSample(11 * 60 * 1000); // 11 min -> critical
    manager.addSample(12 * 60 * 1000);
    expect(manager.isSkewCritical()).toBe(true);
  });
});

