import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Shield, ShieldCheck, Trash2 } from 'lucide-react'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { rolesService } from '@/services/roles.service'
import type {
  PermissionCatalogGroup,
  RoleSummary,
} from '@/services/roles.service'
import { handleServerError } from '@/lib/handle-server-error'
import { usePermissions } from '@/hooks/use-permissions'

export default function SettingsRoles() {
  const queryClient = useQueryClient()
  const { can } = usePermissions()
  const canManage = can('roles:manage')
  const canRead = can('roles:read')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)

  // Form state del editor
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => rolesService.getRoles(),
    enabled: canRead,
  })

  const { data: catalog } = useQuery({
    queryKey: ['permission-catalog'],
    queryFn: () => rolesService.getPermissionCatalog(),
    enabled: canManage && editorOpen,
  })

  const openCreate = () => {
    setEditingRoleId(null)
    setName('')
    setDescription('')
    setSelectedPerms(new Set())
    setEditorOpen(true)
  }

  const openEdit = async (role: RoleSummary) => {
    setEditingRoleId(role.id)
    setName(role.name)
    setDescription(role.description)
    setEditorOpen(true)
    // Cargar permisos actuales del rol
    try {
      const detail = await rolesService.getRoleById(role.id)
      setSelectedPerms(new Set(detail.permissionCodes))
    } catch (error) {
      handleServerError({ error })
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const request = {
        name: name.trim(),
        description: description.trim(),
        permissionCodes: Array.from(selectedPerms),
      }
      if (editingRoleId) {
        await rolesService.updateRole(editingRoleId, request)
      } else {
        await rolesService.createRole(request)
      }
    },
    onSuccess: () => {
      toast.success(editingRoleId ? 'Rol actualizado' : 'Rol creado')
      setEditorOpen(false)
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
    onError: (error) => handleServerError({ error }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rolesService.deleteRole(id),
    onSuccess: () => {
      toast.success('Rol eliminado')
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
    onError: (error) => handleServerError({ error }),
  })

  const filteredGroups = useMemo(() => {
    if (!catalog) return []
    const q = search.trim().toLowerCase()
    if (!q) return catalog
    return catalog
      .map((g) => ({
        module: g.module,
        permissions: g.permissions.filter(
          (p) =>
            p.code.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.permissions.length > 0)
  }, [catalog, search])

  const togglePerm = (code: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const toggleModule = (group: PermissionCatalogGroup) => {
    const allCodes = group.permissions.map((p) => p.code)
    const allSelected = allCodes.every((c) => selectedPerms.has(c))
    setSelectedPerms((prev) => {
      const next = new Set(prev)
      allCodes.forEach((c) => {
        if (allSelected) next.delete(c)
        else next.add(c)
      })
      return next
    })
  }

  if (!canRead) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
          <div className="flex flex-col items-center gap-1 text-center">
            <Shield className="h-8 w-8 text-muted-foreground" />
            <h3 className="text-lg font-bold tracking-tight">Sin acceso</h3>
            <p className="text-sm text-muted-foreground">
              No tenés permiso para ver los roles (roles:read).
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
          <h1 className="text-2xl font-semibold">Roles y Permisos</h1>
          <p className="text-sm text-muted-foreground">
            Matriz de permisos por rol del tenant, personalizable por módulo
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Rol
          </Button>
        )}
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>Roles</CardTitle>
          <CardDescription>
            Los roles base del sistema se pueden editar pero no eliminar
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rol</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-center">Permisos</TableHead>
                  <TableHead className="text-center">Usuarios</TableHead>
                  {canManage && <TableHead className="w-24">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(roles ?? []).map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {role.isSystemDefault && (
                          <ShieldCheck className="h-4 w-4 text-primary" />
                        )}
                        {role.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {role.description || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.isSystemDefault ? 'secondary' : 'outline'}>
                        {role.isSystemDefault ? 'Sistema' : 'Custom'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{role.permissionCount}</Badge>
                    </TableCell>
                    <TableCell className="text-center">{role.userCount}</TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(role)}
                          >
                            Editar
                          </Button>
                          {!role.isSystemDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (confirm(`¿Eliminar el rol "${role.name}"?`)) {
                                  deleteMutation.mutate(role.id)
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
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

      {/* Editor de rol con matriz de permisos */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] sm:max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRoleId ? `Editar rol — ${name}` : 'Nuevo rol'}
            </DialogTitle>
            <DialogDescription>
              Definí el nombre y marcá los permisos que el rol otorga. Se
              validan contra el plan del tenant.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="role-name">Nombre</Label>
                <Input
                  id="role-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Supervisor de Planta"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="role-desc">Descripción</Label>
                <Input
                  id="role-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Qué hace este rol"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Input
                placeholder="Buscar permiso..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <span className="text-sm text-muted-foreground">
                {selectedPerms.size} seleccionados
              </span>
            </div>

            <div className="flex flex-col gap-4">
              {(filteredGroups ?? []).map((group) => {
                const allCodes = group.permissions.map((p) => p.code)
                const allSelected = allCodes.every((c) => selectedPerms.has(c))
                const someSelected = allCodes.some((c) => selectedPerms.has(c))
                return (
                  <div
                    key={group.module}
                    className="rounded-lg border overflow-hidden"
                  >
                    <div className="flex items-center justify-between bg-muted/50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={allSelected}
                          onCheckedChange={() => toggleModule(group)}
                        />
                        <span className="text-sm font-medium">
                          {group.module}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {group.permissions.filter((p) =>
                          selectedPerms.has(p.code)
                        ).length}{' '}
                        / {group.permissions.length}
                      </span>
                    </div>
                    <div className="p-2">
                      {group.permissions.map((perm) => (
                        <label
                          key={perm.code}
                          className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
                        >
                          <Switch
                            checked={selectedPerms.has(perm.code)}
                            onCheckedChange={() => togglePerm(perm.code)}
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-mono">{perm.code}</span>
                            <span className="text-xs text-muted-foreground">
                              {perm.description}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                    {someSelected && !allSelected && (
                      <div className="border-t bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
                        Selección parcial
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={saveMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending || name.trim().length < 2
              }
            >
              {saveMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingRoleId ? 'Guardar cambios' : 'Crear rol'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
