import { useState, useCallback, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Shield, Key, User, Image, Eye, EyeOff, Copy, Trash2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/store/auth.store'
import { usePermissions } from '@/hooks/use-profile'
import { handleServerError } from '@/lib/handle-server-error'
import { getMediaUrl } from '@/lib/api-client'
import { useTranslation } from 'react-i18next'

export default function SettingsAccount() {
  const queryClient = useQueryClient()
  const { can } = usePermissions()
  const { userProfile, setUserProfile } = useAuthStore()
  const { t } = useTranslation('settings')
  const { t: tCommon } = useTranslation('common')

  const canManageProfile = can('users:manage') || can('profile:update')
  const canManageMfa = can('mfa:configure')

  // Profile tab state
  const [fullName, setFullName] = useState(userProfile?.fullName ?? '')
  const [email, setEmail] = useState(userProfile?.email ?? '')
  const [preferredLocale, setPreferredLocale] = useState(userProfile?.preferredLocale ?? 'es')
  const [avatarUrl, setAvatarUrl] = useState(userProfile?.avatarUrl ?? '')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)

  useEffect(() => {
    if (userProfile) {
      setFullName(userProfile.fullName ?? '')
      setEmail(userProfile.email ?? '')
      setPreferredLocale(userProfile.preferredLocale ?? 'es')
      setAvatarUrl(userProfile.avatarUrl ?? '')
    }
  }, [userProfile])

  // Security tab state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // MFA state
  const [mfaSetupData, setMfaSetupData] = useState<{
    secret: string
    qrCodeUri: string
    backupCodes: string[]
  } | null>(null)
  const [mfaVerificationCode, setMfaVerificationCode] = useState('')
  const [mfaDisablePassword, setMfaDisablePassword] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])

  // Mutations
  const updateProfileMutation = useMutation({
    mutationFn: (data: { fullName: string; email: string; preferredLocale: string }) =>
      authService.updateProfile(data),
    onSuccess: (data) => {
      setUserProfile(data)
      toast.success(t('account.toasts.profileUpdated'))
    },
    onError: (error) => handleServerError({ error }),
  })

  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
      authService.changePassword(data),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success(t('account.toasts.passwordChanged'))
    },
    onError: (error) => handleServerError({ error }),
  })

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => authService.uploadAvatar(file),
    onSuccess: (data) => {
      setAvatarUrl(data.url)
      setAvatarPreview(null)
      setAvatarFile(null)
      queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      toast.success(t('account.toasts.avatarUpdated'))
    },
    onError: (error) => handleServerError({ error }),
  })

  const setupMfaMutation = useMutation({
    mutationFn: () => authService.setupMfa(),
    onSuccess: (data) => {
      setMfaSetupData(data)
      toast.success(t('account.toasts.scanQr'))
    },
    onError: (error) => handleServerError({ error }),
  })

  const verifyMfaMutation = useMutation({
    mutationFn: (code: string) => authService.verifyMfa(code),
    onSuccess: () => {
      setMfaVerificationCode('')
      setMfaSetupData(null)
      queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      toast.success(t('account.toasts.mfaEnabled'))
    },
    onError: (error) => handleServerError({ error }),
  })

  const disableMfaMutation = useMutation({
    mutationFn: (password: string) => authService.disableMfa(password),
    onSuccess: () => {
      setMfaDisablePassword('')
      queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      toast.success(t('account.toasts.mfaDisabled'))
    },
    onError: (error) => handleServerError({ error }),
  })

  const getBackupCodesMutation = useMutation({
    mutationFn: () => authService.getBackupCodes(),
    onSuccess: (data) => {
      setBackupCodes(data)
    },
    onError: (error) => handleServerError({ error }),
  })

  const regenerateBackupCodesMutation = useMutation({
    mutationFn: () => authService.regenerateBackupCodes(),
    onSuccess: (data) => {
      setBackupCodes(data)
      toast.success(t('account.toasts.backupCodesRegenerated'))
    },
    onError: (error) => handleServerError({ error }),
  })

  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error(t('account.toasts.avatarMustBeImage'))
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t('account.toasts.avatarTooLarge'))
        return
      }
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onload = (event) => {
        setAvatarPreview(event.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const handleUploadAvatar = useCallback(() => {
    if (avatarFile) {
      uploadAvatarMutation.mutate(avatarFile)
    }
  }, [avatarFile, uploadAvatarMutation])

  const handleRemoveAvatar = useCallback(async () => {
    try {
      await authService.uploadAvatar(new File([''], 'empty.png', { type: 'image/png' }))
      setAvatarUrl('')
      if (userProfile) {
        setUserProfile({ ...userProfile, avatarUrl: '' })
      }
      queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      toast.success(t('account.toasts.avatarRemoved'))
    } catch (error) {
      handleServerError({ error })
    }
  }, [setUserProfile, queryClient, userProfile])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    toast.success(t('account.toasts.copied'))
  }, [])

  const saveProfile = () => {
    updateProfileMutation.mutate({
      fullName: fullName.trim(),
      email: email.trim(),
      preferredLocale,
    })
  }

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast.error(tCommon('validation.mustMatch'))
      return
    }
    if (newPassword.length < 12) {
      toast.error(tCommon('validation.minLength', { min: 12 }))
      return
    }
    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
      confirmPassword,
    })
  }

  const passwordStrength = newPassword.length === 0 ? 0 : Math.min(100, (newPassword.length / 12) * 100)

  if (!canManageProfile && !canManageMfa) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
          <div className="flex flex-col items-center gap-1 text-center">
            <Shield className="h-8 w-8 text-muted-foreground" />
            <h3 className="text-lg font-bold tracking-tight">{t('account.noAccess.title')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('account.noAccess.body')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('account.pageTitle')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('account.pageSubtitle')}
          </p>
        </div>
      </div>

      <Tabs defaultValue="profile" className="flex flex-1 flex-col">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">
            <User className="mr-2 h-4 w-4" />
            {t('account.profile')}
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="mr-2 h-4 w-4" />
            {t('account.security')}
          </TabsTrigger>
          <TabsTrigger value="mfa" disabled={!canManageMfa}>
            <Key className="mr-2 h-4 w-4" />
            {t('account.tabs.mfa')}
          </TabsTrigger>
          <TabsTrigger value="employee">
            <Image className="mr-2 h-4 w-4" />
            {t('account.tabs.linkedEmployee')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="flex flex-1 flex-col gap-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('account.profileCard.title')}</CardTitle>
              <CardDescription>{t('account.profileCard.description')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-6">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    {avatarPreview ? (
                      <AvatarImage src={avatarPreview} alt={fullName} />
                    ) : avatarUrl ? (
                      <AvatarImage src={getMediaUrl(avatarUrl)} alt={fullName} />
                    ) : (
                      <AvatarFallback className="text-2xl">{fullName.charAt(0).toUpperCase()}</AvatarFallback>
                    )}
                  </Avatar>
                  <label className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors">
                    <Image className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="sr-only"
                      id="avatar-upload"
                    />
                  </label>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">{t('account.avatar.hint')}</p>
                  <div className="flex gap-2">
                    {avatarFile && (
                      <Button variant="default" onClick={handleUploadAvatar} disabled={uploadAvatarMutation.isPending}>
                        <Loader2 className={`mr-2 h-4 w-4 ${uploadAvatarMutation.isPending ? 'animate-spin' : ''}`} />
                        {tCommon('actions.upload')}
                      </Button>
                    )}
                    {avatarUrl && (
                      <Button variant="outline" onClick={handleRemoveAvatar}>
                        <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                        {tCommon('actions.delete')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fullName">{t('form.fullName')}</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t('account.form.fullNamePlaceholder')}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">{tCommon('labels.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('account.form.emailPlaceholder')}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="preferredLocale">{t('account.form.preferredLanguage')}</Label>
                <select
                  id="preferredLocale"
                  value={preferredLocale}
                  onChange={(e) => setPreferredLocale(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="es">{tCommon('language.es')}</option>
                  <option value="en">{tCommon('language.en')}</option>
                  <option value="pt">{t('account.form.languagePt')}</option>
                </select>
              </div>

              <Button onClick={saveProfile} disabled={updateProfileMutation.isPending}>
                <Loader2 className={`mr-2 h-4 w-4 ${updateProfileMutation.isPending ? 'animate-spin' : ''}`} />
                {tCommon('actions.saveChanges')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="flex flex-1 flex-col gap-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('account.changePassword')}</CardTitle>
              <CardDescription>{t('account.password.description')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="currentPassword">{t('account.password.current')}</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="newPassword">{t('account.password.new')}</Label>
<div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t('account.password.minChars')}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${passwordStrength}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                  {newPassword.length < 12 ? t('account.password.minChars') : t('account.password.valid')}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword">{t('account.password.confirm')}</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('account.password.confirmPlaceholder')}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button onClick={handleChangePassword} disabled={changePasswordMutation.isPending}>
                <Loader2 className={`mr-2 h-4 w-4 ${changePasswordMutation.isPending ? 'animate-spin' : ''}`} />
                {t('account.changePassword')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mfa" className="flex flex-1 flex-col gap-6 pt-4">
          {!userProfile?.twoFactorEnabled ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('account.mfa.title')}</CardTitle>
                <CardDescription>
                  {t('account.mfa.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {mfaSetupData ? (
                  <div className="flex flex-col gap-4">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-2">{t('account.mfa.scanQr')}</p>
                      <div className="inline-block p-4 bg-white rounded-lg">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mfaSetupData.qrCodeUri)}`}
                          alt={t('account.mfa.qrAlt')}
                          className="h-48 w-48"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{t('account.mfa.secretLabel')} <code className="text-xs font-mono">{mfaSetupData.secret}</code></p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="mfaCode">{t('account.mfa.codeLabel')}</Label>
                      <Input
                        id="mfaCode"
                        value={mfaVerificationCode}
                        onChange={(e) => setMfaVerificationCode(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                        autoComplete="one-time-code"
                      />
                    </div>

                    <div className="flex flex-col gap-2 p-4 bg-muted rounded-lg">
                      <p className="font-medium">{t('account.mfa.backupCodesTitle')}</p>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {mfaSetupData.backupCodes.map((code, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-background rounded">
                            <code className="font-mono text-sm flex-1">{code}</code>
                            <Button variant="ghost" size="icon" onClick={() => copyToClipboard(code)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button variant="outline" onClick={() => copyToClipboard(mfaSetupData.backupCodes.join('\n'))}>
                        <Copy className="mr-2 h-4 w-4" />
                        {t('account.mfa.copyAll')}
                      </Button>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={() => verifyMfaMutation.mutate(mfaVerificationCode)} disabled={verifyMfaMutation.isPending || mfaVerificationCode.length !== 6}>
                        <Loader2 className={`mr-2 h-4 w-4 ${verifyMfaMutation.isPending ? 'animate-spin' : ''}`} />
                        {t('account.mfa.verifyEnable')}
                      </Button>
                      <Button variant="outline" onClick={() => setMfaSetupData(null)}>
                        {tCommon('actions.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={() => setupMfaMutation.mutate()} disabled={setupMfaMutation.isPending}>
                    <Loader2 className={`mr-2 h-4 w-4 ${setupMfaMutation.isPending ? 'animate-spin' : ''}`} />
                    {t('account.mfa.setup')}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t('account.mfa.enabledTitle')}</CardTitle>
                <CardDescription>{t('account.mfa.enabledDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-4 p-4 bg-green-50 rounded-lg">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-medium">{t('account.mfa.active')}</p>
                    <p className="text-sm text-muted-foreground">{t('account.mfa.totpRequired')}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="font-medium">{t('account.mfa.backupCodes')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('account.mfa.backupCodesHint')}
                  </p>
                  {backupCodes.length > 0 ? (
                    <div className="grid gap-1 sm:grid-cols-2">
                      {backupCodes.map((code, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
                          <code className="font-mono text-sm flex-1">{code}</code>
                          <Button variant="ghost" size="icon" onClick={() => copyToClipboard(code)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Button variant="outline" onClick={() => getBackupCodesMutation.mutate()} disabled={getBackupCodesMutation.isPending}>
                      <Loader2 className={`mr-2 h-4 w-4 ${getBackupCodesMutation.isPending ? 'animate-spin' : ''}`} />
                      {t('account.mfa.viewBackupCodes')}
                    </Button>
                  )}
                  {backupCodes.length > 0 && (
                    <Button variant="outline" onClick={() => regenerateBackupCodesMutation.mutate()} disabled={regenerateBackupCodesMutation.isPending}>
                      <Loader2 className={`mr-2 h-4 w-4 ${regenerateBackupCodesMutation.isPending ? 'animate-spin' : ''}`} />
                      {t('account.mfa.regenerateBackupCodes')}
                    </Button>
                  )}
                </div>

                <Separator />

                <div className="flex flex-col gap-2">
                  <p className="font-medium">{t('account.mfa.disableTitle')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('account.mfa.disableHint')}
                  </p>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="mfaDisablePassword">{t('account.password.current')}</Label>
                    <Input
                      id="mfaDisablePassword"
                      type="password"
                      value={mfaDisablePassword}
                      onChange={(e) => setMfaDisablePassword(e.target.value)}
                      placeholder={t('account.mfa.currentPasswordPlaceholder')}
                    />
                  </div>
                  <Button variant="destructive" onClick={() => disableMfaMutation.mutate(mfaDisablePassword)} disabled={disableMfaMutation.isPending || !mfaDisablePassword}>
                    <Loader2 className={`mr-2 h-4 w-4 ${disableMfaMutation.isPending ? 'animate-spin' : ''}`} />
                    {t('account.mfa.disableTitle')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="employee" className="flex flex-1 flex-col gap-6 pt-4">
          {userProfile?.linkedEmployee ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('account.employee.title')}</CardTitle>
                <CardDescription>{t('account.employee.description')}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-xl">
                      {userProfile.linkedEmployee.firstName.charAt(0)}{userProfile.linkedEmployee.lastName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">
                      {userProfile.linkedEmployee.firstName} {userProfile.linkedEmployee.lastName}
                    </h3>
                    <p className="text-sm text-muted-foreground">{userProfile.linkedEmployee.email}</p>
                    <p className="text-sm text-muted-foreground">{userProfile.linkedEmployee.phoneNumber || t('account.employee.noPhone')}</p>
                    <Badge variant="secondary" className="mt-2">{userProfile.linkedEmployee.roleLabel || t('account.employee.noRole')}</Badge>
                  </div>
                </div>

                <Separator />

                <div className="flex flex-col gap-2">
                  <p className="font-medium">{t('account.employee.unlink')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('account.employee.unlinkDescription')}
                  </p>
                  <Button variant="destructive" onClick={() => toast.info(t('account.employee.unlinkNotImplemented'))}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('account.employee.unlink')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="flex flex-1 flex-col items-center justify-center">
              <CardContent className="flex flex-col items-center gap-4 text-center">
                <User className="h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-semibold">{t('account.employee.emptyTitle')}</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {t('account.employee.emptyDescription')}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}