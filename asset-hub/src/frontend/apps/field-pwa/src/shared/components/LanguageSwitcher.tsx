// LanguageSwitcher.tsx — Compact ES/EN toggle for the field header
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { useLanguageStore } from '../../store/language.store';

/**
 * Mobile-first: a single tap swaps the language without reloading the app, so
 * offline state, open sheets and pending mutations survive the switch.
 */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  const lang = useLanguageStore((state) => state.lang);
  const toggleLang = useLanguageStore((state) => state.toggleLang);
  const nextLang = lang === 'es' ? 'en' : 'es';

  return (
    <button
      type="button"
      onClick={toggleLang}
      aria-label={t('language.switchTo', { language: t(`language.${nextLang}`) })}
      title={t('language.label')}
      className="flex h-10 items-center justify-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-bold uppercase tracking-wide text-foreground transition-colors hover:bg-muted active:scale-95"
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      <span aria-hidden="true">{lang}</span>
    </button>
  );
}
