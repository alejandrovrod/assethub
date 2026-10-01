import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import {
  STORAGE_KEY,
  normalizeLanguage,
  useLanguageStore,
} from "@/store/language.store";

import commonEs from "@/locales/es/common.json";
import commonEn from "@/locales/en/common.json";
import authEs from "@/locales/es/auth.json";
import authEn from "@/locales/en/auth.json";
import assetsEs from "@/locales/es/assets.json";
import assetsEn from "@/locales/en/assets.json";
import maintenanceEs from "@/locales/es/maintenance.json";
import maintenanceEn from "@/locales/en/maintenance.json";
import settingsEs from "@/locales/es/settings.json";
import settingsEn from "@/locales/en/settings.json";
import landingEs from "@/locales/es/landing.json";
import landingEn from "@/locales/en/landing.json";
import dashboardEs from "@/locales/es/dashboard.json";
import dashboardEn from "@/locales/en/dashboard.json";
import inventoryEs from "@/locales/es/inventory.json";
import inventoryEn from "@/locales/en/inventory.json";
import staffEs from "@/locales/es/staff.json";
import staffEn from "@/locales/en/staff.json";
import catalogsEs from "@/locales/es/catalogs.json";
import catalogsEn from "@/locales/en/catalogs.json";
import communicationEs from "@/locales/es/communication.json";
import communicationEn from "@/locales/en/communication.json";

export const supportedLanguages = ["es", "en"] as const;
export const fallbackLanguage = "es";
export const defaultNamespace = "common";

/** One entry per JSON dictionary under src/locales/{es,en}/. */
export const resources = {
  es: {
    common: commonEs,
    auth: authEs,
    assets: assetsEs,
    maintenance: maintenanceEs,
    settings: settingsEs,
    landing: landingEs,
    dashboard: dashboardEs,
    inventory: inventoryEs,
    staff: staffEs,
    catalogs: catalogsEs,
    communication: communicationEs,
  },
  en: {
    common: commonEn,
    auth: authEn,
    assets: assetsEn,
    maintenance: maintenanceEn,
    settings: settingsEn,
    landing: landingEn,
    dashboard: dashboardEn,
    inventory: inventoryEn,
    staff: staffEn,
    catalogs: catalogsEn,
    communication: communicationEn,
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
    ns: [
      "common",
      "auth",
      "assets",
      "maintenance",
      "settings",
      "landing",
      "dashboard",
      "inventory",
      "staff",
      "catalogs",
      "communication",
    ],
    interpolation: { escapeValue: false }, // React already escapes output
    returnNull: false,
    detection: {
      // Same slot the Zustand store reads/writes, so both agree by construction.
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: STORAGE_KEY,
      caches: [],
    },
  });

// i18n → store (first run adopts whatever the detector resolved).
i18n.on("initialized", () => {
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

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = normalizeLanguage(lng);
});

export default i18n;
