import { GraduationCap, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface LearningHubTriggerProps {
  lessonId?: string
  className?: string
  variant?: 'icon' | 'button' | 'menu-item'
}

export function getLearningHubUrl(lessonId?: string, lang?: string): string {
  let base = (import.meta.env.VITE_LEARNING_HUB_URL as string | undefined)?.trim()?.replace(/\/$/, '')

  // En producción (cuando no estamos en localhost), si la variable quedó vacía o con localhost,
  // inferimos inteligentemente el subdominio o fallback de producción
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    if (!base || base.includes('localhost') || base.includes('127.0.0.1')) {
      // Si estamos en netlify (ej: assethubweb.netlify.app -> assethubacademy.netlify.app o ruta relativa /academy)
      if (window.location.hostname.endsWith('.netlify.app')) {
        base = 'https://assethubacademy.netlify.app'
      } else {
        base = `${window.location.protocol}//academy.${window.location.host}`
      }
    }
  }

  if (!base) {
    base = 'http://localhost:5174'
  }

  const params = new URLSearchParams()
  if (lessonId) {
    params.set('v', lessonId)
  }
  if (lang) {
    params.set('lang', lang)
  }
  const qs = params.toString()
  return qs ? `${base}/?${qs}` : base
}

export function LearningHubTrigger({
  lessonId,
  className,
  variant = 'icon',
}: LearningHubTriggerProps) {
  const { i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'es'
  const url = getLearningHubUrl(lessonId, lang)

  const label = lang === 'es' ? 'Asset Hub Academy' : 'Asset Hub Academy'
  const tooltipText =
    lang === 'es'
      ? 'Videotutoriales y Centro de Capacitación'
      : 'Video tutorials & Learning Hub'

  if (variant === 'button') {
    return (
      <Button
        variant="outline"
        size="sm"
        asChild
        className={className}
      >
        <a href={url} target="_blank" rel="noopener noreferrer" className="gap-2">
          <GraduationCap className="h-4 w-4 text-primary" />
          <span>{label}</span>
          <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
      </Button>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            asChild
            className={className ?? 'h-8 w-8'}
            aria-label={label}
          >
            <a href={url} target="_blank" rel="noopener noreferrer">
              <GraduationCap className="h-4 w-4" />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center">
          <p className="font-medium">{label}</p>
          <p className="text-[11px] text-muted-foreground">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
