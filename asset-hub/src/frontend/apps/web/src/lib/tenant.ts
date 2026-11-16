import { useAuthStore } from '../store/auth.store';

/**
 * Helper unificado para resolver el tenant según el entorno:
 * 1. Subdominio (en localhost ej: atlas.localhost:5173 o en dominio propio ej: atlas.assethub.app)
 * 2. Fallback al tenantSlug guardado en el store de sesión
 */
export function getTenantFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const hostname = window.location.hostname;

  // Si estamos en localhost y tiene más de 1 parte (ej. atlas.localhost)
  if (hostname.endsWith('localhost')) {
    const parts = hostname.split('.');
    if (parts.length > 1 && parts[0] !== 'localhost') {
      return parts[0].toLowerCase();
    }
  }

  // Si estamos en producción con dominio personalizado (ej. atlas.assethub.app)
  // Omitimos dominios base como assethub.app, www.assethub.app, assethubweb.netlify.app
  if (!hostname.endsWith('localhost') && !hostname.endsWith('.netlify.app')) {
    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[0] !== 'www') {
      return parts[0].toLowerCase();
    }
  }

  // Fallback al tenant autenticado en el estado
  const stateTenant = useAuthStore.getState().tenantSlug;
  return stateTenant ? stateTenant.toLowerCase() : null;
}

/**
 * Devuelve la URL de destino adecuada para el usuario tras autenticarse:
 * - En localhost: http://<tenantSlug>.localhost:<port>/auth-sync?data=...
 * - En dominio personalizado con wildcard DNS: https://<tenantSlug>.<baseDomain>/auth-sync?data=...
 * - En Netlify (*.netlify.app): permanece en el mismo host ya que Netlify no soporta
 *   wildcards anidados (*.*.netlify.app), pero mantiene la sesión aislada en el store.
 */
export function getTenantAuthRedirectUrl(
  data: {
    accessToken: string;
    refreshToken: string;
    tenantSlug?: string | null;
    tenantName?: string | null;
    roles?: string[];
    permissions?: string[];
  },
  currentHost: string,
  port: string
): string | null {
  if (!data.tenantSlug) return null;

  const syncData = encodeURIComponent(
    JSON.stringify({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      tenantSlug: data.tenantSlug,
      tenantName: data.tenantName,
      roles: data.roles || [],
      permissions: data.permissions || [],
    })
  );

  // 1. Localhost multi-tenant simulation
  if (currentHost === 'localhost') {
    const portSuffix = port ? `:${port}` : '';
    return `http://${data.tenantSlug}.localhost${portSuffix}/auth-sync?data=${syncData}`;
  }

  // 2. Custom production domain with wildcard support (e.g. assethub.app -> atlas.assethub.app)
  if (
    currentHost === 'assethub.app' ||
    currentHost === 'www.assethub.app' ||
    currentHost === 'app.assethub.app'
  ) {
    const baseDomain = 'assethub.app';
    return `${window.location.protocol}//${data.tenantSlug}.${baseDomain}/auth-sync?data=${syncData}`;
  }

  // 3. Netlify (*.netlify.app) u otros hosts sin wildcard DNS:
  // No redirigir a un subdominio no existente que cause 404/SSL error;
  // retornar null para que navegue directamente al Dashboard dentro del mismo host.
  return null;
}

