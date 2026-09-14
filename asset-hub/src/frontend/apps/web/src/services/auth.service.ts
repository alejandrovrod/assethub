import { apiClient } from '../lib/api-client'

export interface LoginRequest {
  email: string
  password: string
  mfaCode?: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tenantSlug?: string
  tenantName?: string
  roles?: string[]
  permissions?: string[]
}

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

export interface UpdateProfileRequest {
  fullName: string
  email: string
  preferredLocale?: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export interface MfaStatus {
  isEnabled: boolean
  recoveryCodesRemaining: number
}

export interface MfaSetupResponse {
  secret: string
  qrCodeUri: string
  backupCodes: string[]
}

export interface SignUpTenantRequest {
  orgName: string
  slug: string
  adminName: string
  email: string
  password: string
  planCode: string
}

export interface SignUpTenantResponse {
  tenantId: string
  status: string
}

export const authService = {
  login: async (request: LoginRequest): Promise<LoginResponse> => {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', request)
    return data
  },
  
  signUpTenant: async (request: SignUpTenantRequest): Promise<SignUpTenantResponse> => {
    const { data } = await apiClient.post<SignUpTenantResponse>('/auth/signup-tenant', request)
    return data
  },

  checkSlug: async (slug: string): Promise<{ available: boolean }> => {
    const { data } = await apiClient.get<{ available: boolean }>(`/tenants/check-slug?slug=${slug}`)
    return data
  },

  // Profile methods
  getMe: async (): Promise<CurrentUserProfile> => {
    const { data } = await apiClient.get<CurrentUserProfile>('/auth/me')
    return data
  },

  updateProfile: async (request: UpdateProfileRequest): Promise<CurrentUserProfile> => {
    const { data } = await apiClient.put<CurrentUserProfile>('/auth/me', request)
    return data
  },

  changePassword: async (request: ChangePasswordRequest): Promise<void> => {
    await apiClient.post('/auth/change-password', request)
  },

  uploadAvatar: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await apiClient.post<{ url: string }>('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return data
  },

  // MFA methods
  getMfaStatus: async (): Promise<MfaStatus> => {
    const { data } = await apiClient.get<MfaStatus>('/auth/me/mfa')
    return data
  },

  setupMfa: async (): Promise<MfaSetupResponse> => {
    const { data } = await apiClient.post<MfaSetupResponse>('/auth/me/mfa/setup')
    return data
  },

  verifyMfa: async (totpCode: string): Promise<void> => {
    await apiClient.post('/auth/me/mfa/verify', { totpCode })
  },

  disableMfa: async (password: string): Promise<void> => {
    await apiClient.post('/auth/me/mfa/disable', { password })
  },

  getBackupCodes: async (): Promise<string[]> => {
    const { data } = await apiClient.get<{ codes: string[] }>('/auth/me/mfa/backup-codes')
    return data.codes
  },

  regenerateBackupCodes: async (): Promise<string[]> => {
    const { data } = await apiClient.post<{ codes: string[] }>('/auth/me/mfa/backup-codes/regenerate')
    return data.codes
  }
}
