import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Pencil, Trash2, Mail, Phone, Shield, User, KeyRound } from 'lucide-react'
import { employeeService, type EmployeeSummary, type CreateEmployeeDto, type UpdateEmployeeDto } from '@/services/employee.service'
import { catalogService, type CatalogItem } from '@/services/catalog.service'
import { rolesService, type RoleSummary } from '@/services/roles.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'

const ROLE_CATALOG_CODE = 'employee-role'

export default function StaffEmployees() {
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeSummary | undefined>()
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('active')

  const { data, isLoading } = useQuery({
    queryKey: ['employees', activeFilter, searchTerm],
    queryFn: () =>
      employeeService.getAll({
        search: searchTerm || undefined,
        isActive: activeFilter === 'all' ? undefined : activeFilter === 'active',
        pageSize: 100,
      }),
  })

  const { data: roles } = useQuery({
    queryKey: ['catalog-items', ROLE_CATALOG_CODE],
    queryFn: () => catalogService.getCatalogItems(ROLE_CATALOG_CODE, 'es').catch(() => [] as CatalogItem[]),
  })

  const { data: systemRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => rolesService.getRoles(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => employeeService.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Empleado desactivado')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al desactivar empleado')
    },
  })

  const handleCreate = () => {
    setEditingEmployee(undefined)
    setIsFormOpen(true)
  }

  const handleEdit = (emp: EmployeeSummary) => {
    setEditingEmployee(emp)
    setIsFormOpen(true)
  }

  const employees = data?.items ?? []

  return (
    <div className="flex flex-col gap-4 p-4 pt-0 h-[calc(100vh-theme(spacing.16))] overflow-hidden">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <div>
            <CardTitle>Empleados</CardTitle>
            <CardDescription>
              Gestión del personal de mantenimiento y operaciones.
            </CardDescription>
          </div>
          {can('employees:create') && (
            <Button size="icon" onClick={handleCreate}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>

        <div className="px-4 py-3 flex items-center gap-3 border-b">
          <Input
            placeholder="Buscar por nombre o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          <Tabs value={activeFilter} onValueChange={setActiveFilter} className="ml-auto">
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="active">Activos</TabsTrigger>
              <TabsTrigger value="inactive">Inactivos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <CardContent className="flex-1 p-0 overflow-hidden">
          <ScrollArea className="h-full">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : employees.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium">
                        {emp.firstName} {emp.lastName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {emp.email}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {emp.phoneNumber || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{emp.roleLabel || '—'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={emp.isActive ? 'default' : 'secondary'}>
                          {emp.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <TooltipProvider>
                          <div className="flex items-center justify-end gap-1">
                            {can('employees:update') && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => handleEdit(emp)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Editar</TooltipContent>
                              </Tooltip>
                            )}

                            {can('employees:delete') && emp.isActive && (
                              <AlertDialog>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent>Desactivar</TooltipContent>
                                </Tooltip>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Desactivar empleado?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Se desactivará a {emp.firstName} {emp.lastName}. No podrá ser asignado a nuevas tareas.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteMutation.mutate(emp.id)}>
                                      Desactivar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p>No hay empleados registrados.</p>
                {can('employees:create') && (
                  <Button variant="link" onClick={handleCreate}>
                    Crear el primero
                  </Button>
                )}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <EmployeeFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        employee={editingEmployee}
        roles={roles ?? []}
        systemRoles={systemRoles ?? []}
      />
    </div>
  )
}

function EmployeeFormSheet({
  open,
  onOpenChange,
  employee,
  roles,
  systemRoles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: EmployeeSummary
  roles: CatalogItem[]
  systemRoles: RoleSummary[]
}) {
  const queryClient = useQueryClient()
  const isEditing = !!employee

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [roleCatalogItemId, setRoleCatalogItemId] = useState('')

  // Acceso al sistema (solo en alta; un empleado editado ya tiene o no usuario)
  const [createUserAccess, setCreateUserAccess] = useState(false)
  const [systemRoleId, setSystemRoleId] = useState('')
  const [temporalPassword, setTemporalPassword] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTemporalPassword(null)
      setCreateUserAccess(false)
      setSystemRoleId('')
      if (employee) {
        setFirstName(employee.firstName)
        setLastName(employee.lastName)
        setEmail(employee.email)
        setPhoneNumber(employee.phoneNumber || '')
        setRoleCatalogItemId(employee.roleCatalogItemId)
      } else {
        setFirstName('')
        setLastName('')
        setEmail('')
        setPhoneNumber('')
        setRoleCatalogItemId('')
      }
    }
  }, [open, employee])

  const createMutation = useMutation({
    mutationFn: (payload: CreateEmployeeDto) => employeeService.create(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      if (result?.temporalPassword) {
        setTemporalPassword(result.temporalPassword)
      } else {
        toast.success('Empleado creado exitosamente')
        onOpenChange(false)
      }
    },
    onError: (error: any) => toast.error(error?.response?.data?.detail || 'Error al crear empleado'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateEmployeeDto }) =>
      employeeService.update(id, payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      if (result?.temporalPassword) {
        setTemporalPassword(result.temporalPassword)
      } else {
        toast.success('Empleado actualizado')
        onOpenChange(false)
      }
    },
    onError: (error: any) => toast.error(error?.response?.data?.detail || 'Error al actualizar empleado'),
  })

  const handleSubmit = () => {
    const basePayload = {
      firstName,
      lastName,
      email,
      phoneNumber: phoneNumber || undefined,
      roleCatalogItemId,
      skills: [],
    }

    if (isEditing) {
      updateMutation.mutate({ 
        id: employee!.id, 
        payload: {
          ...basePayload,
          createUserAccess: !employee?.userId ? createUserAccess : undefined,
          systemRoleId: (!employee?.userId && createUserAccess) ? systemRoleId : undefined,
        } 
      })
    } else {
      createMutation.mutate({
        ...basePayload,
        createUserAccess,
        systemRoleId: createUserAccess ? systemRoleId : undefined,
      })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const isValid =
    firstName.trim() &&
    lastName.trim() &&
    email.trim() &&
    roleCatalogItemId &&
    (!createUserAccess || !!systemRoleId) &&
    !temporalPassword

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        // No cerrar con click fuera mientras se muestra la contraseña temporal
        if (!nextOpen && temporalPassword) return
        onOpenChange(nextOpen)
      }}
    >
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 h-full">
        <SheetHeader className="p-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 text-primary rounded-lg">
              <User className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="text-xl">
                {isEditing ? 'Editar Empleado' : 'Nuevo Empleado'}
              </SheetTitle>
              <SheetDescription>
                {isEditing
                  ? 'Modifica los datos del empleado.'
                  : 'Registra un nuevo miembro del equipo de trabajo.'}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {temporalPassword ? (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2 font-medium">
                  <KeyRound className="h-4 w-4" />
                  Acceso al sistema creado
                </div>
                <p className="text-sm text-muted-foreground">
                  Compartí esta contraseña temporal con {firstName} {lastName}. Deberá
                  cambiarla al iniciar sesión.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-muted px-3 py-2 rounded-md break-all">
                    {temporalPassword}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(temporalPassword)
                        .then(() => toast.success('Contraseña copiada al portapapeles'))
                        .catch(() => toast.error('No se pudo copiar la contraseña'))
                    }}
                  >
                    Copiar
                  </Button>
                </div>
              </div>
              <Button className="w-full" onClick={() => onOpenChange(false)}>
                Listo
              </Button>
            </div>
          </div>
        ) : (
          <>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-6 pb-6">
              {/* Personal Information Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span>Information personal</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="emp-firstName">Nombre <span className="text-destructive">*</span></Label>
                    <Input
                      id="emp-firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Juan"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emp-lastName">Apellido <span className="text-destructive">*</span></Label>
                    <Input
                      id="emp-lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Pérez"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Contact Information Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>Contacto</span>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="emp-email">Email <span className="text-destructive">*</span></Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="emp-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="juan.perez@empresa.com"
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emp-phone">Teléfono</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="emp-phone"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+52 55 1234 5678"
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Role Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  <span>Rol y permisos</span>
                </div>
                <div className="space-y-2">
                  <Label>Puesto de Trabajo <span className="text-destructive">*</span></Label>
                  <Select value={roleCatalogItemId} onValueChange={setRoleCatalogItemId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar puesto del empleado..." />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {roles.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No hay puestos disponibles. Crea el catálogo "employee-role" en el módulo de Catálogos.
                    </p>
                  )}
                </div>

                {(!isEditing || !employee?.userId) && (
                  <div className="space-y-3 pt-2 border-t">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="emp-create-access"
                        checked={createUserAccess}
                        onCheckedChange={(checked) => {
                          setCreateUserAccess(checked === true)
                          if (!checked) setSystemRoleId('')
                        }}
                        className="mt-0.5"
                      />
                      <div>
                        <Label htmlFor="emp-create-access" className="cursor-pointer">
                          ¿Dar acceso al sistema?
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Se creará un usuario con este email, contraseña temporal y el rol
                          de sistema que elijas.
                        </p>
                      </div>
                    </div>

                    {createUserAccess && (
                      <div className="space-y-2">
                        <Label>Rol de Sistema <span className="text-destructive">*</span></Label>
                        <Select value={systemRoleId} onValueChange={setSystemRoleId}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleccionar rol de sistema..." />
                          </SelectTrigger>
                          <SelectContent>
                            {systemRoles.map((role) => (
                              <SelectItem key={role.id} value={role.id}>
                                {role.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {systemRoles.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            No hay roles de sistema configurados. Crea roles en Configuración &gt; Roles.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {isEditing && employee?.userId && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                    <KeyRound className="h-3.5 w-3.5" />
                    Este empleado tiene acceso al sistema vinculado; los cambios de nombre,
                    apellido y email se sincronizarán con su usuario.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 border-t bg-background mt-auto flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || !isValid}
              className="min-w-[140px]"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : isEditing ? (
                'Guardar cambios'
              ) : (
                'Crear empleado'
              )}
            </Button>
          </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
