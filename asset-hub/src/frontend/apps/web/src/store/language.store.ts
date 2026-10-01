import { create } from "zustand";

export type Language = "es" | "en";

interface LanguageState {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
}

/**
 * Shared with i18next-browser-languagedetector (see src/i18n/index.ts) so the
 * detector, the store and the persisted value all read the same slot.
 */
export const STORAGE_KEY = "assethub_lang";

export const LANGUAGES: readonly Language[] = ["es", "en"];

export const normalizeLanguage = (raw?: string | null): Language => {
  const base = (raw ?? "").toLowerCase().split("-")[0];
  return LANGUAGES.find((l) => l === base) ?? "es";
};

const getInitialLanguage = (): Language => {
  if (typeof window === "undefined") return "es";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return normalizeLanguage(stored);
  return normalizeLanguage(navigator.language);
};

/**
 * Single source of truth for the active language.
 * The i18n module subscribes to this store and pushes changes into i18next,
 * which keeps API calls (Accept-Language) and the UI on the same value.
 */
export const useLanguageStore = create<LanguageState>((set, get) => ({
  lang: getInitialLanguage(),
  setLang: (lang: Language) => {
    localStorage.setItem(STORAGE_KEY, lang);
    set({ lang });
  },
  toggleLang: () => {
    const nextLang: Language = get().lang === "es" ? "en" : "es";
    localStorage.setItem(STORAGE_KEY, nextLang);
    set({ lang: nextLang });
  },
}));
