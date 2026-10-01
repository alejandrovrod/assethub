import {
  LayoutDashboard,
  Laptop,
  Wrench,
  Users,
  BookOpen,
  Settings,
  Command,
  Package,
} from 'lucide-react'
import { type SidebarData } from '../types'

/**
 * Titles are i18n keys resolved in the render layer (nav-group.tsx,
 * command-menu.tsx) via the `common` namespace: `sidebar.groups.*` and
 * `sidebar.items.*`. Keep this file free of user-facing text.
 */
export const sidebarData: SidebarData = {
  user: {
    name: 'Admin User',
    email: 'admin@assethub.com',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'AssetHub',
      logo: Command,
      plan: 'Enterprise',
    }
  ],
  navGroups: [
    {
      title: 'sidebar.groups.general',
      items: [
        {
          title: 'sidebar.items.dashboard',
          url: '/dashboard',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: 'sidebar.groups.management',
      items: [
        {
          title: 'sidebar.items.assets',
          icon: Laptop,
          items: [
            {
              title: 'sidebar.items.assetList',
              url: '/assets',
            },
            {
              title: 'sidebar.items.assetTemplates',
              url: '/assets/templates',
            },
          ],
        },
        {
          title: 'sidebar.items.maintenance',
          icon: Wrench,
          items: [
            {
              title: 'sidebar.items.incidents',
              url: '/maintenance/incidents',
            },
            {
              title: 'sidebar.items.workflowTemplates',
              url: '/maintenance/workflow-templates',
            },
            {
              title: 'sidebar.items.tasks',
              url: '/maintenance/tasks',
            },
            {
              title: 'sidebar.items.orders',
              url: '/maintenance/orders',
            },
            {
              title: 'sidebar.items.preventivePlans',
              url: '/maintenance/preventive-plans',
            },
            {
              title: 'sidebar.items.communicationTemplates',
              url: '/maintenance/communication-templates',
            },
          ],
        },
        {
          title: 'sidebar.items.staff',
          icon: Users,
          items: [
            {
              title: 'sidebar.items.employees',
              url: '/staff/employees',
            },
            {
              title: 'sidebar.items.teams',
              url: '/staff/teams',
            },
          ],
        },
        {
          title: 'sidebar.items.inventory',
          icon: Package,
          items: [
            {
              title: 'sidebar.items.warehouses',
              url: '/inventory/warehouses',
            },
            {
              title: 'sidebar.items.stock',
              url: '/inventory/stock',
            },
            {
              title: 'sidebar.items.inventorySettings',
              url: '/inventory/settings',
            },
          ],
        },
      ],
    },
    {
      title: 'sidebar.groups.system',
      items: [
        {
          title: 'sidebar.items.catalogs',
          url: '/catalogs',
          icon: BookOpen,
        },
        {
          title: 'sidebar.items.settings',
          icon: Settings,
          items: [
            {
              title: 'sidebar.items.organization',
              url: '/settings/tenant',
            },
            {
              title: 'sidebar.items.myAccount',
              url: '/settings/account',
            },
            {
              title: 'sidebar.items.users',
              url: '/settings/users',
            },
            {
              title: 'sidebar.items.roles',
              url: '/settings/roles',
            },
            {
              title: 'sidebar.items.audit',
              url: '/settings/audit',
            },
          ],
        },
      ],
    },
  ],
}
