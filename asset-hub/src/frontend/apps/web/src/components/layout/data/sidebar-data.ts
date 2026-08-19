import {
  LayoutDashboard,
  Laptop,
  Wrench,
  Users,
  BookOpen,
  Settings,
  Command,
} from 'lucide-react'
import { type SidebarData } from '../types'

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
      title: 'General',
      items: [
        {
          title: 'Dashboard',
          url: '/',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: 'Gestión',
      items: [
        {
          title: 'Activos',
          icon: Laptop,
          items: [
            {
              title: 'Listado',
              url: '/assets',
            },
            {
              title: 'Plantillas',
              url: '/assets/templates',
            },
          ],
        },
        {
          title: 'Mantenimiento',
          icon: Wrench,
          items: [
            {
              title: 'Incidencias',
              url: '/maintenance/incidents',
            },
            {
              title: 'Plantillas de Incidencias',
              url: '/maintenance/incident-templates',
            },
            {
              title: 'Tareas',
              url: '/maintenance/tasks',
            },
            {
              title: 'Órdenes',
              url: '/maintenance/orders',
            },
            {
              title: 'Planes de Mantenimiento',
              url: '/maintenance/preventive-plans',
            },
          ],
        },
        {
          title: 'Personal',
          icon: Users,
          items: [
            {
              title: 'Empleados',
              url: '/staff/employees',
            },
            {
              title: 'Equipos',
              url: '/staff/teams',
            },
          ],
        },
      ],
    },
    {
      title: 'Sistema',
      items: [
        {
          title: 'Catálogos',
          url: '/catalogs',
          icon: BookOpen,
        },
        {
          title: 'Configuración',
          icon: Settings,
          items: [
            {
              title: 'Organización',
              url: '/settings/tenant',
            },
            {
              title: 'Usuarios',
              url: '/settings/users',
            },
            {
              title: 'Roles',
              url: '/settings/roles',
            },
            {
              title: 'Auditoría',
              url: '/settings/audit',
            },
          ],
        },
      ],
    },
  ],
}

