import { apiClient as api } from '@/lib/api-client'

export interface UserRole {
  id: string
  name: string
}

export interface AppUser {
  id: string
  email: string
  fullName: string
  isActive: boolean
  createdAt: string
  roles: UserRole[]
}

export interface UsersResult {
  items: AppUser[]
  totalCount: number
  page: number
  pageSize: number
}

export interface Invitation {
  id: string
  email: string
  roleId: string
  roleName: string
  expiresAt: string
  createdAt: string
  acceptedAt?: string | null
  cancelledAt?: string | null
  isExpired: boolean
}

export interface InvitationInfo {
  id: string
  email: string
  roleName: string
  tenantName: string
  expiresAt: string
  isValid: boolean
  invalidReason?: string | null
}

export interface CreateAppUserRequest {
  fullName: string
  email: string
  password: string
  isActive: boolean
  roleIds: string[]
}

export interface UpdateAppUserRequest {
  fullName: string
  isActive: boolean
}

export const userService = {
  getUsers: async (params?: {
    search?: string
    page?: number
    pageSize?: number
  }): Promise<UsersResult> => {
    const query = new URLSearchParams()
    if (params?.search) query.append('Search', params.search)
    if (params?.page) query.append('Page', String(params.page))
    if (params?.pageSize) query.append('PageSize', String(params.pageSize))
    const { data } = await api.get<UsersResult>(`/users?${query.toString()}`)
    return data
  },

  getUserById: async (id: string): Promise<AppUser> => {
    const { data } = await api.get<AppUser>(`/users/${id}`)
    return data
  },

  createUser: async (request: CreateAppUserRequest): Promise<{ id: string }> => {
    const { data } = await api.post<{ id: string }>('/users', request)
    return data
  },

  updateUser: async (
    id: string,
    request: UpdateAppUserRequest
  ): Promise<void> => {
    await api.put(`/users/${id}`, request)
  },

  deactivateUser: async (id: string): Promise<void> => {
    await api.delete(`/users/${id}`)
  },

  activateUser: async (id: string): Promise<void> => {
    await api.post(`/users/${id}/activate`)
  },

  assignRole: async (userId: string, roleId: string): Promise<void> => {
    await api.post(`/users/${userId}/roles`, { roleId })
  },

  removeRole: async (userId: string, roleId: string): Promise<void> => {
    await api.delete(`/users/${userId}/roles/${roleId}`)
  },

  getInvitations: async (onlyPending = false): Promise<Invitation[]> => {
    const { data } = await api.get<Invitation[]>(
      `/users/invitations?onlyPending=${onlyPending}`
    )
    return data
  },

  inviteUser: async (request: {
    email: string
    roleId: string
  }): Promise<{ id: string; token: string; acceptUrl: string }> => {
    const { data } = await api.post<{
      id: string
      token: string
      acceptUrl: string
    }>('/users/invitations', request)
    return data
  },

  resendInvitation: async (id: string): Promise<{
    id: string
    token: string
    acceptUrl: string
  }> => {
    const { data } = await api.post<{
      id: string
      token: string
      acceptUrl: string
    }>(`/users/invitations/${id}/resend`)
    return data
  },

  cancelInvitation: async (id: string): Promise<void> => {
    await api.post(`/users/invitations/${id}/cancel`)
  },

  getInvitationInfo: async (token: string): Promise<InvitationInfo> => {
    const { data } = await api.get<InvitationInfo>(
      `/auth/invitations/${encodeURIComponent(token)}`
    )
    return data
  },

  registerViaInvitation: async (request: {
    invitationToken: string
    password: string
    fullName: string
  }): Promise<boolean> => {
    const { data } = await api.post<boolean>('/auth/register', request)
    return data
  },
}
