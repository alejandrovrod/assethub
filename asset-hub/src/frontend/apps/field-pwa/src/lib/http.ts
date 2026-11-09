// http.ts — fetch wrapper that forwards the active UI language to the API.
//
// The backend localizes validation and error messages from Accept-Language.
// Reading the value at call time (not at module load) keeps it in sync with the
// LanguageSwitcher without re-creating clients on every render.
import { useLanguageStore } from '../store/language.store';

export function languageHeaders(): Record<string, string> {
  return { 'Accept-Language': useLanguageStore.getState().lang };
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept-Language')) {
    headers.set('Accept-Language', useLanguageStore.getState().lang);
  }
  return fetch(input, { ...init, headers });
}
