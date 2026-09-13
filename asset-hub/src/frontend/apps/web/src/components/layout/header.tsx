import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ChevronRight } from 'lucide-react'
import { useBreadcrumbStore } from '@/stores/breadcrumb-store'

type HeaderProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean
  ref?: React.Ref<HTMLElement>
}

export function Header({ className, fixed, children, ...props }: HeaderProps) {
  const [offset, setOffset] = useState(0)
  const location = useLocation()
  const pathnames = location.pathname.split('/').filter((x) => x)
  const { customTitle } = useBreadcrumbStore()

  useEffect(() => {
    const onScroll = () => {
      setOffset(document.body.scrollTop || document.documentElement.scrollTop)
    }

    // Add scroll listener to the body
    document.addEventListener('scroll', onScroll, { passive: true })

    // Clean up the event listener on unmount
    return () => document.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'z-50 h-16',
        fixed && 'header-fixed peer/header sticky top-0 w-[inherit]',
        offset > 10 && fixed ? 'shadow' : 'shadow-none',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'relative flex h-full items-center gap-3 p-4 sm:gap-4',
          offset > 10 &&
            fixed &&
            'after:absolute after:inset-0 after:-z-10 after:bg-background/20 after:backdrop-blur-lg'
        )}
      >
        <SidebarTrigger variant='outline' className='max-md:scale-125' />
        <Separator orientation='vertical' className='h-6' />
        
        {/* Breadcrumbs */}
        <div className="flex items-center text-sm text-muted-foreground gap-2 capitalize hidden sm:flex">
          {pathnames.length === 0 ? (
            <span className="font-medium text-foreground">Panel de Control</span>
          ) : (
            pathnames.map((value, index) => {
              const isLast = index === pathnames.length - 1
              
              const breadcrumbTranslations: Record<string, string> = {
                'assets': 'Activos',
                'dashboard': 'Dashboard',
                'templates': 'Plantillas',
                'maintenance': 'Mantenimiento',
                'incidents': 'Incidencias',
                'workflow-templates': 'Plantillas de flujo',
                'tasks': 'Tareas',
                'orders': 'Órdenes',
                'preventive-plans': 'Planes preventivos',
                'communication-templates': 'Plantillas de Comunicación',
                'staff': 'Personal',
                'employees': 'Empleados',
                'teams': 'Equipos',
                'catalogs': 'Catálogos',
                'settings': 'Configuración',
                'tenant': 'Organización',
                'users': 'Usuarios',
                'roles': 'Roles',
                'audit': 'Auditoría',
              }
              
              let displayValue = breadcrumbTranslations[value] || value.replace(/-/g, ' ')
              // If it's the last part and looks like a long ID (e.g., > 16 chars) and we have a custom title
              if (isLast && customTitle && value.length > 16) {
                 displayValue = customTitle
              }

              return (
                <div key={value} className="flex items-center gap-2">
                  <span className={cn(isLast && "font-medium text-foreground")}>
                    {displayValue}
                  </span>
                  {!isLast && <ChevronRight className="h-4 w-4" />}
                </div>
              )
            })
          )}
        </div>

        {children}
      </div>
    </header>
  )
}
