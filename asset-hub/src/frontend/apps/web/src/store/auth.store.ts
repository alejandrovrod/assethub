import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CurrentUserProfile {
  id: string
  email: string
  fullName: string
  isActive: boolean
  createdAt: string
  roles: string[]
  permissions: string[]
  tenantSlug?: string
  tenantName?: string
  avatarUrl: string
  preferredLocale: string
  twoFactorEnabled: boolean
  linkedEmployee?: {
    employeeId: string
    firstName: string
    lastName: string
    email: string
    roleLabel: string
    phoneNumber: string
  }
}

interface AuthState {
  token: string | null
  refreshToken: string | null
  tenantSlug: string | null
  tenantName: string | null
  roles: string[]
  permissions: string[]
  isAuthenticated: boolean
  userProfile: CurrentUserProfile | null
  setAuth: (
    token: string,
    refreshToken: string,
    tenantSlug?: string | null,
    tenantName?: string | null,
    roles?: string[],
    permissions?: string[]
  ) => void
  setPermissions: (permissions: string[]) => void
  setUserProfile: (profile: CurrentUserProfile | null) => void
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
      permissions: [],
      isAuthenticated: false,
      userProfile: null,
      setAuth: (token, refreshToken, tenantSlug = null, tenantName = null, roles = [], permissions = []) =>
        set({ token, refreshToken, tenantSlug, tenantName, roles, permissions, isAuthenticated: true }),
      setPermissions: (permissions) => set({ permissions }),
      setUserProfile: (userProfile) => set({ userProfile }),
      logout: () =>
        set({
          token: null,
          refreshToken: null,
          tenantSlug: null,
          tenantName: null,
          roles: [],
          permissions: [],
          isAuthenticated: false,
          userProfile: null,
        }),
    }),
    {
      name: 'auth-storage', // name of the item in the storage (must be unique)
    }
  )
)
