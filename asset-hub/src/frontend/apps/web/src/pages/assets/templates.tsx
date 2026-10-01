import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Edit, Trash2, Copy } from 'lucide-react'
import { assetTemplateService } from '@/services/asset-template.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AssetTemplateFormSheet } from './components/asset-template-form-sheet'
import { SystemTemplateLibraryModal } from './components/system-template-library-modal'
import { usePermissions } from '@/hooks/use-permissions'
import { useTranslation } from 'react-i18next'

export default function AssetsTemplates() {
  const { t } = useTranslation('assets')
  const { can } = usePermissions()
  const canCreate = can('asset-templates:create')
  const canUpdate = can('asset-templates:update')
  const canDelete = can('asset-templates:delete')
  const canClone = can('asset-templates:clone')
  const queryClient = useQueryClient()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { data: templates, isLoading } = useQuery({
    queryKey: ['asset-templates'],
    queryFn: () => assetTemplateService.getTemplates(),
  })

  const tenantTemplates = useMemo(() => templates?.filter(t => !t.isSystemTemplate) || [], [templates])
  const totalCount = tenantTemplates.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const currentPage = Math.min(page, totalPages)

  const pagedTemplates = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return tenantTemplates.slice(start, start + pageSize)
  }, [tenantTemplates, currentPage, pageSize])

  const deleteMutation = useMutation({
    mutationFn: assetTemplateService.deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-templates'] })
      toast.success(t('toast.templateDeleted'))
    },
    onError: () => toast.error(t('toast.templateDeleteError'))
  })

  const cloneMutation = useMutation({
    mutationFn: assetTemplateService.cloneTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-templates'] })
      toast.success(t('toast.templateCloned'))
    },
    onError: () => toast.error(t('toast.templateCloneError'))
  })

  const handleCreate = () => {
    setEditingTemplate(null)
    setIsFormOpen(true)
  }

  const handleEdit = (template: any) => {
    setEditingTemplate(template)
    setIsFormOpen(true)
  }

  const handleClone = (template: any) => {
    const newCode = window.prompt(t('dialog.promptNewCode'), `${template.code}_COPY`)
    if (!newCode) return
    const newName = window.prompt(t('dialog.promptNewName'), `${template.name} (Copia)`)
    if (!newName) return

    cloneMutation.mutate({ sourceTemplateId: template.id, newCode, newName })
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <CardTitle>{t('templates.pageTitle')}</CardTitle>
            <CardDescription className="mt-1.5">
              {t('templates.pageDescription')}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <SystemTemplateLibraryModal />
            {canCreate && (
              <Button size="icon" onClick={handleCreate} title={t('templates.createFromScratch')}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-auto">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : templates?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <p className="text-muted-foreground mb-4">{t('templates.emptyList')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[800px]">
                  <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">{t('fields.code')}</TableHead>
                    <TableHead>{t('fields.name')}</TableHead>
                    <TableHead>{t('table.headers.description')}</TableHead>
                    <TableHead className="w-[100px]">{t('table.headers.version')}</TableHead>
                    <TableHead className="w-[100px]">{t('fields.status')}</TableHead>
                    <TableHead className="w-[100px] text-right">{t('table.headers.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedTemplates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.code}</TableCell>
                      <TableCell>{template.name}</TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[200px]">
                        {template.description}
                      </TableCell>
                      <TableCell>v{template.version}</TableCell>
                      <TableCell>
                        {template.isActive ? (
                          <Badge variant="default" className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20">{t('status.active')}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('status.inactive')}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canUpdate && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => handleEdit(template)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {canClone && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title={t('templates.cloneTitle')}
                            onClick={() => handleClone(template)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (confirm(t('dialog.deleteTemplateConfirm'))) {
                                deleteMutation.mutate(template.id)
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </div>
          {/* Pagination Controls */}
          {!isLoading && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border px-4 py-3 shrink-0">
              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                <span className="text-sm text-muted-foreground">
                  {t('templates.totalTemplates', { count: totalCount })}
                </span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">{t('pagination.perPage', { size: 10 })}</SelectItem>
                    <SelectItem value="20">{t('pagination.perPage', { size: 20 })}</SelectItem>
                    <SelectItem value="50">{t('pagination.perPage', { size: 50 })}</SelectItem>
                    <SelectItem value="100">{t('pagination.perPage', { size: 100 })}</SelectItem>
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
                  {t('pagination.previous')}
                </Button>
                <div className="flex items-center text-sm px-2">
                  {t('pagination.pageOf', { current: currentPage, total: totalPages })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  {t('pagination.next')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AssetTemplateFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        template={editingTemplate}
      />
    </div>
  )
}

