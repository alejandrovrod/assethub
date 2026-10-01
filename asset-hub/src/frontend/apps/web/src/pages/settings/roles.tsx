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
import { useTranslation } from 'react-i18next'

export default function SettingsRoles() {
  const queryClient = useQueryClient()
  const { can } = usePermissions()
  const canManage = can('roles:manage')
  const canRead = can('roles:read')
  const { t } = useTranslation('settings')
  const { t: tCommon } = useTranslation('common')

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
      toast.success(editingRoleId ? t('roles.toast.updated') : t('roles.toast.created'))
      setEditorOpen(false)
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
    onError: (error) => handleServerError({ error }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rolesService.deleteRole(id),
    onSuccess: () => {
      toast.success(t('roles.toast.deleted'))
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
            <h3 className="text-lg font-bold tracking-tight">{t('roles.noAccess.title')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('roles.noAccess.body')}
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
          <h1 className="text-2xl font-semibold">{t('roles.pageTitle')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('roles.pageSubtitle')}
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('roles.newRole')}
          </Button>
        )}
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>{t('roles.title')}</CardTitle>
          <CardDescription>
            {t('roles.cardDescription')}
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
                  <TableHead>{tCommon('labels.role')}</TableHead>
                  <TableHead>{tCommon('labels.description')}</TableHead>
                  <TableHead>{tCommon('labels.type')}</TableHead>
                  <TableHead className="text-center">{t('roles.permissions')}</TableHead>
                  <TableHead className="text-center">{t('roles.table.headers.users')}</TableHead>
                  {canManage && <TableHead className="w-24">{tCommon('labels.actions')}</TableHead>}
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
                        {role.isSystemDefault ? t('roles.badge.system') : t('roles.badge.custom')}
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
                            {tCommon('actions.edit')}
                          </Button>
                          {!role.isSystemDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (confirm(t('roles.confirmDelete', { name: role.name }))) {
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
              {editingRoleId ? t('roles.dialog.editTitle', { name }) : t('roles.dialog.newTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('roles.dialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="role-name">{tCommon('labels.name')}</Label>
                <Input
                  id="role-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('roles.dialog.namePlaceholder')}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="role-desc">{tCommon('labels.description')}</Label>
                <Input
                  id="role-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('roles.dialog.descriptionPlaceholder')}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Input
                placeholder={t('roles.dialog.searchPermission')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <span className="text-sm text-muted-foreground">
                {t('roles.dialog.selectedCount', { selected: selectedPerms.size })}
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
                        {t('roles.dialog.partialSelection')}
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
              {tCommon('actions.cancel')}
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
              {editingRoleId ? tCommon('actions.saveChanges') : t('roles.dialog.createRole')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
