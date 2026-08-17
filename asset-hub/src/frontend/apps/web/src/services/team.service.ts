import { apiClient as api } from '@/lib/api-client'

export interface TeamSummary {
  id: string
  name: string
  description?: string
  memberCount: number
  leadName?: string
}

export interface TeamDetail {
  id: string
  name: string
  description?: string
  members: TeamMemberDetail[]
}

export interface TeamMemberDetail {
  employeeId: string
  firstName: string
  lastName: string
  email: string
  isLead: boolean
  isActive: boolean
}

export interface CreateTeamDto {
  name: string
  description?: string
  members: { employeeId: string; isLead: boolean }[]
}

export interface UpdateTeamDto {
  name: string
  description?: string
  members: { employeeId: string; isLead: boolean }[]
}

export interface PaginatedResult<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
}

export const teamService = {
  getAll: async (params?: { search?: string; page?: number; pageSize?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.search) searchParams.append('search', params.search)
    if (params?.page) searchParams.append('page', String(params.page))
    if (params?.pageSize) searchParams.append('pageSize', String(params.pageSize))

    const { data } = await api.get<PaginatedResult<TeamSummary>>(
      `/teams?${searchParams.toString()}`
    )
    return data
  },

  getById: async (id: string) => {
    const { data } = await api.get<TeamDetail>(`/teams/${id}`)
    return data
  },

  create: async (payload: CreateTeamDto) => {
    const { data } = await api.post<{ id: string }>('/teams', payload)
    return data
  },

  update: async (id: string, payload: UpdateTeamDto) => {
    await api.put(`/teams/${id}`, payload)
  },

  delete: async (id: string) => {
    await api.delete(`/teams/${id}`)
  },
}
