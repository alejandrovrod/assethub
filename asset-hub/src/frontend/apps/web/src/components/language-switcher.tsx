import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LANGUAGES, useLanguageStore, type Language } from '@/store/language.store'

type LanguageSwitcherProps = {
  className?: string
  /** 'icon' renders a compact icon trigger; 'full' renders the active language label. */
  variant?: 'icon' | 'full'
}

export function LanguageSwitcher({ className, variant = 'icon' }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation()
  const lang = useLanguageStore((state) => state.lang)

  const handleChange = (next: Language) => {
    useLanguageStore.getState().setLang(next)
    void i18n.changeLanguage(next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size={variant === 'icon' ? 'icon' : 'sm'}
          className={className}
          aria-label={t('language.label')}
          title={t('language.label')}
        >
          <Languages className='h-4 w-4' />
          {variant === 'full' && <span className='ml-2 uppercase'>{lang}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        {LANGUAGES.map((code) => (
          <DropdownMenuItem
            key={code}
            onClick={() => handleChange(code)}
            aria-current={code === lang ? 'true' : undefined}
          >
            <span className={code === lang ? 'font-semibold' : undefined}>
              {t(`language.${code}`)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
