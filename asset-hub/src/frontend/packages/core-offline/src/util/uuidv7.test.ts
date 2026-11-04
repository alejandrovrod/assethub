import { describe, it, expect } from 'vitest';
import { uuidv7 } from './uuidv7';

describe('uuidv7 utility', () => {
  it('generates valid UUIDv7 format (8-4-4-4-12)', () => {
    const id = uuidv7();
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(regex.test(id)).toBe(true);
  });

  it('generates correct version (7) and variant (RFC 4122 / 9562)', () => {
    const id = uuidv7();
    const parts = id.split('-');
    expect(parts[2][0]).toBe('7');
    expect(['8', '9', 'a', 'b'].includes(parts[3][0].toLowerCase())).toBe(true);
  });

  it('guarantees monotonic ordering within the same ms', () => {
    const count = 1000;
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(uuidv7());
    }

    for (let i = 1; i < count; i++) {
      expect(ids[i] > ids[i - 1]).toBe(true);
    }
  });

  it('generates 10,000 UUIDs without any collisions', () => {
    const count = 10000;
    const set = new Set<string>();
    for (let i = 0; i < count; i++) {
      set.add(uuidv7());
    }
    expect(set.size).toBe(count);
  });
});

