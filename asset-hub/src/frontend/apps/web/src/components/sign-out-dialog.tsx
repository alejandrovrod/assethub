import { useNavigate } from 'react-router'
import { useAuthStore } from '@/store/auth.store'
import { ConfirmDialog } from '@/components/confirm-dialog'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const navigate = useNavigate()
  const logout = useAuthStore(state => state.logout)

  const handleSignOut = () => {
    logout()
    
    const currentHost = window.location.hostname;
    // Si estamos en un subdominio, redirigir al dominio base para limpiar sesión ahí también
    if (currentHost !== 'localhost' && currentHost.endsWith('localhost')) {
      window.location.href = `http://localhost:${window.location.port}/logout-sync`;
    } else {
      navigate('/login', { replace: true })
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title='Cerrar sesión'
      desc='¿Estás seguro que deseas cerrar sesión? Deberás iniciar sesión nuevamente para acceder a tu cuenta.'
      confirmText='Cerrar sesión'
      cancelBtnText='Cancelar'
      destructive
      handleConfirm={handleSignOut}
      className='sm:max-w-sm'
    />
  )
}
