import * as React from "react"
import { useState, useEffect } from 'react'
import { ChevronsUpDown, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandEmpty,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export interface AsyncComboboxProps<T> {
  fetcher: (query: string) => Promise<T[]>
  labelKey: keyof T
  valueKey: keyof T
  onSelect: (item: T) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  renderTrigger?: (onClick: () => void) => React.ReactNode
  /** Minimum characters before triggering a search (default: 2) */
  minSearchChars?: number
}

export function AsyncCombobox<T>({
  fetcher,
  labelKey,
  valueKey,
  onSelect,
  placeholder = 'Seleccionar...',
  searchPlaceholder = 'Buscar...',
  emptyText = 'No se encontraron resultados.',
  renderTrigger,
  minSearchChars = 2,
}: AsyncComboboxProps<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Debounced search — only triggers when query >= minSearchChars
  useEffect(() => {
    if (!open) {
      setItems([])
      setQuery('')
      return
    }

    const shouldSearch = query.trim().length >= minSearchChars

    if (!shouldSearch) {
      setItems([])
      setIsLoading(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const results = await fetcher(query)
        setItems(results)
      } catch (e) {
        setItems([])
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, fetcher, open, minSearchChars])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {renderTrigger ? (
          renderTrigger(() => setOpen(true))
        ) : (
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false} className="w-full">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
          <CommandList>
            {isLoading && (
              <div className="p-4 flex items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando...
              </div>
            )}
            {!isLoading && !query && (
              <div className="p-4 text-sm text-center text-muted-foreground">
                Escriba al menos {minSearchChars} caracteres para buscar...
              </div>
            )}
            {!isLoading && query.trim().length < minSearchChars && query.length > 0 && (
              <div className="p-4 text-sm text-center text-muted-foreground">
                Escriba al menos {minSearchChars} caracteres...
              </div>
            )}
            {!isLoading && query.trim().length >= minSearchChars && items.length === 0 && (
              <CommandEmpty>{emptyText}</CommandEmpty>
            )}
            {!isLoading && items.length > 0 && (
              <CommandGroup>
                {items.map((item, i) => (
                  <CommandItem
                    key={String(item[valueKey]) || i}
                    onSelect={() => {
                      onSelect(item)
                      setOpen(false)
                      setQuery('')
                    }}
                    className="cursor-pointer"
                  >
                    {String(item[labelKey])}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
