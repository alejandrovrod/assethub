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

// Helper para extraer el tenant del subdominio
const extractTenantFromUrl = () => {
  if (typeof window === 'undefined') return null;
  const hostname = window.location.hostname;

  // Si estamos en el dominio base de dev, no extraemos tenant de la URL
  // para que use el tenant almacenado en el AuthStore.
  if (hostname === 'assetshub.dev.sonnora.mx') {
    return null;
  }

  const parts = hostname.split('.');

  // Si estamos en localhost y tiene más de 1 parte (ej. coca-cola.localhost)
  if (hostname.endsWith('localhost') && parts.length > 1) {
    return parts[0];
  }

  // Si estamos en Netlify y tiene 4 o más partes (ej. coca-cola.velvety-kataifi-268131.netlify.app)
  if (hostname.endsWith('.netlify.app')) {
    return parts.length >= 4 ? parts[0] : null;
  }

  // Si estamos en producción y tiene 3 o más partes, omitiendo www (ej. coca-cola.assethub.com)
  if (!hostname.endsWith('localhost') && parts.length >= 3 && parts[0] !== 'www') {
    return parts[0];
  }

  return null;
}

// Request Interceptor: Inyectar el token JWT y el Tenant
apiClient.interceptors.request.use((config) => {
  const state = useAuthStore.getState()
  if (config.headers) {
    if (state.token) {
      config.headers.Authorization = `Bearer ${state.token}`
    }

    // Primero intentamos sacar el tenant de la URL (Subdominio)
    const urlTenant = extractTenantFromUrl();
    if (urlTenant) {
      config.headers['X-Tenant'] = urlTenant
    }
    // Si no hay subdominio (ej. estamos en localhost a secas), usamos el de la sesión
    else if (state.tenantSlug) {
      config.headers['X-Tenant'] = state.tenantSlug
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
