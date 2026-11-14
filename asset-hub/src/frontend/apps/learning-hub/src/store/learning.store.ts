import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from '@/data/catalog'

interface LearningState {
  lang: Lang
  theme: 'light' | 'dark'
  completedIds: string[]
  lastLessonId: string | null
  playbackRate: number
  theaterMode: boolean
  autoplayNext: boolean
  setLang: (lang: Lang) => void
  toggleTheme: () => void
  toggleCompleted: (lessonId: string) => void
  markCompleted: (lessonId: string) => void
  setLastLessonId: (lessonId: string | null) => void
  setPlaybackRate: (rate: number) => void
  toggleTheaterMode: () => void
  toggleAutoplayNext: () => void
}

export const useLearningStore = create<LearningState>()(
  persist(
    (set) => ({
      lang: 'es',
      theme: 'light',
      completedIds: [],
      lastLessonId: null,
      playbackRate: 1,
      theaterMode: false,
      autoplayNext: true,
      setLang: (lang) => set({ lang }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      toggleCompleted: (lessonId) =>
        set((state) => ({
          completedIds: state.completedIds.includes(lessonId)
            ? state.completedIds.filter((id) => id !== lessonId)
            : [...state.completedIds, lessonId],
        })),
      markCompleted: (lessonId) =>
        set((state) => ({
          completedIds: state.completedIds.includes(lessonId)
            ? state.completedIds
            : [...state.completedIds, lessonId],
        })),
      setLastLessonId: (lastLessonId) => set({ lastLessonId }),
      setPlaybackRate: (playbackRate) => set({ playbackRate }),
      toggleTheaterMode: () => set((state) => ({ theaterMode: !state.theaterMode })),
      toggleAutoplayNext: () => set((state) => ({ autoplayNext: !state.autoplayNext })),
    }),
    {
      name: 'asset-hub-learning-progress',
    },
  ),
)

