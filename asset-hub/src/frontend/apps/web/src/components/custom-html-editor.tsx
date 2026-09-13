import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { html as langHtml } from '@codemirror/lang-html'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import { Braces, Check, Code2, Eye, Bold, Italic, Underline, Link as LinkIcon, Image, Code, Maximize, Minimize, List, ListOrdered, Heading1, Heading2, Table, Layout, FileCode2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface CustomHtmlEditorProps {
  value: string
  onChange: (value: string) => void
  variables: string[]
  className?: string
  placeholder?: string
}

const PREVIEW_BASE_STYLES = `
  body { margin: 0; padding: 16px; font-family: Arial, Helvetica, sans-serif; }
`

function buildPreviewDocument(html: string): string {
  const hasFullDocument = /<html[\s>]/i.test(html)
  if (hasFullDocument) {
    return html
  }
  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head><meta charset="utf-8" />',
    `<style>${PREVIEW_BASE_STYLES}</style></head>`,
    `<body>${html}</body>`,
    '</html>',
  ].join('')
}

export function CustomHtmlEditor({
  value,
  onChange,
  variables,
  className,
}: CustomHtmlEditorProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const [viewMode, setViewMode] = useState<'split' | 'code' | 'preview'>('split')
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  const insertAtCursor = useCallback(
    (snippet: string) => {
      const view = editorRef.current?.view
      if (!view) {
        onChange(`${value}${snippet}`)
        return
      }
      const selection = view.state.selection.main
      view.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: snippet
        },
        selection: { anchor: selection.from + snippet.length }
      })
      view.focus()
    },
    [onChange, value]
  )

  const insertVariable = useCallback(
    (variable: string) => {
      insertAtCursor(`{{${variable}}}`)
    },
    [insertAtCursor]
  )

  const copyHtml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }, [value])

  const previewSrcDoc = useMemo(() => {
    let previewHtml = value
    // Reemplazar variables comunes con datos de prueba visuales para la vista previa
    previewHtml = previewHtml.replace(/\{\{\s*tenant\.logo_url\s*\}\}/g, 'https://placehold.co/400x100/f3f4f6/666?text=Logo+de+Tu+Empresa')
    previewHtml = previewHtml.replace(/\{\{\s*tenant\.name\s*\}\}/g, 'Empresa Demo S.A.')
    previewHtml = previewHtml.replace(/\{\{\s*tenant\.support_email\s*\}\}/g, 'soporte@empresademo.com')
    previewHtml = previewHtml.replace(/\{\{\s*order\.title\s*\}\}/g, 'Mantenimiento Preventivo')
    previewHtml = previewHtml.replace(/\{\{\s*order\.state\s*\}\}/g, 'En Progreso')
    
    return buildPreviewDocument(previewHtml)
  }, [value])

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-md border bg-zinc-950 transition-all duration-200',
      isFullscreen ? 'fixed inset-4 z-50 shadow-2xl h-[calc(100vh-2rem)]' : 'min-h-[600px]',
      className
    )}>
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b bg-zinc-950 px-2 text-zinc-200">
        <div className="flex items-center gap-1.5 pr-2">
          <Code2 className="size-4 text-sky-400" />
          <span className="text-xs font-semibold tracking-wide uppercase">
            HTML
          </span>
        </div>

        {/* Toolbar Botones Básicos */}
        <div className="flex items-center gap-0.5 mr-2">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => insertAtCursor('<b></b>')} title="Negrita">
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => insertAtCursor('<i></i>')} title="Cursiva">
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => insertAtCursor('<u></u>')} title="Subrayado">
            <Underline className="h-3.5 w-3.5" />
          </Button>
          <div className="w-px h-4 bg-zinc-800 mx-1" />
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => insertAtCursor('<a href="#"></a>')} title="Enlace">
            <LinkIcon className="h-3.5 w-3.5" />
          </Button>
          
          <label title="Subir Imagen">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const { mediaService } = await import('@/services/media.service')
                  const { url } = await mediaService.uploadMedia(file)
                  insertAtCursor(`<img src="${import.meta.env.VITE_API_URL}${url}" alt="imagen del tenant" style="max-width: 100%;" />`)
                } catch (error) {
                  console.error('Error uploading image', error)
                  alert('Error al subir la imagen')
                }
                e.target.value = ''
              }}
            />
            <Button asChild variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer">
              <span>
                <Image className="h-3.5 w-3.5" />
              </span>
            </Button>
          </label>
          
          <div className="w-px h-4 bg-zinc-800 mx-1" />
          
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => insertAtCursor('<ul>\n  <li></li>\n</ul>')} title="Lista viñetas">
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => insertAtCursor('<ol>\n  <li></li>\n</ol>')} title="Lista numerada">
            <ListOrdered className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => insertAtCursor('<h1></h1>')} title="Título H1">
            <Heading1 className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" onClick={() => insertAtCursor('<h2></h2>')} title="Título H2">
            <Heading2 className="h-3.5 w-3.5" />
          </Button>

          <div className="w-px h-4 bg-zinc-800 mx-1" />

          {/* Menú de Bloques HTML Avanzados */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
                <Layout className="size-3.5 mr-1" />
                Bloques <ChevronDown className="size-3 ml-1 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 z-[100]">
              <DropdownMenuLabel>Insertar Estructuras</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => insertAtCursor('<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8" />\n  <style>\n    body { font-family: sans-serif; }\n  </style>\n</head>\n<body>\n  \n</body>\n</html>')}>
                <FileCode2 className="size-3.5 mr-2" /> HTML Completo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertAtCursor('<div style="padding: 20px; background-color: #f3f4f6; border-radius: 8px;">\n  \n</div>')}>
                <Layout className="size-3.5 mr-2" /> Contenedor (Div)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertAtCursor('<table width="100%" border="0" cellspacing="0" cellpadding="0">\n  <tr>\n    <td>Columna 1</td>\n    <td>Columna 2</td>\n  </tr>\n</table>')}>
                <Table className="size-3.5 mr-2" /> Tabla
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertAtCursor('<a href="#" style="display: inline-block; padding: 10px 20px; background-color: #000; color: #fff; text-decoration: none; border-radius: 4px;">Botón</a>')}>
                <Code className="size-3.5 mr-2" /> Botón HTML
              </DropdownMenuItem>
              <div className="h-px bg-zinc-800 my-1" />
              <DropdownMenuLabel>Componentes del Tenant</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => insertAtCursor('<div style="text-align: center; padding: 20px; background-color: #ffffff; border-bottom: 1px solid #eaeaea;">\n  <img src="{{tenant.logo_url}}" alt="{{tenant.name}}" style="max-height: 50px;" />\n</div>')}>
                <Image className="size-3.5 mr-2" /> Header del Tenant
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertAtCursor('<div style="text-align: center; padding: 20px; font-size: 12px; color: #666; background-color: #f9f9f9;">\n  <p>&copy; {{tenant.name}}. Todos los derechos reservados.</p>\n  <p><a href="mailto:{{tenant.support_email}}" style="color: #666;">Contacto de Soporte</a></p>\n</div>')}>
                <Layout className="size-3.5 mr-2" /> Footer del Tenant
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Variables dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={variables.length === 0}
              className="h-7 gap-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <Braces className="size-3.5 text-amber-400" />
              Variables
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuLabel>Insertar en el cursor</DropdownMenuLabel>
            {variables.map((variable) => (
              <DropdownMenuItem
                key={variable}
                onClick={() => insertVariable(variable)}
                className="font-mono text-xs"
              >
                {`{{${variable}}}`}
              </DropdownMenuItem>
            ))}
            {variables.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Sin variables disponibles
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Inline variable badges (visible if few) */}
        {variables.length > 0 && variables.length <= 4 && (
          <div className="hidden items-center gap-1 md:flex">
            {variables.map((variable) => (
              <Badge
                key={variable}
                variant="secondary"
                className="cursor-pointer bg-zinc-800 font-mono text-[10px] text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
                onClick={() => insertVariable(variable)}
              >
                {`{{${variable}}}`}
              </Badge>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* View mode switch */}
          <div className="flex items-center rounded-md bg-zinc-900 p-0.5">
            {(
              [
                ['split', 'Split'],
                ['code', 'Código'],
                ['preview', 'Preview'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  'rounded px-2 py-1 text-xs font-medium transition-colors',
                  viewMode === mode
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={copyHtml}
            className="h-7 px-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            title="Copiar HTML"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-400" />
            ) : (
              'Copy'
            )}
          </Button>
          
          <div className="w-px h-4 bg-zinc-800 mx-1" />

          <Button 
            type="button"
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" 
            onClick={() => setIsFullscreen(!isFullscreen)}
            title="Pantalla Completa (Esc para salir)"
          >
            {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      {/* End Toolbar */}

      {/* Split panes */}
      <div className="flex min-h-0 flex-1">
        {viewMode !== 'preview' && (
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-col bg-zinc-950',
              viewMode === 'split' ? 'w-1/2' : 'w-full'
            )}
          >
            <CodeMirror
              ref={editorRef}
              value={value}
              onChange={(val) => onChange(val)}
              extensions={[langHtml()]}
              theme={vscodeDark}
              className="h-full w-full flex-1 overflow-auto bg-zinc-950 font-mono text-sm"
              basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                highlightSpecialChars: true,
                history: true,
                foldGutter: true,
                drawSelection: true,
                dropCursor: true,
                allowMultipleSelections: true,
                indentOnInput: true,
                syntaxHighlighting: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                rectangularSelection: true,
                crosshairCursor: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                closeBracketsKeymap: true,
                defaultKeymap: true,
                searchKeymap: true,
                historyKeymap: true,
                foldKeymap: true,
                completionKeymap: true,
                lintKeymap: true,
              }}
            />
          </div>
        )}

        {viewMode !== 'code' && (
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-col bg-white',
              viewMode === 'split' ? 'w-1/2' : 'w-full'
            )}
          >
            <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-zinc-200 bg-zinc-50 px-3">
              <Eye className="size-3.5 text-zinc-400" />
              <span className="text-xs font-medium text-zinc-500">
                Vista Previa en Vivo
              </span>
            </div>
            <iframe
              title="Vista previa del email"
              srcDoc={previewSrcDoc}
              sandbox=""
              className="h-full w-full flex-1 border-0 bg-white"
            />
          </div>
        )}
      </div>
    </div>
  )
}
