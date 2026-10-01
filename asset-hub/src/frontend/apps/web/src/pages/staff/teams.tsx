import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Pencil, Trash2, Crown, Users, Info, UsersRound } from 'lucide-react'
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import { useTranslation } from 'react-i18next'

export default function StaffTeams() {
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const { t } = useTranslation(['staff', 'common'])
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
      toast.success(t('toast.teamDeleted'))
    },
    onError: () => toast.error(t('toast.deleteTeamError')),
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
            <CardTitle>{t('teams.title')}</CardTitle>
            <CardDescription>
              {t('teams.description')}
            </CardDescription>
          </div>
          {can('teams:create') && (
            <Button size="icon" onClick={handleCreate}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>

        <div className="px-4 py-3 flex items-center gap-3 border-b">
          <Input
            placeholder={t('teams.searchPlaceholder')}
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
                    <TableHead>{t('common:labels.name')}</TableHead>
                    <TableHead>{t('common:labels.description')}</TableHead>
                    <TableHead>{t('teams.table.headers.members')}</TableHead>
                    <TableHead>{t('teams.table.headers.lead')}</TableHead>
                    <TableHead className="text-right">{t('common:labels.actions')}</TableHead>
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
                            {can('teams:update') && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => handleEdit(team)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('common:actions.edit')}</TooltipContent>
                              </Tooltip>
                            )}

                            {can('teams:delete') && (
                              <AlertDialog>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                </TooltipTrigger>
                                <TooltipContent>{t('common:actions.delete')}</TooltipContent>
                              </Tooltip>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('teams.dialog.deleteTitle')}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('teams.dialog.deleteBody', { name: team.name })}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(team.id)}>
                                    {t('common:actions.delete')}
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
                <p>{t('teams.empty')}</p>
                {can('teams:create') && (
                  <Button variant="link" onClick={handleCreate}>
                    {t('empty.createFirst')}
                  </Button>
                )}
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


// TeamFormSheet Component
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
  const { t } = useTranslation(['staff', 'common'])
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
      toast.success(t('toast.teamCreated'))
      onOpenChange(false)
    },
    onError: () => toast.error(t('toast.createTeamError')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTeamDto }) =>
      teamService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      toast.success(t('toast.teamUpdated'))
      onOpenChange(false)
    },
    onError: () => toast.error(t('toast.updateTeamError')),
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
      <SheetContent className="sm:max-w-2xl flex flex-col p-0 h-full">
        <div className="px-6 py-6 border-b shrink-0">
          <SheetHeader className="flex flex-row items-center space-x-4 space-y-0 text-left">
            <div className="bg-muted p-3 rounded-md">
              <Users className="h-6 w-6 text-foreground/80" />
            </div>
            <div>
              <SheetTitle className="text-xl font-semibold">
                {isEditing ? t('teams.form.editTitle') : t('teams.form.newTitle')}
              </SheetTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {t('teams.form.sheetDescription')}
              </p>
            </div>
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-8 pb-10">
            
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-muted-foreground">
                <Info className="h-4 w-4" />
                <h4 className="text-sm font-medium">{t('teams.form.infoSection')}</h4>
              </div>
              
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">{t('common:labels.name')} <span className="text-destructive">*</span></Label>
                  <Input 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder={t('teams.form.namePlaceholder')} 
                    className="rounded-md focus-visible:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{t('common:labels.description')}</Label>
                  <Input 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                    placeholder={t('teams.form.descriptionPlaceholder')} 
                    className="rounded-md focus-visible:ring-primary/20"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <div className="border-t my-6"></div>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-muted-foreground">
                  <UsersRound className="h-4 w-4" />
                  <h4 className="text-sm font-medium">{t('teams.form.membersSection')}</h4>
                </div>
                
                <div className="border rounded-md shadow-sm overflow-hidden bg-card">
                  <div className="max-h-[300px] overflow-y-auto">
                    <div className="flex flex-col">
                      {employeeList.map((emp) => {
                        const isMember = members.some(m => m.employeeId === emp.id)
                        const memberEntry = members.find(m => m.employeeId === emp.id)

                        return (
                          <div 
                            key={emp.id} 
                            className={`
                              flex items-center justify-between px-4 py-3 border-b last:border-b-0 transition-colors
                              ${isMember ? 'bg-primary/5' : 'hover:bg-muted/30'}
                            `}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox
                                id={`member-${emp.id}`}
                                checked={isMember}
                                onCheckedChange={() => toggleMember(emp.id)}
                              />
                              <Label 
                                htmlFor={`member-${emp.id}`}
                                className="text-sm font-medium cursor-pointer"
                              >
                                {emp.firstName} {emp.lastName}
                              </Label>
                            </div>
                            {isMember && (
                              <Button
                                variant={memberEntry?.isLead ? 'default' : 'outline'}
                                size="sm"
                                className={`h-7 px-3 text-xs transition-all ${
                                  memberEntry?.isLead ? 'shadow-sm' : 'text-muted-foreground'
                                }`}
                                onClick={() => toggleLead(emp.id)}
                              >
                                <Crown className={`h-3.5 w-3.5 mr-1.5 ${memberEntry?.isLead ? 'text-amber-300' : ''}`} />
                                {memberEntry?.isLead ? t('teams.form.leader') : t('teams.form.makeLeader')}
                              </Button>
                            )}
                          </div>
                        )
                      })}
                      {employeeList.length === 0 && (
                        <div className="p-8 flex flex-col items-center justify-center text-center">
                          <Users className="h-8 w-8 text-muted-foreground/30 mb-3" />
                          <p className="text-sm font-medium text-muted-foreground">{t('teams.form.noEmployees')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t bg-background mt-auto flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isPending || !name || members.length === 0}
            className="w-full sm:w-auto min-w-[140px]"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEditing ? t('common:actions.saveChanges') : t('teams.form.createTeam')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
