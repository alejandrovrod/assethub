import * as React from "react"
import { useState, useEffect } from 'react'
import { ChevronsUpDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
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
}

export function AsyncCombobox<T>({
  fetcher,
  labelKey,
  valueKey,
  onSelect,
  placeholder = 'Seleccionar...',
  searchPlaceholder = 'Buscar...',
  emptyText = 'No se encontraron resultados.',
  renderTrigger
}: AsyncComboboxProps<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (open) {
        if (!query || query.trim() === '') {
          setItems([])
          return
        }

        setIsLoading(true)
        try {
          const results = await fetcher(query)
          setItems(results)
        } catch (e) {
          setItems([])
        } finally {
          setIsLoading(false)
        }
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, fetcher, open])

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
            className="w-[200px] justify-between"
          >
            {placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder={searchPlaceholder} 
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {isLoading && (
              <div className="p-4 flex items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando...
              </div>
            )}
            {!isLoading && items.length === 0 && (!query || query.trim() === '') && (
              <div className="p-4 text-sm text-center text-muted-foreground">
                Escriba para buscar...
              </div>
            )}
            {!isLoading && items.length === 0 && query && query.trim() !== '' && (
              <CommandEmpty>{emptyText}</CommandEmpty>
            )}
            <CommandGroup>
              {!isLoading && items.map((item, i) => (
                <CommandItem
                  key={String(item[valueKey]) || i}
                  value={String(item[valueKey])}
                  onSelect={() => {
                    onSelect(item)
                    setOpen(false)
                  }}
                  className="cursor-pointer"
                >
                  {String(item[labelKey])}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
