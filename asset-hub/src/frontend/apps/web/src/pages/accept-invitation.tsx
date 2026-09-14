import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { CheckCircle2, Loader2, MailCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { userService } from '@/services/user.service'
import type { InvitationInfo } from '@/services/user.service'
import { handleServerError } from '@/lib/handle-server-error'

export default function AcceptInvitationPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [info, setInfo] = useState<InvitationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    if (!token) {
      setNotFound(true)
      setLoading(false)
      return
    }
    userService
      .getInvitationInfo(token)
      .then((data) => setInfo(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [token])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    try {
      setSubmitting(true)
      await userService.registerViaInvitation({
        invitationToken: token,
        password,
        fullName: fullName.trim(),
      })
      toast.success('¡Cuenta creada! Iniciá sesión con tu email y contraseña')
      navigate('/login', { replace: true })
    } catch (error) {
      handleServerError({ error })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (notFound || !info) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="items-center text-center">
            <XCircle className="mb-2 h-10 w-10 text-destructive" />
            <CardTitle>Invitación no encontrada</CardTitle>
            <CardDescription>
              El link no es válido o fue eliminado. Pedí que te reenvíen la invitación.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => navigate('/login')}>
              Ir al login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!info.isValid) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="items-center text-center">
            <XCircle className="mb-2 h-10 w-10 text-destructive" />
            <CardTitle>Invitación no disponible</CardTitle>
            <CardDescription>{info.invalidReason}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => navigate('/login')}>
              Ir al login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <MailCheck className="mb-2 h-10 w-10 text-primary" />
          <CardTitle>Unite a {info.tenantName}</CardTitle>
          <CardDescription>
            Fuiste invitado como <strong>{info.email}</strong> con el rol{' '}
            <strong>{info.roleName}</strong>. Definí tu nombre y contraseña para
            activar tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="full-name">Nombre completo</Label>
              <Input
                id="full-name"
                required
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre y apellido"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">Confirmar contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              La invitación expira el{' '}
              {new Date(info.expiresAt).toLocaleString()}.
            </p>

            <Button type="submit" disabled={submitting || fullName.trim().length < 2 || password.length < 6}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Crear cuenta
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
