import axios from 'axios'

// You can override this in a .env file later with VITE_API_URL
const baseURL = import.meta.env.VITE_API_URL || 'https://asset-hub.runasp.net/api/v1' //'https://localhost:7184/api/v1'   

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const getMediaUrl = (path?: string | null): string => {
  if (!path) return '';
  if (path.startsWith('http')) return path;

  const rootUrl = baseURL.replace('/api/v1', '');
  return `${rootUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

import { useAuthStore } from '../store/auth.store'
import { getTenantFromUrl } from './tenant'

import { useLanguageStore } from '../store/language.store'

// Request Interceptor: Inyectar el token JWT y el Tenant
apiClient.interceptors.request.use((config) => {
  const state = useAuthStore.getState()
  if (config.headers) {
    if (state.token) {
      config.headers.Authorization = `Bearer ${state.token}`
    }

    // Idioma activo: el backend localiza mensajes de error/validación según Accept-Language
    config.headers['Accept-Language'] = useLanguageStore.getState().lang

    // Tenant: primero intentamos resolverlo de la URL (subdominio o prefijo path), luego de la sesión
    const resolvedTenant = getTenantFromUrl() || state.tenantSlug;
    if (resolvedTenant) {
      config.headers['X-Tenant'] = resolvedTenant;
    }
  }
  return config
})

// Response Interceptor: Manejar 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Activar el auto-logout cuando la API devuelva 401
      console.warn('API regresó 401 Unauthorized. Expiró el token, redirigiendo al login...');
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error)
  }
)
