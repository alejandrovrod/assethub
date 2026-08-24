import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Pencil, Trash2, Crown, Users } from 'lucide-react'
import { teamService, type TeamSummary, type CreateTeamDto, type UpdateTeamDto } from '@/services/team.service'
import { employeeService } from '@/services/employee.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'

export default function StaffTeams() {
  const queryClient = useQueryClient()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<string | undefined>()
  const [searchTerm, setSearchTerm] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['teams', searchTerm],
    queryFn: () => teamService.getAll({ search: searchTerm || undefined, pageSize: 100 }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => teamService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      toast.success('Equipo eliminado')
    },
    onError: () => toast.error('Error al eliminar equipo'),
  })

  const handleCreate = () => {
    setEditingTeamId(undefined)
    setIsFormOpen(true)
  }

  const handleEdit = (team: TeamSummary) => {
    setEditingTeamId(team.id)
    setIsFormOpen(true)
  }

  const teams = data?.items ?? []

  return (
    <div className="flex flex-col gap-4 p-4 pt-0 h-[calc(100vh-theme(spacing.16))] overflow-hidden">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <div>
            <CardTitle>Equipos</CardTitle>
            <CardDescription>
              Organiza empleados en equipos de trabajo para asignación colectiva.
            </CardDescription>
          </div>
          <Button size="icon" onClick={handleCreate}>
            <Plus className="h-4 w-4" />
          </Button>
        </CardHeader>

        <div className="px-4 py-3 flex items-center gap-3 border-b">
          <Input
            placeholder="Buscar por nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
        </div>

        <CardContent className="flex-1 p-0 overflow-hidden">
          <ScrollArea className="h-full">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : teams.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Miembros</TableHead>
                    <TableHead>Líder</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams.map((team) => (
                    <TableRow key={team.id}>
                      <TableCell className="font-medium">{team.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {team.description || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          <Users className="h-3 w-3 mr-1" />
                          {team.memberCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {team.leadName ? (
                          <span className="flex items-center gap-1">
                            <Crown className="h-3 w-3 text-amber-500" />
                            {team.leadName}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <TooltipProvider>
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(team)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Editar</TooltipContent>
                            </Tooltip>

                            <AlertDialog>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                </TooltipTrigger>
                                <TooltipContent>Eliminar</TooltipContent>
                              </Tooltip>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Eliminar equipo?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Se eliminará el equipo &quot;{team.name}&quot;. Los empleados no se verán afectados.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(team.id)}>
                                    Eliminar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p>No hay equipos registrados.</p>
                <Button variant="link" onClick={handleCreate}>
                  Crear el primero
                </Button>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <TeamFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        teamId={editingTeamId}
      />
    </div>
  )
}

function TeamFormSheet({
  open,
  onOpenChange,
  teamId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  teamId?: string
}) {
  const queryClient = useQueryClient()
  const isEditing = !!teamId

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [members, setMembers] = useState<{ employeeId: string; isLead: boolean }[]>([])

  const { data: employees } = useQuery({
    queryKey: ['employees', 'active'],
    queryFn: () => employeeService.getAll({ isActive: true, pageSize: 200 }),
    enabled: open,
  })

  const { data: teamDetail } = useQuery({
    queryKey: ['team-detail', teamId],
    queryFn: () => teamService.getById(teamId!),
    enabled: open && !!teamId,
  })

  // Sync form when team detail loads
  const [lastLoadedId, setLastLoadedId] = useState<string | undefined>()
  if (teamDetail && teamId !== lastLoadedId) {
    setName(teamDetail.name)
    setDescription(teamDetail.description || '')
    setMembers(teamDetail.members.map(m => ({ employeeId: m.employeeId, isLead: m.isLead })))
    setLastLoadedId(teamId)
  }

  if (!isEditing && lastLoadedId) {
    setName('')
    setDescription('')
    setMembers([])
    setLastLoadedId(undefined)
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreateTeamDto) => teamService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      toast.success('Equipo creado')
      onOpenChange(false)
    },
    onError: () => toast.error('Error al crear equipo'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTeamDto }) =>
      teamService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      toast.success('Equipo actualizado')
      onOpenChange(false)
    },
    onError: () => toast.error('Error al actualizar equipo'),
  })

  const toggleMember = (employeeId: string) => {
    setMembers(prev => {
      const exists = prev.find(m => m.employeeId === employeeId)
      if (exists) return prev.filter(m => m.employeeId !== employeeId)
      return [...prev, { employeeId, isLead: false }]
    })
  }

  const toggleLead = (employeeId: string) => {
    setMembers(prev =>
      prev.map(m => m.employeeId === employeeId ? { ...m, isLead: !m.isLead } : m)
    )
  }

  const handleSubmit = () => {
    const payload = { name, description: description || undefined, members }

    if (isEditing) {
      updateMutation.mutate({ id: teamId!, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const employeeList = employees?.items ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Editar Equipo' : 'Nuevo Equipo'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del equipo" />
          </div>
          <div className="space-y-2">
            <Label>Descripción</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="(opcional)" />
          </div>

          <div className="space-y-2">
            <Label>Miembros ({members.length})</Label>
            <div className="border rounded-md max-h-64 overflow-y-auto">
              {employeeList.map((emp) => {
                const isMember = members.some(m => m.employeeId === emp.id)
                const memberEntry = members.find(m => m.employeeId === emp.id)

                return (
                  <div key={emp.id} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={isMember}
                        onCheckedChange={() => toggleMember(emp.id)}
                      />
                      <span className="text-sm">{emp.firstName} {emp.lastName}</span>
                    </div>
                    {isMember && (
                      <Button
                        variant={memberEntry?.isLead ? 'default' : 'ghost'}
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => toggleLead(emp.id)}
                      >
                        <Crown className="h-3 w-3 mr-1" />
                        Líder
                      </Button>
                    )}
                  </div>
                )
              })}
              {employeeList.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No hay empleados activos
                </div>
              )}
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button onClick={handleSubmit} disabled={isPending || !name || members.length === 0}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEditing ? 'Guardar' : 'Crear'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
