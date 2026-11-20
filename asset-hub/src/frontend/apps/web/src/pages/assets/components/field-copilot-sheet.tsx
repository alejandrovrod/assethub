import { ChangeEvent, Fragment, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Loader2,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { assetService } from '@/services/asset.service'
import {
  fieldCopilotService,
  resolveCopilotManualUrl,
  type CopilotConversationTurn,
  type FieldCopilotCitation,
  type FieldCopilotResponse,
} from '@/services/field-copilot.service'
import { usePermissions } from '@/hooks/use-permissions'
import { getApiErrorMessage } from '@/lib/handle-server-error'

interface FieldCopilotSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetId: string
  assetCode: string
  assetName: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'model'
  text: string
  usedVoiceInput?: boolean
  foundInManuals?: boolean
  citations?: FieldCopilotCitation[]
  safetyWarnings?: string[]
  modelUsed?: string
}

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function renderInlineFormatting(text: string): React.ReactNode {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className='font-semibold text-foreground'>
          {token.slice(2, -2)}
        </strong>
      )
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className='rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]'
        >
          {token.slice(1, -1)}
        </code>
      )
    }
    return <Fragment key={idx}>{token}</Fragment>
  })
}

function StructuredAnswerText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/)
  return (
    <div className='space-y-1.5 text-sm leading-relaxed'>
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={idx} className='h-1' />
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className='flex gap-2 pl-1'>
              <span className='mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70' />
              <span>{renderInlineFormatting(trimmed.slice(2))}</span>
            </div>
          )
        }
        return <p key={idx}>{renderInlineFormatting(trimmed)}</p>
      })}
    </div>
  )
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const commaIdx = result.indexOf(',')
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result)
    }
    reader.onerror = () => reject(new Error('Failed to read audio recording'))
    reader.readAsDataURL(blob)
  })
}

