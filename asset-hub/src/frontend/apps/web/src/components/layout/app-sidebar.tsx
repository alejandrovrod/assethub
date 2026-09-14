import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
// import { AppTitle } from './app-title'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import { TeamSwitcher } from './team-switcher'
import { useAuthStore } from '@/store/auth.store'
import { usePermissions } from '@/hooks/use-permissions'
import type { NavItem } from './types'

/**
 * Mapeo URL -> permiso requerido para ver el item de navegación.
 * Los items sin entrada son visibles para cualquier usuario autenticado.
 * isAdmin (admin / Tenant Admin) siempre ve todo.
 */
const ROUTE_PERMISSIONS: Record<string, string> = {
  '/dashboard': 'analytics:read',
  '/assets': 'assets:read',
  '/assets/templates': 'asset-templates:read',
  '/maintenance/incidents': 'incidents:read',
  '/maintenance/workflow-templates': 'incidents:read',
  '/maintenance/tasks': 'tasks:read',
  '/maintenance/orders': 'maintenance:read',
  '/maintenance/preventive-plans': 'preventive-plans:read',
  '/maintenance/communication-templates': 'communication-templates:read',
  '/staff/employees': 'employees:read',
  '/staff/teams': 'teams:read',
  '/inventory/warehouses': 'warehouses:read',
  '/inventory/stock': 'stock:read',
  '/inventory/settings': 'inventory:read',
  '/catalogs': 'catalogs:read',
  '/settings/tenant': 'tenant:read',
  '/settings/users': 'users:read',
  '/settings/roles': 'roles:read',
  '/settings/audit': 'audit:read',
  '/settings/account': 'profile:update',
}

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const tenantName = useAuthStore((state) => state.tenantName)
  const { can } = usePermissions()

  const teams = [...sidebarData.teams]
  if (tenantName) {
    teams[0] = {
      ...teams[0],
      name: tenantName,
    }
  }

  // Filtrar grupos de navegación según permisos del usuario
  const filteredGroups = sidebarData.navGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item): NavItem | null => {
          if ('items' in item && item.items) {
            // Grupo con subnav: filtrar hijos
            const children = item.items.filter(
              (child) =>
                !ROUTE_PERMISSIONS[String(child.url)] ||
                can(ROUTE_PERMISSIONS[String(child.url)])
            )
            if (children.length === 0) return null
            return { ...item, items: children }
          }
          if ('url' in item && item.url) {
            const perm = ROUTE_PERMISSIONS[String(item.url)]
            if (perm && !can(perm)) return null
          }
          return item
        })
        .filter((item): item is NavItem => item !== null),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <TeamSwitcher teams={teams} />

        {/* Replace <TeamSwitch /> with the following <AppTitle />
         /* if you want to use the normal app title instead of TeamSwitch dropdown */}
        {/* <AppTitle /> */}
      </SidebarHeader>
      <SidebarContent>
        {filteredGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
