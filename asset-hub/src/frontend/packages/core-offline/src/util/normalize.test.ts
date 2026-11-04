import { describe, it, expect } from 'vitest';
import { normalizeSearchText, normalizeSearchCode, removeDiacritics } from './normalize';

describe('normalize utility', () => {
  it('strips accents and diacritics', () => {
    expect(removeDiacritics('púmp')).toBe('pump');
    expect(removeDiacritics('Mantenimiento Eléctrico')).toBe('Mantenimiento Electrico');
  });

  it('normalizes search codes to uppercase and trims', () => {
    expect(normalizeSearchCode('  pump-01  ')).toBe('PUMP-01');
    expect(normalizeSearchCode('púmp-01')).toBe('PUMP-01');
    expect(normalizeSearchCode('PUMP 01')).toBe('PUMP 01');
  });

  it('normalizes search text to lowercase, handles "Pump-01" / "PUMP 01" / "púmp"', () => {
    expect(normalizeSearchText('Pump-01')).toBe('pump 01');
    expect(normalizeSearchText('PUMP 01')).toBe('pump 01');
    expect(normalizeSearchText('púmp')).toBe('pump');
  });
});