export function FieldCopilotSheet({
  open,
  onOpenChange,
  assetId,
  assetCode,
  assetName,
}: FieldCopilotSheetProps) {
  const { t, i18n } = useTranslation(['assets', 'common'])
  const { can } = usePermissions()
  const canUploadAttachments = can('assets:attachments')
  const queryClient = useQueryClient()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [question, setQuestion] = useState('')
  const [manualsExpanded, setManualsExpanded] = useState(false)
  const [expandedSnippetKey, setExpandedSnippetKey] = useState<string | null>(null)
  const [voiceMode, setVoiceMode] = useState<'idle' | 'dictating' | 'recording'>('idle')
  const [isUploadingManual, setIsUploadingManual] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  const manualsQuery = useQuery({
    queryKey: ['asset-copilot-manuals', assetId],
    queryFn: () => fieldCopilotService.getManuals(assetId),
    enabled: open && !!assetId,
  })

  const indexMutation = useMutation({
    mutationFn: (forceReindex: boolean) =>
      fieldCopilotService.indexManuals(assetId, forceReindex),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['asset-copilot-manuals', assetId] })
      toast.success(
        t('copilot.indexedToast', {
          indexed: data.indexedManualsCount,
          total: data.totalManualsCount,
        })
      )
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, t('copilot.indexError')))
    },
  })

  const askMutation = useMutation({
    mutationFn: async (vars: {
      promptText?: string
      audioBase64?: string
      audioMimeType?: string
    }) => {
      const history: CopilotConversationTurn[] = messages.slice(-6).map((m) => ({
        role: m.role,
        text: m.text,
      }))
      const lang = i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'es'
      return fieldCopilotService.ask(assetId, {
        question: vars.promptText,
        audioBase64: vars.audioBase64,
        audioMimeType: vars.audioMimeType,
        history,
        preferredLanguage: lang,
      })
    },
    onSuccess: (res: FieldCopilotResponse) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `model-${Date.now()}`,
          role: 'model',
          text: res.answer,
          foundInManuals: res.foundInManuals,
          citations: res.citations,
          safetyWarnings: res.safetyWarnings,
          modelUsed: res.modelUsed,
        },
      ])
      queryClient.invalidateQueries({ queryKey: ['asset-copilot-manuals', assetId] })
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, t('copilot.askError')))
    },
  })

  const stopActiveVoiceCapture = () => {
    try {
      recognitionRef.current?.stop()
    } catch {
      // Ignore already stopped recognition
    }
    recognitionRef.current = null

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {
        // Ignore recorder stop race
      }
    }
    mediaRecorderRef.current = null

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    setVoiceMode('idle')
  }

  useEffect(() => {
    if (!open) {
      stopActiveVoiceCapture()
    }
    return () => {
      stopActiveVoiceCapture()
    }
  }, [open])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, askMutation.isPending])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      stopActiveVoiceCapture()
      setExpandedSnippetKey(null)
    }
    onOpenChange(nextOpen)
  }

  const handleSendText = (customQuestion?: string) => {
    const trimmed = (customQuestion ?? question).trim()
    if (!trimmed || askMutation.isPending) return

    if (voiceMode !== 'idle') {
      stopActiveVoiceCapture()
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
    }
    setMessages((prev) => [...prev, userMsg])
    if (!customQuestion) setQuestion('')

    askMutation.mutate({ promptText: trimmed })
  }

  const handleToggleVoice = async () => {
    if (voiceMode !== 'idle') {
      stopActiveVoiceCapture()
      return
    }

    const SpeechRec = getSpeechRecognitionConstructor()
    if (SpeechRec) {
      try {
        const recognition = new SpeechRec()
        recognition.lang = i18n.language?.toLowerCase().startsWith('en') ? 'en-US' : 'es-ES'
        recognition.interimResults = false
        recognition.continuous = false
        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((r) => r[0]?.transcript ?? '')
            .join(' ')
            .trim()
          if (transcript) {
            setQuestion((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript))
          }
        }
        recognition.onerror = () => {
          setVoiceMode('idle')
          toast.error(t('copilot.micError'))
        }
        recognition.onend = () => {
          recognitionRef.current = null
          setVoiceMode('idle')
        }
        recognitionRef.current = recognition
        setVoiceMode('dictating')
        recognition.start()
        return
      } catch {
        setVoiceMode('idle')
      }
    }

    // Fallback: record raw audio clip and send directly to Gemini
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error(t('copilot.micUnsupported'))
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const chunks: Blob[] = []

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        mediaRecorderRef.current = null
        setVoiceMode('idle')

        if (chunks.length === 0) return
        const resolvedMime = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunks, { type: resolvedMime })
        try {
          const base64 = await blobToBase64(blob)
          setMessages((prev) => [
            ...prev,
            {
              id: `user-voice-${Date.now()}`,
              role: 'user',
              text: t('copilot.voiceMessageLabel'),
              usedVoiceInput: true,
            },
          ])
          askMutation.mutate({ audioBase64: base64, audioMimeType: resolvedMime })
        } catch {
          toast.error(t('copilot.micError'))
        }
      }

      mediaRecorderRef.current = recorder
      setVoiceMode('recording')
      recorder.start()
    } catch {
      toast.error(t('copilot.micPermissionDenied'))
      stopActiveVoiceCapture()
    }
  }

  const handleManualFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingManual(true)
    try {
      await assetService.uploadAttachment(assetId, file)
      toast.success(t('copilot.manualUploaded'))
      await indexMutation.mutateAsync(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('copilot.uploadError')))
    } finally {
      setIsUploadingManual(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const manualsData = manualsQuery.data
  const quickPrompts = [
    t('copilot.quickPrompts.torque'),
    t('copilot.quickPrompts.bleeding'),
    t('copilot.quickPrompts.safety'),
  ]

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side='right'
        className='flex h-full w-full flex-col gap-0 p-0 sm:max-w-2xl'
      >
        <SheetHeader className='shrink-0 border-b bg-muted/30 px-5 py-4 pr-12'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='min-w-0'>
              <SheetTitle className='flex items-center gap-2 text-base'>
                <Sparkles className='h-4 w-4 text-primary shrink-0' />
                <span className='truncate'>{t('copilot.title')}</span>
                <Badge variant='outline' className='font-mono text-xs'>
                  {assetCode}
                </Badge>
              </SheetTitle>
              <SheetDescription className='mt-0.5 truncate text-xs'>
                {assetName} · {t('copilot.subtitle')}
              </SheetDescription>
            </div>
          </div>

          <div className='mt-3 flex flex-wrap items-center justify-between gap-2'>
            <button
              type='button'
              onClick={() => setManualsExpanded((prev) => !prev)}
              className='inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted/60 transition-colors'
            >
              <BookOpen className='h-3.5 w-3.5 text-primary' />
              {manualsQuery.isLoading ? (
                <span>{t('copilot.loadingManuals')}</span>
              ) : (
                <span>
                  {t('copilot.manualsCount', {
                    indexed: manualsData?.indexedManualsCount ?? 0,
                    total: manualsData?.totalManualsCount ?? 0,
                  })}
                </span>
              )}
              {manualsExpanded ? (
                <ChevronUp className='h-3.5 w-3.5 text-muted-foreground' />
              ) : (
                <ChevronDown className='h-3.5 w-3.5 text-muted-foreground' />
              )}
            </button>

            <div className='flex items-center gap-2'>
              {canUploadAttachments && (
                <>
                  <input
                    ref={fileInputRef}
                    type='file'
                    accept='.pdf,.txt,.md,.docx,.csv,.html,.xml,application/pdf'
                    className='hidden'
                    onChange={handleManualFileUpload}
                  />
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='h-7 text-xs'
                    disabled={isUploadingManual || indexMutation.isPending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploadingManual ? (
                      <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                    ) : (
                      <Upload className='mr-1.5 h-3.5 w-3.5' />
                    )}
                    {t('copilot.uploadManual')}
                  </Button>
                </>
              )}

              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-7 text-xs'
                disabled={
                  indexMutation.isPending ||
                  manualsQuery.isLoading ||
                  (manualsData?.totalManualsCount ?? 0) === 0
                }
                onClick={() => indexMutation.mutate(false)}
              >
                {indexMutation.isPending ? (
                  <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                ) : (
                  <RefreshCw className='mr-1.5 h-3.5 w-3.5' />
                )}
                {t('copilot.syncIndex')}
              </Button>
            </div>
          </div>

          {manualsExpanded && manualsData && (
            <div className='mt-2.5 max-h-40 space-y-1.5 overflow-y-auto rounded-md border bg-background p-2'>
              {manualsData.manuals.length === 0 ? (
                <p className='px-1 py-2 text-xs text-muted-foreground'>
                  {t('copilot.noManualsHint')}
                </p>
              ) : (
                manualsData.manuals.map((m) => (
                  <div
                    key={m.fileHash}
                    className='flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50'
                  >
                    <div className='flex min-w-0 items-center gap-2'>
                      <FileText className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                      <span className='truncate font-medium'>{m.fileName}</span>
                      <span className='shrink-0 text-muted-foreground'>
                        ({formatBytes(m.sizeBytes)})
                      </span>
                    </div>
                    <div className='flex shrink-0 items-center gap-2'>
                      <Badge
                        variant='outline'
                        className={
                          m.isIndexed
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        }
                      >
                        {m.isIndexed ? t('copilot.statusIndexed') : t('copilot.statusPending')}
                      </Badge>
                      {m.downloadUrl && (
                        <a
                          href={resolveCopilotManualUrl(m.downloadUrl)}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-primary hover:underline'
                          title={t('copilot.openDocument')}
                        >
                          <ExternalLink className='h-3.5 w-3.5' />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </SheetHeader>

        {/* Scrollable conversation area */}
        <div className='flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4'>
          {manualsData && manualsData.totalManualsCount === 0 && (
            <Alert>
              <AlertTriangle className='h-4 w-4' />
              <AlertTitle>{t('copilot.emptyManualsTitle')}</AlertTitle>
              <AlertDescription className='text-xs'>
                {t('copilot.noManualsHint')}
              </AlertDescription>
            </Alert>
          )}

          {messages.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-8 text-center space-y-4'>
              <div className='flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary'>
                <BookOpen className='h-6 w-6' />
              </div>
              <div className='max-w-md space-y-1'>
                <h3 className='text-sm font-semibold'>{t('copilot.emptyChatTitle')}</h3>
                <p className='text-xs text-muted-foreground'>
                  {t('copilot.emptyChatDescription')}
                </p>
              </div>
              <div className='flex flex-wrap justify-center gap-2 pt-2'>
                {quickPrompts.map((qp, idx) => (
                  <button
                    key={idx}
                    type='button'
                    disabled={askMutation.isPending}
                    onClick={() => handleSendText(qp)}
                    className='rounded-full border bg-card px-3 py-1.5 text-xs text-left hover:bg-muted transition-colors disabled:opacity-50'
                  >
                    {qp}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[90%] rounded-xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground text-sm'
                      : 'border bg-card text-card-foreground shadow-xs space-y-3'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <div className='flex items-center gap-2'>
                      {msg.usedVoiceInput && <Mic className='h-3.5 w-3.5 shrink-0' />}
                      <span>{msg.text}</span>
                    </div>
                  ) : (
                    <>
                      {msg.safetyWarnings && msg.safetyWarnings.length > 0 && (
                        <div className='rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'>
                          <div className='flex items-center gap-1.5 font-semibold mb-1'>
                            <ShieldAlert className='h-3.5 w-3.5 shrink-0' />
                            <span>{t('copilot.safetyBannerTitle')}</span>
                          </div>
                          <ul className='list-disc pl-4 space-y-0.5'>
                            {msg.safetyWarnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {msg.foundInManuals === false && (
                        <div className='inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground'>
                          <AlertTriangle className='h-3 w-3' />
                          <span>{t('copilot.notFoundBadge')}</span>
                        </div>
                      )}

                      <StructuredAnswerText text={msg.text} />

                      {msg.citations && msg.citations.length > 0 && (
                        <div className='border-t pt-2.5 space-y-2'>
                          <div className='flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'>
                            <CheckCircle2 className='h-3 w-3 text-emerald-600' />
                            <span>{t('copilot.citationsTitle')}</span>
                          </div>
                          <div className='flex flex-wrap gap-1.5'>
                            {msg.citations.map((cit, cIdx) => {
                              const citKey = `${msg.id}-${cIdx}`
                              const isExpanded = expandedSnippetKey === citKey
                              const targetUrl = cit.downloadUrl
                                ? `${resolveCopilotManualUrl(cit.downloadUrl)}${
                                    cit.pageNumber ? `#page=${cit.pageNumber}` : ''
                                  }`
                                : null

                              return (
                                <div key={citKey} className='flex items-center gap-1'>
                                  {targetUrl ? (
                                    <a
                                      href={targetUrl}
                                      target='_blank'
                                      rel='noopener noreferrer'
                                      className='inline-flex items-center gap-1 rounded-md border bg-muted/60 px-2 py-1 text-xs font-medium text-primary hover:bg-muted transition-colors'
                                    >
                                      <FileText className='h-3 w-3 shrink-0' />
                                      <span className='max-w-[180px] truncate'>
                                        {cit.fileName}
                                      </span>
                                      {cit.pageNumber && (
                                        <span className='rounded bg-primary/10 px-1 text-[10px] font-bold'>
                                          {t('copilot.pageShort', { page: cit.pageNumber })}
                                        </span>
                                      )}
                                      <ExternalLink className='h-2.5 w-2.5 shrink-0' />
                                    </a>
                                  ) : (
                                    <span className='inline-flex items-center gap-1 rounded-md border bg-muted/60 px-2 py-1 text-xs font-medium'>
                                      <FileText className='h-3 w-3 shrink-0' />
                                      <span className='max-w-[180px] truncate'>
                                        {cit.fileName}
                                      </span>
                                      {cit.pageNumber && (
                                        <span className='rounded bg-primary/10 px-1 text-[10px] font-bold'>
                                          {t('copilot.pageShort', { page: cit.pageNumber })}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                  {cit.snippet && (
                                    <button
                                      type='button'
                                      onClick={() =>
                                        setExpandedSnippetKey(isExpanded ? null : citKey)
                                      }
                                      className='rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground'
                                      title={t('copilot.toggleExcerpt')}
                                    >
                                      {isExpanded ? t('copilot.hideExcerpt') : t('copilot.viewExcerpt')}
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {msg.citations.map((cit, cIdx) => {
                            const citKey = `${msg.id}-${cIdx}`
                            if (expandedSnippetKey !== citKey || !cit.snippet) return null
                            return (
                              <blockquote
                                key={`${citKey}-snippet`}
                                className='rounded-md border-l-2 border-primary/50 bg-muted/40 px-3 py-2 text-xs italic text-muted-foreground'
                              >
                                “{cit.snippet}”
                              </blockquote>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
          )}

          {askMutation.isPending && (
            <div className='flex items-center gap-2 text-xs text-muted-foreground px-1'>
              <Loader2 className='h-4 w-4 animate-spin text-primary' />
              <span>{t('copilot.searchingManuals')}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input footer */}
        <div className='shrink-0 border-t bg-background p-4 space-y-2'>
          {voiceMode !== 'idle' && (
            <div className='flex items-center justify-between rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-600 dark:text-red-400'>
              <span className='flex items-center gap-2 font-medium'>
                <span className='h-2 w-2 rounded-full bg-red-500 animate-pulse' />
                {voiceMode === 'dictating'
                  ? t('copilot.listeningDictation')
                  : t('copilot.recordingAudio')}
              </span>
              <button
                type='button'
                onClick={stopActiveVoiceCapture}
                className='font-semibold underline'
              >
                {t('copilot.stopVoice')}
              </button>
            </div>
          )}

          <div className='flex items-end gap-2'>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendText()
                }
              }}
              placeholder={t('copilot.inputPlaceholder')}
              rows={2}
              disabled={askMutation.isPending}
              className='min-h-[56px] max-h-32 resize-none text-sm'
            />
            <div className='flex flex-col gap-1.5 shrink-0'>
              <Button
                type='button'
                variant={voiceMode !== 'idle' ? 'destructive' : 'outline'}
                size='icon'
                onClick={handleToggleVoice}
                disabled={askMutation.isPending}
                title={t('copilot.voiceTooltip')}
              >
                {voiceMode !== 'idle' ? (
                  <MicOff className='h-4 w-4' />
                ) : (
                  <Mic className='h-4 w-4' />
                )}
              </Button>
              <Button
                type='button'
                size='icon'
                onClick={() => handleSendText()}
                disabled={!question.trim() || askMutation.isPending}
                title={t('copilot.sendTooltip')}
              >
                {askMutation.isPending ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <Send className='h-4 w-4' />
                )}
              </Button>
            </div>
          </div>
          <p className='text-[11px] text-muted-foreground'>{t('copilot.safetyDisclaimer')}</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
