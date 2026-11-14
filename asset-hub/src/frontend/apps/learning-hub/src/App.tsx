import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Globe,
  Moon,
  Play,
  Search,
  Sparkles,
  Sun,
  Share2,
  Check,
} from 'lucide-react'
import {
  ALL_LESSONS,
  LEARNING_MODULES,
  thumbnailUrl,
  type Lesson,
  type RoleFilter,
} from '@/data/catalog'
import { useLearningStore } from '@/store/learning.store'
import { VideoWatchView } from '@/components/VideoWatchView'

const ROLE_LABELS: Record<RoleFilter, { es: string; en: string }> = {
  all: { es: 'Todos', en: 'All' },
  admin: { es: 'Administración', en: 'Admin' },
  maintenance: { es: 'Mantenimiento', en: 'Maintenance' },
  inventory: { es: 'Inventario', en: 'Inventory' },
  analytics: { es: 'Analítica', en: 'Analytics' },
}

export function App() {
  const { lang, setLang, theme, toggleTheme, completedIds, lastLessonId, setLastLessonId } = useLearningStore()
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [copiedLink, setCopiedLink] = useState(false)

  // 1. Initial Deep-linking from URL (?v=lessonId&lang=es)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlLang = params.get('lang')
    if (urlLang === 'es' || urlLang === 'en') {
      setLang(urlLang)
    }

    const videoParam = params.get('v')
    if (videoParam) {
      const found = ALL_LESSONS.find((l) => l.id === videoParam)
      if (found) {
        setActiveLesson(found)
        setLastLessonId(found.id)
      }
    }
  }, [setLang, setLastLessonId])

  // 2. Keep URL in sync with active lesson and language
  useEffect(() => {
    const url = new URL(window.location.href)
    if (activeLesson) {
      url.searchParams.set('v', activeLesson.id)
    } else {
      url.searchParams.delete('v')
    }
    url.searchParams.set('lang', lang)
    window.history.replaceState({}, '', url.toString())
  }, [activeLesson, lang])

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const v = params.get('v')
      if (v) {
        const found = ALL_LESSONS.find((l) => l.id === v)
        setActiveLesson(found ?? null)
      } else {
        setActiveLesson(null)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Sync theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const handleSelectLesson = (lesson: Lesson) => {
    setLastLessonId(lesson.id)
    setActiveLesson(lesson)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    })
  }

  const lastLesson = useMemo(
    () => (lastLessonId ? ALL_LESSONS.find((l) => l.id === lastLessonId) ?? null : null),
    [lastLessonId],
  )

  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase()
    return LEARNING_MODULES.map((mod) => ({
      ...mod,
      lessons: mod.lessons.filter((l) => {
        const matchesRole = roleFilter === 'all' || l.role === roleFilter
        const matchesQuery =
          !q ||
          l.title[lang].toLowerCase().includes(q) ||
          l.description[lang].toLowerCase().includes(q) ||
          mod.title[lang].toLowerCase().includes(q)
        return matchesRole && matchesQuery
      }),
    })).filter((mod) => mod.lessons.length > 0)
  }, [search, roleFilter, lang])

  const progressPct = Math.round((completedIds.length / ALL_LESSONS.length) * 100)

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <button
            onClick={() => setActiveLesson(null)}
            className="flex items-center gap-2.5 text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">Asset Hub Academy</div>
              <div className="text-[11px] text-muted-foreground">
                {lang === 'es' ? 'Centro de Capacitación' : 'Learning Hub'}
              </div>
            </div>
          </button>

          {/* Search Bar */}
          {!activeLesson && (
            <div className="relative hidden w-full max-w-md md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  lang === 'es'
                    ? 'Buscar tutoriales, módulos o temas...'
                    : 'Search tutorials, modules, or topics...'
                }
                className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
          )}

          {/* Right Controls */}
          <div className="flex items-center gap-2.5">
            {/* Share / Copy URL Button */}
            <button
              onClick={handleShare}
              title={lang === 'es' ? 'Copiar enlace directo' : 'Copy direct link'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              {copiedLink ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-500 font-semibold">
                    {lang === 'es' ? 'Copiado!' : 'Copied!'}
                  </span>
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{lang === 'es' ? 'Compartir' : 'Share'}</span>
                </>
              )}
            </button>

            {/* Overall Progress Pill */}
            <div className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs sm:flex">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-medium">
                {completedIds.length}/{ALL_LESSONS.length}
              </span>
              <span className="text-muted-foreground">({progressPct}%)</span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:text-foreground"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* Language Switch */}
            <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5">
              <Globe className="mx-1.5 h-3.5 w-3.5 text-muted-foreground" />
              {(['es', 'en'] as const).map((code) => (
                <button
                  key={code}
                  onClick={() => setLang(code)}
                  className={`rounded-md px-2 py-1 text-xs font-semibold uppercase transition ${lang === 'es' && code === 'es'
                      ? 'bg-primary text-primary-foreground'
                      : lang === 'en' && code === 'en'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {activeLesson ? (
        <VideoWatchView
          lesson={activeLesson}
          onSelectLesson={handleSelectLesson}
          onBack={() => setActiveLesson(null)}
        />
      ) : (
        <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
          {/* Hero / Continue Watching */}
          <section className="mb-8 rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/10 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {lang === 'es' ? '9 Módulos · 26 Videotutoriales HD' : '9 Modules · 26 HD Video Tutorials'}
                </div>
                <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                  {lang === 'es'
                    ? 'Domina Asset Hub paso a paso'
                    : 'Master Asset Hub step by step'}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                  {lang === 'es'
                    ? 'Aprende desde el alta de tu empresa y configuración de catálogos hasta mantenimiento preventivo, inventario y KPIs de confiabilidad.'
                    : 'Learn everything from company onboarding and dynamic catalogs to preventive maintenance, inventory, and reliability KPIs.'}
                </p>

                {/* Progress bar inside Hero */}
                <div className="mt-4 max-w-md">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5 font-medium">
                    <span>{lang === 'es' ? 'Tu progreso general' : 'Your total progress'}</span>
                    <span>
                      {completedIds.length} / {ALL_LESSONS.length} ({progressPct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Continue Watching Card */}
              {lastLesson ? (
                <button
                  onClick={() => handleSelectLesson(lastLesson)}
                  className="flex items-center gap-4 rounded-xl border border-primary/40 bg-background/80 p-4 text-left transition hover:border-primary hover:bg-background shadow-md max-w-md"
                >
                  <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-black">
                    <img
                      src={thumbnailUrl(lastLesson.videoPath[lang])}
                      alt={lastLesson.title[lang]}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        ; (e.target as HTMLElement).style.display = 'none'
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play className="h-5 w-5 fill-white text-white drop-shadow" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                      {lang === 'es' ? 'Continuar viendo' : 'Continue watching'}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold truncate text-foreground">
                      {lastLesson.title[lang]}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{lastLesson.duration}</div>
                  </div>
                </button>
              ) : (
                <button
                  onClick={() => handleSelectLesson(ALL_LESSONS[0])}
                  className="inline-flex items-center gap-2 self-start rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-90 lg:self-center"
                >
                  <Play className="h-4 w-4 fill-current" />
                  {lang === 'es' ? 'Comenzar por el Módulo 01' : 'Start with Module 01'}
                </button>
              )}
            </div>
          </section>

          {/* Role Filter Pills */}
          <div className="mb-8 flex flex-wrap items-center gap-2">
            {(Object.keys(ROLE_LABELS) as RoleFilter[]).map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${roleFilter === role
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
              >
                {ROLE_LABELS[role][lang]}
              </button>
            ))}
          </div>

          {/* Modules & Lessons Grid */}
          <div className="space-y-12">
            {filteredModules.map((mod) => {
              const modCompletedCount = mod.lessons.filter((l) => completedIds.includes(l.id)).length
              const modProgress = Math.round((modCompletedCount / mod.lessons.length) * 100)

              return (
                <section key={mod.id}>
                  {/* Module Header with per-module progress badge */}
                  <div className="mb-4 flex flex-col justify-between gap-2 border-b border-border pb-3 sm:flex-row sm:items-end">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-primary">
                          {lang === 'es' ? `Módulo ${mod.number}` : `Module ${mod.number}`}
                        </span>
                        <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {modCompletedCount}/{mod.lessons.length} {lang === 'es' ? 'completados' : 'completed'}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold tracking-tight text-foreground">{mod.title[lang]}</h2>
                      <p className="text-xs text-muted-foreground">{mod.subtitle[lang]}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${modProgress}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">{modProgress}%</span>
                    </div>
                  </div>

                  {/* Lessons Grid with Video Thumbnail Preview */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {mod.lessons.map((lesson) => {
                      const done = completedIds.includes(lesson.id)
                      const thumb = thumbnailUrl(lesson.videoPath[lang])

                      return (
                        <button
                          key={lesson.id}
                          onClick={() => handleSelectLesson(lesson)}
                          className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg"
                        >
                          {/* Thumbnail Header with Real Video Frame */}
                          <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                            <img
                              src={thumb}
                              alt={lesson.title[lang]}
                              loading="lazy"
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                              onError={(e) => {
                                // Fallback gradient if image not ready
                                const target = e.target as HTMLElement
                                target.style.display = 'none'
                              }}
                            />

                            {/* Play Overlay Button */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-80 transition group-hover:bg-black/10 group-hover:opacity-100">
                              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/95 text-primary-foreground shadow-lg transition group-hover:scale-110">
                                <Play className="h-5 w-5 fill-current pl-0.5" />
                              </div>
                            </div>

                            {/* Order Badge */}
                            <span className="absolute left-2.5 top-2.5 rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                              {mod.number}.{lesson.order}
                            </span>

                            {/* Duration Badge */}
                            <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                              <Clock className="h-3 w-3" />
                              {lesson.duration}
                            </span>

                            {/* Done Badge */}
                            {done && (
                              <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-semibold text-white shadow">
                                <CheckCircle2 className="h-3 w-3" />
                                {lang === 'es' ? 'Visto' : 'Watched'}
                              </span>
                            )}
                          </div>

                          {/* Card Body */}
                          <div className="flex flex-1 flex-col p-4">
                            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-primary">
                              {lesson.title[lang]}
                            </h3>
                            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                              {lesson.description[lang]}
                            </p>
                            <div className="mt-auto pt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                              <span className="rounded bg-muted px-2 py-0.5 font-medium">
                                {ROLE_LABELS[lesson.role][lang]}
                              </span>
                              <span className="uppercase font-semibold text-[10px] text-muted-foreground/80">
                                {lang}
                              </span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </main>
      )}
    </div>
  )
}
