import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, Pencil, Trash2, History, Eye, Loader2 } from 'lucide-react'
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
import { communicationTemplateService } from '@/services/communication-template.service'
import type {
  CommunicationEntityScope,
  CommunicationTemplateSummary,
  CommunicationTemplateType,
} from '@/services/communication-template.service'
import { handleServerError } from '@/lib/handle-server-error'
import { usePermissions } from '@/hooks/use-permissions'
import { useTranslation } from 'react-i18next'
import { CommunicationTemplateFormSheet } from './components/communication-template-form-sheet'
import { VersionHistorySheet } from './components/version-history-sheet'
import { RenderPreviewDialog } from './components/render-preview-dialog'

export default function CommunicationTemplatesPage() {
  const { can } = usePermissions()
  const canManage = can('communication-templates:manage')
  const { t } = useTranslation(['communication', 'common'])
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [scopeFilter, setScopeFilter] = useState<CommunicationEntityScope | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<CommunicationTemplateType | 'all'>('all')
  const [search, setSearch] = useState('')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [historyTemplateId, setHistoryTemplateId] = useState<string | null>(null)
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['communication-templates', scopeFilter, typeFilter, search],
    queryFn: () =>
      communicationTemplateService.getTemplates({
        entityScope: scopeFilter === 'all' ? undefined : scopeFilter,
        templateType: typeFilter === 'all' ? undefined : typeFilter,
        search: search || undefined,
      }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => communicationTemplateService.deleteTemplate(id),
    onSuccess: () => {
      toast.success(t('toast.deleted'))
      queryClient.invalidateQueries({ queryKey: ['communication-templates'] })
    },
    onError: (error) => {
      handleServerError({ error })
    },
  })

  const items = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize)

  const handleDelete = (template: CommunicationTemplateSummary) => {
    if (
      confirm(t('dialog.deleteConfirm', { name: template.name }))
    ) {
      deleteMutation.mutate(template.id)
    }
  }

  const scopeLabels: Record<CommunicationEntityScope, string> = {
    incident: t('list.scopeOptions.incident'),
    maintenanceOrder: t('list.scopeOptions.maintenanceOrder'),
    workTask: t('list.scopeOptions.workTask'),
    asset: t('list.scopeOptions.asset'),
  }

  const typeLabels: Record<CommunicationTemplateType, string> = {
    email: t('list.typeOptions.email'),
    document: t('list.typeOptions.document'),
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('common:breadcrumbs.communication-templates')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('list.subtitle')}
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditingTemplateId(null)
              setIsFormOpen(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('list.newTemplate')}
          </Button>
        )}
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="border-b pb-4">
          <CardTitle>{t('list.cardTitle')}</CardTitle>
          <CardDescription>
            {t('list.cardDescription')}
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <input
              className="h-9 w-64 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t('list.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
            <Select
              value={scopeFilter}
              onValueChange={(v) => {
                setScopeFilter(v as CommunicationEntityScope | 'all')
                setPage(1)
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t('list.scope')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('list.scopeAll')}</SelectItem>
                <SelectItem value="incident">{t('list.scopeOptions.incident')}</SelectItem>
                <SelectItem value="maintenanceOrder">{t('list.scopeOptions.maintenanceOrder')}</SelectItem>
                <SelectItem value="workTask">{t('list.scopeOptions.workTask')}</SelectItem>
                <SelectItem value="asset">{t('list.scopeOptions.asset')}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v as CommunicationTemplateType | 'all')
                setPage(1)
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('common:labels.type')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('list.typeAll')}</SelectItem>
                <SelectItem value="email">{t('list.typeOptions.email')}</SelectItem>
                <SelectItem value="document">{t('list.typeOptions.document')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-0">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pageItems.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
              <FileText className="h-8 w-8" />
              <p>{t('empty.templates')}</p>
              <p className="text-xs">
                {t('empty.templatesHint')}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common:labels.code')}</TableHead>
                  <TableHead>{t('common:labels.name')}</TableHead>
                  <TableHead>{t('list.scope')}</TableHead>
                  <TableHead>{t('common:labels.type')}</TableHead>
                  <TableHead>{t('list.headers.languages')}</TableHead>
                  <TableHead>{t('list.headers.activeVersion')}</TableHead>
                  <TableHead className="text-right">{t('common:labels.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((tpl) => (
                  <TableRow key={tpl.id}>
                    <TableCell className="font-mono text-xs">{tpl.code}</TableCell>
                    <TableCell>{tpl.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {scopeLabels[tpl.entityScope] ?? tpl.entityScope}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {typeLabels[tpl.templateType] ?? tpl.templateType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {tpl.locales.map((l) => (
                          <Badge key={l} variant="outline" className="uppercase">
                            {l}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {tpl.activeVersionNumber
                        ? t('list.versionTotal', { version: tpl.activeVersionNumber, total: tpl.versionCount })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t('list.actions.preview')}
                          onClick={() => setPreviewTemplateId(tpl.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t('list.actions.versions')}
                          onClick={() => setHistoryTemplateId(tpl.id)}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t('list.actions.newVersion')}
                              onClick={() => {
                                setEditingTemplateId(tpl.id)
                                setIsFormOpen(true)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t('common:actions.delete')}
                              onClick={() => handleDelete(tpl)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        <div className="flex items-center justify-between border-t px-4 py-3 shrink-0">
          <span className="text-sm text-muted-foreground">
            {t('list.total', { total: totalCount })}
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v))
                setPage(1)
              }}
            >
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {t('common:pagination.page', { page })} {t('common:pagination.of', { total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t('common:pagination.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('common:pagination.next')}
            </Button>
          </div>
        </div>
      </Card>

      <CommunicationTemplateFormSheet
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        templateId={editingTemplateId}
      />

      <VersionHistorySheet
        templateId={historyTemplateId}
        onOpenChange={(open) => {
          if (!open) setHistoryTemplateId(null)
        }}
      />

      <RenderPreviewDialog
        templateId={previewTemplateId}
        onOpenChange={(open) => {
          if (!open) setPreviewTemplateId(null)
        }}
      />
    </div>
  )
}
