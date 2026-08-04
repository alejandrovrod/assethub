import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  refreshToken: string | null
  tenantSlug: string | null
  tenantName: string | null
  roles: string[]
  isAuthenticated: boolean
  setAuth: (token: string, refreshToken: string, tenantSlug?: string | null, tenantName?: string | null, roles?: string[]) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      tenantSlug: null,
      tenantName: null,
      roles: [],
      isAuthenticated: false,
      setAuth: (token, refreshToken, tenantSlug = null, tenantName = null, roles = []) => set({ token, refreshToken, tenantSlug, tenantName, roles, isAuthenticated: true }),
      logout: () => set({ token: null, refreshToken: null, tenantSlug: null, tenantName: null, roles: [], isAuthenticated: false }),
    }),
    {
      name: 'auth-storage', // name of the item in the storage (must be unique)
    }
  )
)
