import { create } from 'zustand'

interface BreadcrumbState {
  customTitle: string | null
  setCustomTitle: (title: string | null) => void
}

export const useBreadcrumbStore = create<BreadcrumbState>((set) => ({
  customTitle: null,
  setCustomTitle: (title) => set({ customTitle: title })
}))
