import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Globe,
  Maximize2,
  Minimize2,
  Play,
  SkipForward,
  AlertCircle,
  Sparkles,
} from 'lucide-react'
import { ALL_LESSONS, LEARNING_MODULES, videoUrl, type Lesson } from '@/data/catalog'
import { useLearningStore } from '@/store/learning.store'

interface VideoWatchViewProps {
  lesson: Lesson
  onSelectLesson: (lesson: Lesson) => void
  onBack: () => void
}

export function VideoWatchView({ lesson, onSelectLesson, onBack }: VideoWatchViewProps) {
  const {
    lang,
    setLang,
    completedIds,
    toggleCompleted,
    markCompleted,
    playbackRate,
    setPlaybackRate,
    theaterMode,
    toggleTheaterMode,
    autoplayNext,
    toggleAutoplayNext,
  } = useLearningStore()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [showAutoPlayToast, setShowAutoPlayToast] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  const moduleGroup = LEARNING_MODULES.find((m) => m.id === lesson.moduleId)
  const moduleLessons = moduleGroup?.lessons ?? []
  const currentIdx = ALL_LESSONS.findIndex((l) => l.id === lesson.id)
  const nextLesson = currentIdx >= 0 && currentIdx < ALL_LESSONS.length - 1 ? ALL_LESSONS[currentIdx + 1] : null
  const isCompleted = completedIds.includes(lesson.id)

  const prerequisites = (lesson.prerequisiteIds ?? [])
    .map((id) => ALL_LESSONS.find((l) => l.id === id))
    .filter((l): l is Lesson => Boolean(l))

  // Sync playback rate
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate
    }
  }, [playbackRate, lesson.id, lang])

  // Keyboard shortcuts (Space = play/pause, ArrowLeft/Right = -5s/+5s, f = fullscreen, n = next)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      const video = videoRef.current
      if (!video) return

      if (e.code === 'Space') {
        e.preventDefault()
        if (video.paused) {
          video.play()
        } else {
          video.pause()
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 5)
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        video.currentTime = Math.max(0, video.currentTime - 5)
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {})
        } else {
          video.requestFullscreen().catch(() => {})
        }
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        video.muted = !video.muted
      } else if (e.key === 'n' || e.key === 'N') {
        if (nextLesson) {
          e.preventDefault()
          onSelectLesson(nextLesson)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [nextLesson, onSelectLesson])

  // Handle video ended (mark complete + handle autoplay)
  const handleEnded = useCallback(() => {
    markCompleted(lesson.id)

    if (autoplayNext && nextLesson) {
      setShowAutoPlayToast(true)
      setCountdown(3)
    }
  }, [lesson.id, autoplayNext, nextLesson, markCompleted])

  // Countdown timer for autoplay
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      setShowAutoPlayToast(false)
      setCountdown(null)
      if (nextLesson) {
        onSelectLesson(nextLesson)
      }
      return
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null))
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown, nextLesson, onSelectLesson])

  const cancelAutoplay = () => {
    setShowAutoPlayToast(false)
    setCountdown(null)
  }

  const src = videoUrl(lesson.videoPath[lang])

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      {/* Top Breadcrumb & Navigation */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          {lang === 'es' ? 'Volver al catálogo' : 'Back to catalog'}
        </button>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {lang === 'es' ? 'Módulo' : 'Module'} {moduleGroup?.number} · {moduleGroup?.title[lang]}
          </span>
        </div>
      </div>

      <div className={`grid gap-6 ${theaterMode ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[1fr_380px]'}`}>
        {/* Main Player Column */}
        <div className="flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-xl border border-border bg-black shadow-2xl">
            <video
              ref={videoRef}
              key={`${lesson.id}-${lang}`}
              src={src}
              controls
              autoPlay
              playsInline
              onEnded={handleEnded}
              className="aspect-video w-full bg-black object-contain"
            />

            {/* Autoplay Next Overlay Toast */}
            {showAutoPlayToast && nextLesson && (
              <div className="absolute bottom-6 right-6 z-20 flex items-center gap-3 rounded-xl border border-border bg-background/95 p-3.5 shadow-2xl backdrop-blur-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                  {countdown}
                </div>
                <div>
                  <div className="text-xs font-semibold text-primary">
                    {lang === 'es' ? 'Reproduciendo siguiente...' : 'Playing next...'}
                  </div>
                  <div className="text-xs font-medium text-foreground line-clamp-1 max-w-[200px]">
                    {nextLesson.title[lang]}
                  </div>
                </div>
                <button
                  onClick={cancelAutoplay}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
                >
                  {lang === 'es' ? 'Cancelar' : 'Cancel'}
                </button>
              </div>
            )}
          </div>

          {/* Player Controls & Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              {/* Language Switch */}
              <div className="inline-flex items-center rounded-lg border border-border bg-background p-0.5">
                <Globe className="mx-2 h-3.5 w-3.5 text-muted-foreground" />
                {(['es', 'en'] as const).map((code) => (
                  <button
                    key={code}
                    onClick={() => setLang(code)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase transition ${
                      lang === code
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>

              {/* Playback Speed Controls */}
              <div className="inline-flex items-center rounded-lg border border-border bg-background p-0.5">
                {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => setPlaybackRate(rate)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                      playbackRate === rate
                        ? 'bg-secondary text-secondary-foreground font-bold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              {/* Theater Mode Toggle */}
              <button
                onClick={toggleTheaterMode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                {theaterMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                {theaterMode
                  ? lang === 'es'
                    ? 'Vista normal'
                    : 'Default'
                  : lang === 'es'
                    ? 'Teatro'
                    : 'Theater'}
              </button>

              {/* Autoplay Next Toggle */}
              <button
                onClick={toggleAutoplayNext}
                title={
                  lang === 'es'
                    ? 'Reproducir automáticamente la siguiente lección'
                    : 'Automatically play next lesson'
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  autoplayNext
                    ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Auto-play</span>
                <span className="text-[10px] uppercase font-bold">{autoplayNext ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Mark Completed */}
              <button
                onClick={() => toggleCompleted(lesson.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  isCompleted
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'border border-border bg-background text-foreground hover:bg-accent'
                }`}
              >
                {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                {isCompleted
                  ? lang === 'es'
                    ? 'Completado'
                    : 'Completed'
                  : lang === 'es'
                    ? 'Marcar como visto'
                    : 'Mark as completed'}
              </button>

              {/* Next Lesson Button */}
              {nextLesson && (
                <button
                  onClick={() => onSelectLesson(nextLesson)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
                >
                  {lang === 'es' ? 'Siguiente' : 'Next'}
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Keyboard Shortcuts Hint Bar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground px-1">
            <span className="font-semibold text-foreground">
              {lang === 'es' ? 'Atajos:' : 'Shortcuts:'}
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">Espacio</kbd>{' '}
              {lang === 'es' ? 'Play/Pausa' : 'Play/Pause'}
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">← / →</kbd> ±5s
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">F</kbd>{' '}
              {lang === 'es' ? 'Pantalla completa' : 'Fullscreen'}
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">M</kbd>{' '}
              {lang === 'es' ? 'Mutear' : 'Mute'}
            </span>
            {nextLesson && (
              <span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">N</kbd>{' '}
                {lang === 'es' ? 'Siguiente' : 'Next'}
              </span>
            )}
          </div>

          {/* Lesson Details */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {lesson.title[lang]}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {lesson.description[lang]}
            </p>

            {prerequisites.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                  <AlertCircle className="h-4 w-4" />
                  {lang === 'es' ? 'Precondiciones recomendadas:' : 'Recommended prerequisites:'}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {prerequisites.map((pre) => (
                    <button
                      key={pre.id}
                      onClick={() => onSelectLesson(pre)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-background/60 px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-background"
                    >
                      <Play className="h-3 w-3 text-amber-400" />
                      {pre.title[lang]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Side Playlist Column */}
        <aside className="flex flex-col rounded-xl border border-border bg-card overflow-hidden h-fit">
          <div className="border-b border-border bg-muted/30 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">
              {lang === 'es' ? `Módulo ${moduleGroup?.number}` : `Module ${moduleGroup?.number}`}
            </div>
            <h2 className="mt-0.5 text-base font-semibold text-foreground">
              {moduleGroup?.title[lang]}
            </h2>
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{lang === 'es' ? 'Progreso del módulo' : 'Module progress'}</span>
                <span>
                  {moduleLessons.filter((l) => completedIds.includes(l.id)).length} / {moduleLessons.length}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (moduleLessons.filter((l) => completedIds.includes(l.id)).length /
                        (moduleLessons.length || 1)) *
                        100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
            {moduleLessons.map((item) => {
              const active = item.id === lesson.id
              const done = completedIds.includes(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectLesson(item)}
                  className={`flex w-full items-start gap-3 p-3.5 text-left transition ${
                    active ? 'bg-primary/10' : 'hover:bg-accent/50'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {active ? (
                      <Play className="h-4 w-4 fill-primary text-primary" />
                    ) : done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium leading-snug ${active ? 'text-primary' : 'text-foreground'}`}>
                      {item.order}. {item.title[lang]}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.duration}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>
      </div>
    </div>
  )
}
