import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Pencil, Trash2, UserCheck, UserX } from 'lucide-react'
import { employeeService, type EmployeeSummary, type CreateEmployeeDto, type UpdateEmployeeDto } from '@/services/employee.service'
import { catalogService, type CatalogItem } from '@/services/catalog.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'

export default function StaffEmployees() {
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
    queryKey: ['catalog-items', 'roles'],
    queryFn: () => catalogService.getCatalogItems('roles', 'es').catch(() => [] as CatalogItem[]),
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
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Empleado
          </Button>
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
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(emp)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Editar</TooltipContent>
                            </Tooltip>

                            {emp.isActive && (
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
                <Button variant="link" onClick={handleCreate}>
                  Crear el primero
                </Button>
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
      />
    </div>
  )
}

function EmployeeFormSheet({
  open,
  onOpenChange,
  employee,
  roles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: EmployeeSummary
  roles: CatalogItem[]
}) {
  const queryClient = useQueryClient()
  const isEditing = !!employee

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [roleCatalogItemId, setRoleCatalogItemId] = useState('')

  const resetForm = () => {
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

  const createMutation = useMutation({
    mutationFn: (payload: CreateEmployeeDto) => employeeService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Empleado creado')
      onOpenChange(false)
    },
    onError: () => toast.error('Error al crear empleado'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateEmployeeDto }) =>
      employeeService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Empleado actualizado')
      onOpenChange(false)
    },
    onError: () => toast.error('Error al actualizar empleado'),
  })

  const handleSubmit = () => {
    const payload = {
      firstName,
      lastName,
      email,
      phoneNumber: phoneNumber || undefined,
      roleCatalogItemId,
      skills: [],
    }

    if (isEditing) {
      updateMutation.mutate({ id: employee!.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={(val) => { onOpenChange(val); if (val) resetForm() }}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Editar Empleado' : 'Nuevo Empleado'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Nombre" />
          </div>
          <div className="space-y-2">
            <Label>Apellido</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Apellido" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@empresa.com" />
          </div>
          <div className="space-y-2">
            <Label>Teléfono</Label>
            <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="(opcional)" />
          </div>
          <div className="space-y-2">
            <Label>Rol</Label>
            <Select value={roleCatalogItemId} onValueChange={setRoleCatalogItemId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar rol" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter>
          <Button onClick={handleSubmit} disabled={isPending || !firstName || !lastName || !email || !roleCatalogItemId}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEditing ? 'Guardar' : 'Crear'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
