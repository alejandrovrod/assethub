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
import { CommunicationTemplateFormSheet } from './components/communication-template-form-sheet'
import { VersionHistorySheet } from './components/version-history-sheet'
import { RenderPreviewDialog } from './components/render-preview-dialog'

const SCOPE_LABELS: Record<CommunicationEntityScope, string> = {
  incident: 'Incidencia',
  maintenanceOrder: 'Orden de Mantenimiento',
  workTask: 'Tarea de Trabajo',
  asset: 'Activo',
}

const TYPE_LABELS: Record<CommunicationTemplateType, string> = {
  email: 'Email',
  document: 'Documento',
}

export default function CommunicationTemplatesPage() {
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
      toast.success('Plantilla eliminada exitosamente')
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
      confirm(`¿Eliminar la plantilla "${template.name}" y todas sus versiones?`)
    ) {
      deleteMutation.mutate(template.id)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Plantillas de Comunicación</h1>
          <p className="text-sm text-muted-foreground">
            Plantillas de email y documentos multi-idioma para notificaciones del sistema
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingTemplateId(null)
            setIsFormOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nueva Plantilla
        </Button>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="border-b pb-4">
          <CardTitle>Plantillas</CardTitle>
          <CardDescription>
            Definí el contenido de los correos que envía el sistema por evento
            (orden creada, tarea asignada, cambio de estado de activo).
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <input
              className="h-9 w-64 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Buscar por código o nombre..."
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
                <SelectValue placeholder="Ámbito" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los ámbitos</SelectItem>
                <SelectItem value="incident">Incidencias</SelectItem>
                <SelectItem value="maintenanceOrder">Órdenes</SelectItem>
                <SelectItem value="workTask">Tareas</SelectItem>
                <SelectItem value="asset">Activos</SelectItem>
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
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="document">Documento</SelectItem>
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
              <p>No hay plantillas configuradas</p>
              <p className="text-xs">
                Sin plantilla, el sistema usa el texto por defecto hardcodeado
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Ámbito</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Idiomas</TableHead>
                  <TableHead>Versión activa</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.code}</TableCell>
                    <TableCell>{t.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {SCOPE_LABELS[t.entityScope] ?? t.entityScope}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {TYPE_LABELS[t.templateType] ?? t.templateType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {t.locales.map((l) => (
                          <Badge key={l} variant="outline" className="uppercase">
                            {l}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {t.activeVersionNumber
                        ? `v${t.activeVersionNumber} (${t.versionCount} en total)`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Previsualizar"
                          onClick={() => setPreviewTemplateId(t.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Versiones"
                          onClick={() => setHistoryTemplateId(t.id)}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Nueva versión"
                          onClick={() => {
                            setEditingTemplateId(t.id)
                            setIsFormOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Eliminar"
                          onClick={() => handleDelete(t)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
            Total: {totalCount}
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
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
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
