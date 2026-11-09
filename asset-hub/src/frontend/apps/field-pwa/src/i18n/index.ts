import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { STORAGE_KEY, normalizeLanguage, useLanguageStore } from '../store/language.store';

// Static imports only: every dictionary must be bundled so the Workbox
// injectManifest precache ships them and the PWA works 100% offline.
// i18next-http-backend is explicitly NOT used.
import commonEs from '../locales/es/common.json';
import commonEn from '../locales/en/common.json';
import authEs from '../locales/es/auth.json';
import authEn from '../locales/en/auth.json';
import syncEs from '../locales/es/sync.json';
import syncEn from '../locales/en/sync.json';
import tasksEs from '../locales/es/tasks.json';
import tasksEn from '../locales/en/tasks.json';
import ordersEs from '../locales/es/orders.json';
import ordersEn from '../locales/en/orders.json';
import incidentsEs from '../locales/es/incidents.json';
import incidentsEn from '../locales/en/incidents.json';
import assetsEs from '../locales/es/assets.json';
import assetsEn from '../locales/en/assets.json';
import stockEs from '../locales/es/stock.json';
import stockEn from '../locales/en/stock.json';
import formsEs from '../locales/es/forms.json';
import formsEn from '../locales/en/forms.json';

export const supportedLanguages = ['es', 'en'] as const;
export const fallbackLanguage = 'es';
export const defaultNamespace = 'common';

export const namespaces = [
  'common',
  'auth',
  'sync',
  'tasks',
  'orders',
  'incidents',
  'assets',
  'stock',
  'forms',
] as const;

/** One entry per JSON dictionary under src/locales/{es,en}/. */
export const resources = {
  es: {
    common: commonEs,
    auth: authEs,
    sync: syncEs,
    tasks: tasksEs,
    orders: ordersEs,
    incidents: incidentsEs,
    assets: assetsEs,
    stock: stockEs,
    forms: formsEs,
  },
  en: {
    common: commonEn,
    auth: authEn,
    sync: syncEn,
    tasks: tasksEn,
    orders: ordersEn,
    incidents: incidentsEn,
    assets: assetsEn,
    stock: stockEn,
    forms: formsEn,
  },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: fallbackLanguage,
    supportedLngs: [...supportedLanguages],
    nonExplicitSupportedLngs: true,
    defaultNS: defaultNamespace,
    ns: [...namespaces],
    interpolation: { escapeValue: false }, // React already escapes output
    returnNull: false,
    detection: {
      // Same slot the Zustand store reads/writes, so both agree by construction.
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: STORAGE_KEY,
      caches: [],
    },
  });

// i18n → store (first run adopts whatever the detector resolved).
i18n.on('initialized', () => {
  const detected = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);
  if (detected !== useLanguageStore.getState().lang) {
    useLanguageStore.getState().setLang(detected);
  }
});

// store → i18n (language switch without a page reload).
useLanguageStore.subscribe((previous, state) => {
  if (previous.lang !== state.lang && state.lang !== i18n.language) {
    void i18n.changeLanguage(state.lang);
  }
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = normalizeLanguage(lng);
});

export default i18n;
