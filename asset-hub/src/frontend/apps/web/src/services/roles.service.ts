import { apiClient as api } from '@/lib/api-client'

export interface RoleSummary {
  id: string
  name: string
  description: string
  isSystemDefault: boolean
  permissionCount: number
  userCount: number
}

export interface RoleDetail {
  id: string
  name: string
  description: string
  isSystemDefault: boolean
  permissionCodes: string[]
}

export interface PermissionCatalogItem {
  id: string
  code: string
  description: string
  planModule: string
}

export interface PermissionCatalogGroup {
  module: string
  permissions: PermissionCatalogItem[]
}

export const rolesService = {
  getRoles: async (): Promise<RoleSummary[]> => {
    const { data } = await api.get<RoleSummary[]>('/roles')
    return data
  },

  getRoleById: async (id: string): Promise<RoleDetail> => {
    const { data } = await api.get<RoleDetail>(`/roles/${id}`)
    return data
  },

  getPermissionCatalog: async (): Promise<PermissionCatalogGroup[]> => {
    const { data } = await api.get<PermissionCatalogGroup[]>('/roles/permission-catalog')
    return data
  },

  createRole: async (request: {
    name: string
    description: string
    permissionCodes: string[]
  }): Promise<{ id: string }> => {
    const { data } = await api.post<{ id: string }>('/roles', request)
    return data
  },

  updateRole: async (
    id: string,
    request: { name: string; description: string; permissionCodes: string[] }
  ): Promise<void> => {
    await api.put(`/roles/${id}`, request)
  },

  deleteRole: async (id: string): Promise<void> => {
    await api.delete(`/roles/${id}`)
  },
}
