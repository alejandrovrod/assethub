import { useState, useRef, useEffect } from 'react'
import { Maximize, Minimize, Bold, Italic, Underline, Link, Image, Code } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface CustomHtmlEditorProps {
  value: string
  variables?: string[]
  onChange: (html: string) => void
}

export function CustomHtmlEditor({ value, variables = [], onChange }: CustomHtmlEditorProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<'split' | 'code' | 'preview'>('split')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentVal = textarea.value
    
    const newVal = currentVal.substring(0, start) + before + currentVal.substring(start, end) + after + currentVal.substring(end)
    
    onChange(newVal)
    
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + before.length, end + before.length)
    }, 0)
  }

  const insertVariable = (variable: string) => {
    insertText(variable)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  const iframeSrcDoc = value || '<html><body><p style="color:#888; font-family:sans-serif; text-align:center; padding-top:2rem;">Vista Previa en Vivo</p></body></html>'

  return (
    <div className={cn(
      "flex flex-col bg-slate-950 text-slate-50 border rounded-md overflow-hidden shadow-sm transition-all duration-200 z-50",
      isFullscreen ? "fixed inset-4 h-[calc(100vh-2rem)] shadow-2xl" : "h-[600px] relative"
    )}>
      
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800" onClick={() => insertText('<b>', '</b>')} title="Negrita">
            <Bold className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800" onClick={() => insertText('<i>', '</i>')} title="Cursiva">
            <Italic className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800" onClick={() => insertText('<u>', '</u>')} title="Subrayado">
            <Underline className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-slate-700 mx-1" />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800" onClick={() => insertText('<a href="#">', '</a>')} title="Enlace">
            <Link className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800" onClick={() => insertText('<img src="https://via.placeholder.com/150" alt="imagen" />')} title="Imagen">
            <Image className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800" onClick={() => insertText('<br />')} title="Salto de línea">
            <Code className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-5 bg-slate-700 mx-1" />

          {/* Variables Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-slate-300 hover:text-slate-100 hover:bg-slate-800 font-medium">
                <span className="text-amber-500 mr-1">{`{ }`}</span> Variables
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto z-[100]">
              {variables.length > 0 ? (
                variables.map((variable) => (
                  <DropdownMenuItem key={variable} onClick={() => insertVariable(variable)}>
                    <span className="font-mono text-xs">{variable}</span>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>No hay variables disponibles</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1">
          {/* View Modes */}
          <div className="flex items-center bg-slate-950 rounded p-0.5 border border-slate-800 mr-2">
            <button 
              type="button"
              className={cn("px-2.5 py-1 text-xs font-medium rounded transition-colors", viewMode === 'split' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200')}
              onClick={() => setViewMode('split')}
            >
              Split
            </button>
            <button 
              type="button"
              className={cn("px-2.5 py-1 text-xs font-medium rounded transition-colors", viewMode === 'code' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200')}
              onClick={() => setViewMode('code')}
            >
              Código
            </button>
            <button 
              type="button"
              className={cn("px-2.5 py-1 text-xs font-medium rounded transition-colors", viewMode === 'preview' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200')}
              onClick={() => setViewMode('preview')}
            >
              Preview
            </button>
          </div>

          <Button 
            type="button"
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800" 
            onClick={() => setIsFullscreen(!isFullscreen)}
            title="Pantalla Completa (Esc para salir)"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {(viewMode === 'split' || viewMode === 'code') && (
          <div className={cn("flex flex-col border-r border-slate-800", viewMode === 'split' ? 'w-1/2' : 'w-full')}>
            <textarea
              ref={textareaRef}
              className="flex-1 w-full bg-slate-950 text-slate-300 font-mono text-sm p-4 resize-none outline-none focus:ring-1 focus:ring-slate-700 custom-scrollbar"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="<html>\n  <body>\n    Escribí el HTML acá...\n  </body>\n</html>"
              spellCheck={false}
            />
          </div>
        )}

        {(viewMode === 'split' || viewMode === 'preview') && (
          <div className={cn("flex flex-col bg-white overflow-hidden", viewMode === 'split' ? 'w-1/2' : 'w-full')}>
            <iframe
              title="HTML Preview"
              srcDoc={iframeSrcDoc}
              className="w-full h-full border-0 bg-white"
              sandbox="allow-same-origin"
            />
          </div>
        )}
      </div>
    </div>
  )
}
