import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Printer } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { communicationTemplateService } from '@/services/communication-template.service'
import { useTranslation } from 'react-i18next'

interface RenderPreviewDialogProps {
  templateId: string | null
  onOpenChange: (open: boolean) => void
}

export function RenderPreviewDialog({
  templateId,
  onOpenChange,
}: RenderPreviewDialogProps) {
  const isOpen = templateId !== null
  const { t } = useTranslation('communication')
  const [locale, setLocale] = useState('es')

  const { data: detail } = useQuery({
    queryKey: ['communication-template', templateId],
    queryFn: () => communicationTemplateService.getTemplateById(templateId!),
    enabled: isOpen,
  })

  const activeVersion = detail?.versions.find(
    (v) => v.id === detail.activeVersionId
  )
  const locales = activeVersion?.translations.map((tr) => tr.locale) ?? ['es']

  const { data: rendered, isLoading } = useQuery({
    queryKey: ['communication-template-render', templateId, locale],
    queryFn: () =>
      communicationTemplateService.renderTemplate(templateId!, {
        locale,
      }),
    enabled: isOpen && activeVersion !== undefined,
  })

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow || !rendered) return
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${detail?.name ?? t('preview.documentFallback')}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #111; }
  </style>
</head>
<body>
  <div>${rendered.body}</div>
</body>
</html>`)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  const isDocument = detail?.templateType === 'document'

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('preview.title', { name: detail?.name ?? '' })}
          </DialogTitle>
          <DialogDescription>
            {t('preview.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Select value={locale} onValueChange={setLocale}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locales.map((l) => (
                <SelectItem key={l} value={l}>
                  {l.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isDocument && rendered && (
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              {t('preview.printPdf')}
            </Button>
          )}
        </div>

        {rendered?.subject && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t('preview.subject')}</span>
            <Input readOnly value={rendered.subject} />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">{t('preview.body')}</span>
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div
              className="max-h-80 overflow-auto rounded-md border p-4 text-sm"
              dangerouslySetInnerHTML={{ __html: rendered?.body ?? '' }}
            />
          )}
        </div>

        {rendered && rendered.availableVariables.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">
              {t('preview.scopeVariables')}
            </span>
            <div className="flex flex-wrap gap-1">
              {rendered.availableVariables.map((v) => (
                <Badge
                  key={v}
                  variant="secondary"
                  className="font-mono text-xs"
                >
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
