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
  const base =
    (import.meta.env.VITE_LEARNING_HUB_URL as string | undefined)?.replace(/\/$/, '') ||
    'http://localhost:5174'
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
