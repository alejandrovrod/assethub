import {
  LayoutDashboard,
  Laptop,
  Wrench,
  Users,
  BookOpen,
  Settings,
  ShieldCheck,
  Building,
  UserCog,
  FileText,
  Activity,
  ClipboardList,
  Tags,
  UsersRound,
  FileCheck,
  Command,
  GalleryVerticalEnd,
  AudioWaveform,
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
              title: 'Tareas',
              url: '/maintenance/tasks',
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

