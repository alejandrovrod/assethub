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

export default function SettingsAccount() {
  const queryClient = useQueryClient()
  const { can } = usePermissions()
  const { userProfile, setUserProfile } = useAuthStore()

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
      toast.success('Perfil actualizado correctamente')
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
      toast.success('Contraseña cambiada correctamente')
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
      toast.success('Avatar actualizado correctamente')
    },
    onError: (error) => handleServerError({ error }),
  })

  const setupMfaMutation = useMutation({
    mutationFn: () => authService.setupMfa(),
    onSuccess: (data) => {
      setMfaSetupData(data)
      toast.success('Escanea el código QR con tu app de autenticación')
    },
    onError: (error) => handleServerError({ error }),
  })

  const verifyMfaMutation = useMutation({
    mutationFn: (code: string) => authService.verifyMfa(code),
    onSuccess: () => {
      setMfaVerificationCode('')
      setMfaSetupData(null)
      queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      toast.success('MFA habilitado correctamente')
    },
    onError: (error) => handleServerError({ error }),
  })

  const disableMfaMutation = useMutation({
    mutationFn: (password: string) => authService.disableMfa(password),
    onSuccess: () => {
      setMfaDisablePassword('')
      queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      toast.success('MFA deshabilitado correctamente')
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
      toast.success('Códigos de respaldo regenerados')
    },
    onError: (error) => handleServerError({ error }),
  })

  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('El archivo debe ser una imagen')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('La imagen no debe superar 5MB')
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
      toast.success('Avatar eliminado')
    } catch (error) {
      handleServerError({ error })
    }
  }, [setUserProfile, queryClient, userProfile])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado al portapapeles')
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
      toast.error('Las contraseñas no coinciden')
      return
    }
    if (newPassword.length < 12) {
      toast.error('La contraseña debe tener al menos 12 caracteres')
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
            <h3 className="text-lg font-bold tracking-tight">Sin acceso</h3>
            <p className="text-sm text-muted-foreground">
              No tenés permiso para acceder a esta página.
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
          <h1 className="text-2xl font-semibold">Cuenta y Perfil</h1>
          <p className="text-sm text-muted-foreground">
            Gestioná tu información personal, seguridad y preferencias
          </p>
        </div>
      </div>

      <Tabs defaultValue="profile" className="flex flex-1 flex-col">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">
            <User className="mr-2 h-4 w-4" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="mr-2 h-4 w-4" />
            Seguridad
          </TabsTrigger>
          <TabsTrigger value="mfa" disabled={!canManageMfa}>
            <Key className="mr-2 h-4 w-4" />
            MFA
          </TabsTrigger>
          <TabsTrigger value="employee">
            <Image className="mr-2 h-4 w-4" />
            Empleado vinculado
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="flex flex-1 flex-col gap-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Información Personal</CardTitle>
              <CardDescription>Actualizá tu nombre, email y preferencias</CardDescription>
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
                  <p className="text-sm text-muted-foreground">PNG, JPG hasta 5MB</p>
                  <div className="flex gap-2">
                    {avatarFile && (
                      <Button variant="default" onClick={handleUploadAvatar} disabled={uploadAvatarMutation.isPending}>
                        <Loader2 className={`mr-2 h-4 w-4 ${uploadAvatarMutation.isPending ? 'animate-spin' : ''}`} />
                        Subir
                      </Button>
                    )}
                    {avatarUrl && (
                      <Button variant="outline" onClick={handleRemoveAvatar}>
                        <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                        Eliminar
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fullName">Nombre completo</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tu nombre completo"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="preferredLocale">Idioma preferido</Label>
                <select
                  id="preferredLocale"
                  value={preferredLocale}
                  onChange={(e) => setPreferredLocale(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="es">Español</option>
                  <option value="en">English</option>
                  <option value="pt">Português</option>
                </select>
              </div>

              <Button onClick={saveProfile} disabled={updateProfileMutation.isPending}>
                <Loader2 className={`mr-2 h-4 w-4 ${updateProfileMutation.isPending ? 'animate-spin' : ''}`} />
                Guardar cambios
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="flex flex-1 flex-col gap-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Cambiar Contraseña</CardTitle>
              <CardDescription>Tu contraseña debe tener al menos 12 caracteres</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="currentPassword">Contraseña actual</Label>
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
                <Label htmlFor="newPassword">Nueva contraseña</Label>
<div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 12 caracteres"
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
                  {newPassword.length < 12 ? 'Mínimo 12 caracteres' : 'Contraseña válida'}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword">Confirmar nueva contraseña</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repetí la contraseña"
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
                Cambiar contraseña
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mfa" className="flex flex-1 flex-col gap-6 pt-4">
          {!userProfile?.twoFactorEnabled ? (
            <Card>
              <CardHeader>
                <CardTitle>Autenticación de dos factores (MFA)</CardTitle>
                <CardDescription>
                  Agregá una capa extra de seguridad usando una app de autenticación (Google Authenticator, Authy, Microsoft Authenticator)
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {mfaSetupData ? (
                  <div className="flex flex-col gap-4">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-2">Escaneá este código QR con tu app de autenticación</p>
                      <div className="inline-block p-4 bg-white rounded-lg">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mfaSetupData.qrCodeUri)}`}
                          alt="QR Code MFA"
                          className="h-48 w-48"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Secreto: <code className="text-xs font-mono">{mfaSetupData.secret}</code></p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="mfaCode">Código de 6 dígitos de tu app</Label>
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
                      <p className="font-medium">Códigos de respaldo (guardalos en un lugar seguro)</p>
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
                        Copiar todos
                      </Button>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={() => verifyMfaMutation.mutate(mfaVerificationCode)} disabled={verifyMfaMutation.isPending || mfaVerificationCode.length !== 6}>
                        <Loader2 className={`mr-2 h-4 w-4 ${verifyMfaMutation.isPending ? 'animate-spin' : ''}`} />
                        Verificar y habilitar MFA
                      </Button>
                      <Button variant="outline" onClick={() => setMfaSetupData(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={() => setupMfaMutation.mutate()} disabled={setupMfaMutation.isPending}>
                    <Loader2 className={`mr-2 h-4 w-4 ${setupMfaMutation.isPending ? 'animate-spin' : ''}`} />
                    Configurar MFA
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>MFA Habilitado</CardTitle>
                <CardDescription>Tu cuenta está protegida con autenticación de dos factores</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-4 p-4 bg-green-50 rounded-lg">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-medium">Autenticación de dos factores activa</p>
                    <p className="text-sm text-muted-foreground">Se requiere código TOTP al iniciar sesión</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="font-medium">Códigos de respaldo</p>
                  <p className="text-sm text-muted-foreground">
                    Usá estos códigos si perdés acceso a tu app de autenticación. Cada código se puede usar una sola vez.
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
                      Ver códigos de respaldo
                    </Button>
                  )}
                  {backupCodes.length > 0 && (
                    <Button variant="outline" onClick={() => regenerateBackupCodesMutation.mutate()} disabled={regenerateBackupCodesMutation.isPending}>
                      <Loader2 className={`mr-2 h-4 w-4 ${regenerateBackupCodesMutation.isPending ? 'animate-spin' : ''}`} />
                      Regenerar códigos (invalida los anteriores)
                    </Button>
                  )}
                </div>

                <Separator />

                <div className="flex flex-col gap-2">
                  <p className="font-medium">Deshabilitar MFA</p>
                  <p className="text-sm text-muted-foreground">
                    Requiere tu contraseña actual para confirmar
                  </p>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="mfaDisablePassword">Contraseña actual</Label>
                    <Input
                      id="mfaDisablePassword"
                      type="password"
                      value={mfaDisablePassword}
                      onChange={(e) => setMfaDisablePassword(e.target.value)}
                      placeholder="Tu contraseña actual"
                    />
                  </div>
                  <Button variant="destructive" onClick={() => disableMfaMutation.mutate(mfaDisablePassword)} disabled={disableMfaMutation.isPending || !mfaDisablePassword}>
                    <Loader2 className={`mr-2 h-4 w-4 ${disableMfaMutation.isPending ? 'animate-spin' : ''}`} />
                    Deshabilitar MFA
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
                <CardTitle>Empleado Vinculado</CardTitle>
                <CardDescription>Tu cuenta de usuario está vinculada a este empleado</CardDescription>
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
                    <p className="text-sm text-muted-foreground">{userProfile.linkedEmployee.phoneNumber || 'Sin teléfono'}</p>
                    <Badge variant="secondary" className="mt-2">{userProfile.linkedEmployee.roleLabel || 'Sin rol asignado'}</Badge>
                  </div>
                </div>

                <Separator />

                <div className="flex flex-col gap-2">
                  <p className="font-medium">Desvincular empleado</p>
                  <p className="text-sm text-muted-foreground">
                    Esto desvinculará tu cuenta de usuario de este empleado. Podrás volver a vincularla desde la gestión de empleados.
                  </p>
                  <Button variant="destructive" onClick={() => toast.info('Función de desvinculación por implementar')}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Desvincular empleado
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="flex flex-1 flex-col items-center justify-center">
              <CardContent className="flex flex-col items-center gap-4 text-center">
                <User className="h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Sin empleado vinculado</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Tu cuenta de usuario no está vinculada a ningún empleado. Un administrador puede vincularte desde la gestión de empleados.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}