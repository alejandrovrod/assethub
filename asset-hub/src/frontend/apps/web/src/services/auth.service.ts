import { apiClient } from '../lib/api-client'

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tenantSlug?: string
  tenantName?: string
  roles?: string[]
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
  }
}
