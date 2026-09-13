import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { communicationTemplateService } from '@/services/communication-template.service'
import { handleServerError } from '@/lib/handle-server-error'
import { parseApiDate } from '@/lib/utils'

interface VersionHistorySheetProps {
  templateId: string | null
  onOpenChange: (open: boolean) => void
}

export function VersionHistorySheet({
  templateId,
  onOpenChange,
}: VersionHistorySheetProps) {
  const queryClient = useQueryClient()
  const isOpen = templateId !== null

  const { data: detail, isLoading } = useQuery({
    queryKey: ['communication-template', templateId],
    queryFn: () => communicationTemplateService.getTemplateById(templateId!),
    enabled: isOpen,
  })

  const activateMutation = useMutation({
    mutationFn: (versionId: string) =>
      communicationTemplateService.activateVersion(templateId!, versionId),
    onSuccess: () => {
      toast.success('Versión activada exitosamente')
      queryClient.invalidateQueries({ queryKey: ['communication-templates'] })
      queryClient.invalidateQueries({ queryKey: ['communication-template'] })
    },
    onError: (error) => handleServerError({ error }),
  })

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Historial de versiones</SheetTitle>
          <SheetDescription>
            {detail
              ? `${detail.name} (${detail.code}) — activá la versión que el sistema debe usar`
              : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4 pb-6">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            detail?.versions.map((v) => {
              const isActive = v.id === detail.activeVersionId
              return (
                <div
                  key={v.id}
                  className={`flex items-center justify-between rounded-md border p-3 ${
                    isActive ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Versión {v.versionNumber}</span>
                      {isActive && (
                        <Badge className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Activa
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Creada el{' '}
                      {v.createdAt
                        ? parseApiDate(v.createdAt).toLocaleDateString('es')
                        : '—'}
                    </span>
                    <div className="flex gap-1">
                      {v.translations.map((t) => (
                        <Badge
                          key={t.id}
                          variant="outline"
                          className="uppercase text-xs"
                        >
                          {t.locale}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {!isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={activateMutation.isPending}
                      onClick={() => activateMutation.mutate(v.id)}
                    >
                      Activar
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
