import { apiClient as api } from '@/lib/api-client'

export interface EmployeeSummary {
  id: string
  firstName: string
  lastName: string
  email: string
  phoneNumber?: string
  roleCatalogItemId: string
  roleLabel?: string
  userId?: string
  isActive: boolean
}

export interface EmployeeDetail extends EmployeeSummary {
  skills: string[]
  availability: AvailabilitySlot[]
  teams: TeamMembership[]
}

export interface AvailabilitySlot {
  dayOfWeek: number
  startTime: string
  endTime: string
  isAvailable: boolean
}

export interface TeamMembership {
  teamId: string
  teamName: string
  isLead: boolean
}

export interface CreateEmployeeDto {
  firstName: string
  lastName: string
  email: string
  phoneNumber?: string
  roleCatalogItemId: string
  skills: string[]
  /** Cuando es true, el backend crea el ApplicationUser y lo vincula. */
  createUserAccess?: boolean
  /** Rol de sistema (Identity) requerido si createUserAccess es true. */
  systemRoleId?: string
}

export interface UpdateEmployeeDto {
  firstName: string
  lastName: string
  email: string
  phoneNumber?: string
  roleCatalogItemId: string
  skills: string[]
  createUserAccess?: boolean
  systemRoleId?: string
}

export interface CreateEmployeeResult {
  id: string
  userId?: string | null
  /** Solo viene cuando se creó acceso al sistema. */
  temporalPassword?: string | null
}

export interface UpdateEmployeeResult {
  id: string
  userId?: string | null
  temporalPassword?: string | null
}

export interface PaginatedResult<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
}

export const employeeService = {
  getAll: async (params?: { search?: string; isActive?: boolean; page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.search) searchParams.append('search', params.search)
    if (params?.isActive !== undefined) searchParams.append('isActive', String(params.isActive))
    if (params?.page) searchParams.append('page', String(params.page))
    if (params?.pageSize) searchParams.append('pageSize', String(params.pageSize))

    const { data } = await api.get<PaginatedResult<EmployeeSummary>>(
      `/employees?${searchParams.toString()}`
    )
    return data
  },

  getById: async (id: string) => {
    const { data } = await api.get<EmployeeDetail>(`/employees/${id}`)
    return data
  },

  create: async (payload: CreateEmployeeDto) => {
    const { data } = await api.post<CreateEmployeeResult>('/employees', payload)
    return data
  },

  update: async (id: string, payload: UpdateEmployeeDto) => {
    const { data } = await api.put<UpdateEmployeeResult>(`/employees/${id}`, payload)
    return data
  },

  deactivate: async (id: string) => {
    await api.delete(`/employees/${id}`)
  },

  linkUser: async (id: string, userId: string) => {
    await api.patch(`/employees/${id}/link-user`, { userId })
  },

  setAvailability: async (id: string, availabilities: Omit<AvailabilitySlot, 'isAvailable'>[]) => {
    await api.put(`/employees/${id}/availability`, { employeeId: id, availabilities })
  },
}
