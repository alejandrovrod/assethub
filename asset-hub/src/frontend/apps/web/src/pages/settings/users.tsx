import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  MailPlus,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { userService } from '@/services/user.service'
import type { AppUser } from '@/services/user.service'
import { rolesService } from '@/services/roles.service'
import type { RoleSummary } from '@/services/roles.service'
import { handleServerError } from '@/lib/handle-server-error'
import { usePermissions } from '@/hooks/use-permissions'

export default function SettingsUsers() {
  const queryClient = useQueryClient()
  const { can } = usePermissions()
  const canRead = can('users:read')
  const canManage = can('users:manage')
  const canInvite = can('user:invite')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // Modales
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AppUser | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  // Form usuario
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set())

  // Form invitación
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRoleId, setInviteRoleId] = useState('')

  const { data: usersResult, isLoading } = useQuery({
    queryKey: ['users', search, page],
    queryFn: () => userService.getUsers({ search: search || undefined, page }),
    enabled: canRead,
  })

  const { data: invitations } = useQuery({
    queryKey: ['user-invitations'],
    queryFn: () => userService.getInvitations(),
    enabled: canRead,
  })

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => rolesService.getRoles(),
    enabled: canRead,
  })

  const openCreateUser = () => {
    setEditingUser(null)
    setFullName('')
    setEmail('')
    setPassword('')
    setIsActive(true)
    setSelectedRoles(new Set())
    setUserModalOpen(true)
  }

  const openEditUser = (user: AppUser) => {
    setEditingUser(user)
    setFullName(user.fullName)
    setEmail(user.email)
    setPassword('')
    setIsActive(user.isActive)
    setSelectedRoles(new Set(user.roles.map((r) => r.id)))
    setUserModalOpen(true)
  }

  // Mutaciones usuario
  const saveUserMutation = useMutation({
    mutationFn: async () => {
      if (editingUser) {
        await userService.updateUser(editingUser.id, {
          fullName: fullName.trim(),
          isActive,
        })
        // Sincronizar roles (agregar/quitar)
        const current = new Set(editingUser.roles.map((r) => r.id))
        for (const roleId of selectedRoles) {
          if (!current.has(roleId)) await userService.assignRole(editingUser.id, roleId)
        }
        for (const roleId of current) {
          if (!selectedRoles.has(roleId)) await userService.removeRole(editingUser.id, roleId)
        }
      } else {
        await userService.createUser({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          isActive,
          roleIds: Array.from(selectedRoles),
        })
      }
    },
    onSuccess: () => {
      toast.success(editingUser ? 'Usuario actualizado' : 'Usuario creado')
      setUserModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error) => handleServerError({ error }),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => userService.deactivateUser(id),
    onSuccess: () => {
      toast.success('Usuario desactivado')
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error) => handleServerError({ error }),
  })

  const activateMutation = useMutation({
    mutationFn: (id: string) => userService.activateUser(id),
    onSuccess: () => {
      toast.success('Usuario reactivado')
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error) => handleServerError({ error }),
  })

  // Mutaciones invitación
  const inviteMutation = useMutation({
    mutationFn: () =>
      userService.inviteUser({ email: inviteEmail.trim(), roleId: inviteRoleId }),
    onSuccess: (result) => {
      const link = `${window.location.origin}/accept-invitation?token=${result.token}`
      navigator.clipboard
        .writeText(link)
        .then(() => toast.success(`Invitación creada. Link copiado al portapapeles`))
        .catch(() =>
          toast.success('Invitación creada', { description: link })
        )
      setInviteOpen(false)
      setInviteEmail('')
      setInviteRoleId('')
      queryClient.invalidateQueries({ queryKey: ['user-invitations'] })
    },
    onError: (error) => handleServerError({ error }),
  })

  const resendMutation = useMutation({
    mutationFn: (id: string) => userService.resendInvitation(id),
    onSuccess: (result) => {
      const link = `${window.location.origin}/accept-invitation?token=${result.token}`
      navigator.clipboard
        .writeText(link)
        .then(() => toast.success('Invitación reenviada. Link nuevo copiado al portapapeles'))
        .catch(() => toast.success('Invitación reenviada', { description: link }))
      queryClient.invalidateQueries({ queryKey: ['user-invitations'] })
    },
    onError: (error) => handleServerError({ error }),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => userService.cancelInvitation(id),
    onSuccess: () => {
      toast.success('Invitación cancelada')
      queryClient.invalidateQueries({ queryKey: ['user-invitations'] })
    },
    onError: (error) => handleServerError({ error }),
  })

  const toggleRole = (roleId: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) next.delete(roleId)
      else next.add(roleId)
      return next
    })
  }

  const users = usersResult?.items ?? []
  const totalPages = Math.max(1, Math.ceil((usersResult?.totalCount ?? 0) / 20))

  const pendingInvitations = useMemo(
    () => (invitations ?? []).filter((i) => !i.acceptedAt && !i.cancelledAt),
    [invitations]
  )
  const historyInvitations = useMemo(
    () => (invitations ?? []).filter((i) => i.acceptedAt || i.cancelledAt),
    [invitations]
  )

  if (!canRead) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
          <div className="flex flex-col items-center gap-1 text-center">
            <UserRound className="h-8 w-8 text-muted-foreground" />
            <h3 className="text-lg font-bold tracking-tight">Sin acceso</h3>
            <p className="text-sm text-muted-foreground">
              No tenés permiso para ver los usuarios (users:read).
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
          <h1 className="text-2xl font-semibold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Gestión de usuarios del tenant, roles e invitaciones
          </p>
        </div>
        <div className="flex gap-2">
          {canInvite && (
            <Button variant="outline" onClick={() => setInviteOpen(true)}>
              <MailPlus className="mr-2 h-4 w-4" />
              Invitar
            </Button>
          )}
          {canManage && (
            <Button onClick={openCreateUser}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Usuario
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="invitations">
            Invitaciones
            {pendingInvitations.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingInvitations.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab Usuarios */}
        <TabsContent value="users" className="flex flex-col gap-4">
          <Input
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="max-w-sm"
          />

          <Card className="flex flex-1 flex-col overflow-hidden">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Estado</TableHead>
                      {canManage && <TableHead className="w-40">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.fullName}</TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.roles.length === 0 ? (
                              <span className="text-xs text-muted-foreground">Sin rol</span>
                            ) : (
                              user.roles.map((r) => (
                                <Badge key={r.id} variant="secondary" className="gap-1">
                                  <ShieldCheck className="h-3 w-3" />
                                  {r.name}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.isActive ? (
                            <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" />
                              Activo
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              Inactivo
                            </Badge>
                          )}
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEditUser(user)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {user.isActive ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={deactivateMutation.isPending}
                                  onClick={() => {
                                    if (confirm(`¿Desactivar a "${user.fullName}"? No podrá iniciar sesión.`)) {
                                      deactivateMutation.mutate(user.id)
                                    }
                                  }}
                                >
                                  <Ban className="h-4 w-4 text-destructive" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={activateMutation.isPending}
                                  onClick={() => activateMutation.mutate(user.id)}
                                >
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Tab Invitaciones */}
        <TabsContent value="invitations" className="flex flex-col gap-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Pendientes</CardTitle>
              <CardDescription>
                El invitado define su contraseña al aceptar; el link expira en 72hs
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Expira</TableHead>
                    <TableHead>Estado</TableHead>
                    {canInvite && <TableHead className="w-32">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvitations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        No hay invitaciones pendientes
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingInvitations.map((inv) => {
                      const expired = inv.isExpired
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.email}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{inv.roleName}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(inv.expiresAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {expired ? (
                              <Badge variant="destructive">Expirada</Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                <Link2 className="h-3 w-3" />
                                Pendiente
                              </Badge>
                            )}
                          </TableCell>
                          {canInvite && (
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Reenviar (renueva el link)"
                                  disabled={resendMutation.isPending}
                                  onClick={() => resendMutation.mutate(inv.id)}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={cancelMutation.isPending}
                                  onClick={() => {
                                    if (confirm(`¿Cancelar la invitación a "${inv.email}"?`)) {
                                      cancelMutation.mutate(inv.id)
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {historyInvitations.length > 0 && (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Historial</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Creada</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyInvitations.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{inv.roleName}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(inv.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {inv.acceptedAt ? (
                            <Badge className="bg-emerald-100 text-emerald-700">Aceptada</Badge>
                          ) : (
                            <Badge variant="outline">Cancelada</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal crear/editar usuario */}
      <Dialog open={userModalOpen} onOpenChange={setUserModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? `Editar — ${editingUser.fullName}` : 'Nuevo usuario'}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Actualizá el nombre, estado y roles del usuario.'
                : 'Creá el usuario con contraseña inicial y roles.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="user-name">Nombre completo</Label>
              <Input
                id="user-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ana García"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!editingUser}
                placeholder="ana@empresa.com"
              />
            </div>

            {!editingUser && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="user-password">Contraseña inicial</Label>
                <Input
                  id="user-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-2">
                {(roles ?? []).map((role: RoleSummary) => (
                  <label
                    key={role.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/40 has-[:checked]:bg-primary/10 has-[:checked]:border-primary"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={selectedRoles.has(role.id)}
                      onChange={() => toggleRole(role.id)}
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="flex flex-col">
                <span className="text-sm font-medium">Usuario activo</span>
                <span className="text-xs text-muted-foreground">
                  Los usuarios inactivos no pueden iniciar sesión
                </span>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUserModalOpen(false)}
              disabled={saveUserMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => saveUserMutation.mutate()}
              disabled={
                saveUserMutation.isPending ||
                fullName.trim().length < 2 ||
                (!editingUser && (email.trim().length < 3 || password.length < 6))
              }
            >
              {saveUserMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingUser ? 'Guardar cambios' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal invitar usuario */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invitar usuario</DialogTitle>
            <DialogDescription>
              Se genera un link de invitación (72hs de validez) para que el
              invitado defina su contraseña. Copialo y compartilo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-email">Email del invitado</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="companero@empresa.com"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Rol al aceptar</Label>
              <Select value={inviteRoleId} onValueChange={setInviteRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegir rol..." />
                </SelectTrigger>
                <SelectContent>
                  {(roles ?? []).map((role: RoleSummary) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviteOpen(false)}
              disabled={inviteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => inviteMutation.mutate()}
              disabled={
                inviteMutation.isPending ||
                inviteEmail.trim().length < 3 ||
                !inviteEmail.includes('@') ||
                !inviteRoleId
              }
            >
              {inviteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Copy className="mr-2 h-4 w-4" />
              Crear y copiar link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
