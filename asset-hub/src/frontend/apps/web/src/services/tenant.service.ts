import { apiClient as api } from '@/lib/api-client'

export interface TenantSettings {
  logoUrl?: string
  supportEmail?: string
}

export interface UpdateTenantSettingsPayload {
  logoUrl?: string
  supportEmail?: string
}

export interface NotificationMapping {
  id: string
  systemEvent: string
  templateId: string
  isActive: boolean
}

export interface UpdateNotificationMappingPayload {
  systemEvent: string
  templateId: string
  isActive: boolean
}

export const tenantService = {
  // Configuración del Tenant
  getSettings: () => {
    return api.get<TenantSettings>('/tenants/settings').then((res) => res.data)
  },
  
  updateSettings: (payload: UpdateTenantSettingsPayload) => {
    return api.put('/tenants/settings', payload).then((res) => res.data)
  },

  // Mapeos de Notificaciones
  getNotificationMappings: () => {
    return api.get<NotificationMapping[]>('/notification-mappings').then((res) => res.data)
  },

  updateNotificationMapping: (payload: UpdateNotificationMappingPayload) => {
    return api.put<{ id: string }>('/notification-mappings', payload).then((res) => res.data)
  },

  deleteNotificationMapping: (id: string) => {
    return api.delete(`/notification-mappings/${id}`).then((res) => res.data)
  }
}
