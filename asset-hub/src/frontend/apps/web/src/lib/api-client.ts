import axios from 'axios'

// You can override this in a .env file later with VITE_API_URL
const baseURL = import.meta.env.VITE_API_URL || 'https://localhost:7184/api/v1'

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

import { useAuthStore } from '../store/auth.store'

// Request Interceptor: Inyectar el token JWT y el Tenant
apiClient.interceptors.request.use((config) => {
  const state = useAuthStore.getState()
  if (config.headers) {
    if (state.token) {
      config.headers.Authorization = `Bearer ${state.token}`
    }
    // Inject X-Tenant from state or fallback to 'demo' for local development
    config.headers['X-Tenant'] = state.tenantSlug || 'demo'
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
