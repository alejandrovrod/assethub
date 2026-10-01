import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Loader2, Edit, Trash2 } from 'lucide-react'
import { WorkflowTemplateService } from '@/services/workflow-template.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WorkflowTemplateFormSheet } from './components/workflow-template-form-sheet'
import { usePermissions } from '@/hooks/use-permissions'

export default function WorkflowTemplates() {
  const { t } = useTranslation(['maintenance', 'common'])
  const { can } = usePermissions()
  const canCreate = can('workflow-templates:create')
  const canUpdate = can('workflow-templates:update')
  const canDelete = can('workflow-templates:delete')
  const queryClient = useQueryClient()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { data: templates, isLoading } = useQuery({
    queryKey: ['workflow-templates'],
    queryFn: () => WorkflowTemplateService.search(),
  })

  const totalCount = templates?.length || 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const currentPage = Math.min(page, totalPages)

  const pagedTemplates = useMemo(() => {
    if (!templates) return []
    const start = (currentPage - 1) * pageSize
    return templates.slice(start, start + pageSize)
  }, [templates, currentPage, pageSize])

  const deleteMutation = useMutation({
    mutationFn: WorkflowTemplateService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates'] })
      toast.success(t('workflowTemplates.toast.deleted'))
    },
    onError: () => toast.error(t('workflowTemplates.toast.deleteError'))
  })

  const handleCreate = () => {
    setEditingTemplate(null)
    setIsFormOpen(true)
  }

  const handleEdit = (template: any) => {
    // We only have the summary here, so we fetch the full template in the form sheet or here.
    // The form sheet will handle fetching by ID if we pass the ID.
    setEditingTemplate(template)
    setIsFormOpen(true)
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <div>
            <CardTitle>{t('workflowTemplates.title')}</CardTitle>
            <CardDescription>
              {t('workflowTemplates.description')}
            </CardDescription>
          </div>
          {canCreate && (
            <Button size="icon" onClick={handleCreate}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1 min-h-0">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : templates?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <p className="text-muted-foreground mb-4">{t('workflowTemplates.empty')}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">{t('common:labels.code')}</TableHead>
                    <TableHead>{t('common:labels.name')}</TableHead>
                    <TableHead className="w-[150px]">{t('common:labels.type')}</TableHead>
                    <TableHead>{t('common:labels.description')}</TableHead>
                    <TableHead className="w-[100px]">{t('common:labels.status')}</TableHead>
                    <TableHead className="w-[100px] text-right">{t('common:labels.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedTemplates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.code}</TableCell>
                      <TableCell>{template.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {template.type === 'preventive' ? t('common:nav.maintenance') : t('detail.related.incident')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {template.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant={template.isActive ? 'default' : 'secondary'}>
                          {template.isActive ? t('common:status.active') : t('common:status.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {canUpdate && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(template)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (window.confirm(t('workflowTemplates.confirmDelete'))) {
                                deleteMutation.mutate(template.id)
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
          {/* Pagination Controls */}
          {!isLoading && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {t('workflowTemplates.totalCount', { count: totalCount })}
                </span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">{t('pagination.perPage', { count: 10 })}</SelectItem>
                    <SelectItem value="20">{t('pagination.perPage', { count: 20 })}</SelectItem>
                    <SelectItem value="50">{t('pagination.perPage', { count: 50 })}</SelectItem>
                    <SelectItem value="100">{t('pagination.perPage', { count: 100 })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  {t('common:pagination.previous')}
                </Button>
                <div className="flex items-center text-sm px-2">
                  {t('common:pagination.page', { page: currentPage })} {t('common:pagination.of', { total: totalPages })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  {t('common:pagination.next')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <WorkflowTemplateFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        templateId={editingTemplate?.id}
        onSuccess={() => {
          setIsFormOpen(false)
          queryClient.invalidateQueries({ queryKey: ['workflow-templates'] })
        }}
      />
    </div>
  )
}
