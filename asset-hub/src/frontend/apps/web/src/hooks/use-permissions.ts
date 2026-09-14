import { useAuthStore } from '@/store/auth.store'

/**
 * Acceso a los permisos del usuario autenticado (JWT perms claim,
 * resueltos al login según la matriz de roles del tenant).
 *
 * - hasPermission(code): true si el usuario tiene el permiso exacto
 * - hasAnyPermission(codes): true si tiene al menos uno
 * - isAdmin: true para roles admin/Tenant Admin (acceso bootstrap total)
 */
export function usePermissions() {
  const permissions = useAuthStore((state) => state.permissions)
  const roles = useAuthStore((state) => state.roles)

  const isAdmin = roles.includes('admin') || roles.includes('Tenant Admin')
  const permSet = new Set(permissions ?? [])

  return {
    permissions: permissions ?? [],
    isAdmin,
    can: (code: string) => isAdmin || permSet.has(code),
    canAny: (codes: string[]) => isAdmin || codes.some((c) => permSet.has(c)),
  }
}
