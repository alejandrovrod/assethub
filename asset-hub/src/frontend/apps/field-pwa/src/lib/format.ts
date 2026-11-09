// format.ts — Locale-aware formatting helpers.
//
// They read the active language straight from the i18n instance, which is kept
// in sync with the Zustand store (see src/i18n/index.ts). Components re-render
// on language change because they call useTranslation(), so these helpers
// always format with the language currently on screen.
import i18n from '../i18n';

const localeFor = (lang: string): string => (lang.toLowerCase().startsWith('en') ? 'en-US' : 'es-MX');

export const currentLocale = (): string => localeFor(i18n.resolvedLanguage ?? i18n.language);

export const formatDate = (
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(currentLocale(), options ?? { dateStyle: 'medium' }).format(date);
};

export const formatDateTime = (value: string | number | Date): string =>
  formatDate(value, { dateStyle: 'medium', timeStyle: 'short' });

export const formatTime = (value: string | number | Date): string =>
  formatDate(value, { timeStyle: 'short' });

export const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat(currentLocale(), options).format(value);

export const formatRelative = (value: string | number | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto' });
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  return rtf.format(Math.round(days / 30), 'month');
};
