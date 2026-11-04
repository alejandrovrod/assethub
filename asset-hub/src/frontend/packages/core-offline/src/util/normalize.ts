/**
 * Removes diacritics / accents from text.
 */
export function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalizes general text for search:
 * - Lowercase
 * - Strips accents
 * - Normalizes hyphens and underscores to spaces
 * - Collapses consecutive whitespace
 * - Trims
 */
export function normalizeSearchText(str: string): string {
  if (!str) return '';
  return removeDiacritics(str)
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes identifier codes (QR, barcode, serial, asset code):
 * - Uppercase
 * - Strips accents
 * - Trims
 */
export function normalizeSearchCode(str: string): string {
  if (!str) return '';
  return removeDiacritics(str)
    .toUpperCase()
    .trim();
}

/**
 * General string normalization helper.
 */
export function normalize(str: string): string {
  return normalizeSearchText(str);
}

