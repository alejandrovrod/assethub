import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useTranslation } from 'react-i18next'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const navigate = useNavigate()
  const logout = useAuthStore(state => state.logout)
  const queryClient = useQueryClient()
  const { t } = useTranslation('common')

  const handleSignOut = () => {
    queryClient.clear()
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
      title={t('signOut.title')}
      desc={t('signOut.description')}
      confirmText={t('signOut.confirm')}
      cancelBtnText={t('actions.cancel')}
      destructive
      handleConfirm={handleSignOut}
      className='sm:max-w-sm'
    />
  )
}
