import { useLanguageStore } from '@/store/language.store'

/**
 * Locale-aware formatting helpers. They read the active language from the
 * Zustand store, so dates/numbers/currency re-render together with the UI
 * when the language changes (no reload needed).
 */

const localeFor = (lang: string) => (lang === 'en' ? 'en-US' : 'es-MX')

export const currentLocale = (): string =>
  localeFor(useLanguageStore.getState().lang)

export const formatDate = (value: string | number | Date, options?: Intl.DateTimeFormatOptions): string => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(currentLocale(), options ?? { dateStyle: 'medium' }).format(date)
}

export const formatDateTime = (value: string | number | Date): string =>
  formatDate(value, { dateStyle: 'medium', timeStyle: 'short' })

export const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat(currentLocale(), options).format(value)

export const formatCurrency = (value: number, currency = 'MXN'): string =>
  new Intl.NumberFormat(currentLocale(), { style: 'currency', currency }).format(value)

export const formatPercent = (value: number, fractionDigits = 1): string =>
  new Intl.NumberFormat(currentLocale(), {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)

/** Hook form: subscribes to the language so callers re-render on switch. */
export const useFormat = () => {
  const lang = useLanguageStore((state) => state.lang)
  return {
    formatDate,
    formatDateTime,
    formatNumber,
    formatCurrency,
    formatPercent,
    locale: localeFor(lang),
  }
}
