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
import { useFormat } from '@/lib/format'
import { Trans, useTranslation } from 'react-i18next'

export default function AcceptInvitationPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''
  const { t } = useTranslation(['auth', 'common'])
  const { formatDateTime } = useFormat()

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
      toast.error(t('common:validation.mustMatch'))
      return
    }
    try {
      setSubmitting(true)
      await userService.registerViaInvitation({
        invitationToken: token,
        password,
        fullName: fullName.trim(),
      })
      toast.success(t('invitation.createdToast'))
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
            <CardTitle>{t('invitation.notFoundTitle')}</CardTitle>
            <CardDescription>
              {t('invitation.notFoundDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => navigate('/login')}>
              {t('invitation.goToLogin')}
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
            <CardTitle>{t('invitation.unavailableTitle')}</CardTitle>
            <CardDescription>{info.invalidReason}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => navigate('/login')}>
              {t('invitation.goToLogin')}
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
          <CardTitle>{t('invitation.joinTitle', { name: info.tenantName })}</CardTitle>
          <CardDescription>
            <Trans
              i18nKey="invitation.invitedBody"
              ns="auth"
              values={{ email: info.email, roleName: info.roleName }}
              components={{ strong: <strong /> }}
            />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="full-name">{t('invitation.fullNameLabel')}</Label>
              <Input
                id="full-name"
                required
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('invitation.fullNamePlaceholder')}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t('invitation.passwordLabel')}</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('invitation.passwordPlaceholder')}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">{t('invitation.confirmPasswordLabel')}</Label>
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
              {t('invitation.expiresAt', { date: formatDateTime(info.expiresAt) })}
            </p>

            <Button type="submit" disabled={submitting || fullName.trim().length < 2 || password.length < 6}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {t('invitation.createAccount')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
