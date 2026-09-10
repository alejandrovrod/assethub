import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Loader2, Eye, Menu } from 'lucide-react'
import { incidentService } from '@/services/incident.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { ReportIncidentSheet } from './components/report-incident-sheet'
import { useNavigate, useSearchParams } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseApiDate } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Check, ChevronsUpDown, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { assetService } from '@/services/asset.service'

export default function MaintenanceIncidents() {
  const navigate = useNavigate()
  const [isReportOpen, setIsReportOpen] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [catalogFilters, setCatalogFilters] = useState<Record<string, string>>({})
  const [searchParams] = useSearchParams()
  const assetId = searchParams.get('assetId') || undefined
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, catalogFilters, assetId, pageSize])

  const { data: pagedResult, isLoading } = useQuery({
    queryKey: ['incidents', searchTerm, catalogFilters, assetId, page, pageSize],
    queryFn: () => incidentService.advancedSearch({
      searchTerm: searchTerm || undefined,
      catalogFilters: Object.keys(catalogFilters).length > 0 ? catalogFilters : undefined,
      assetId,
      page,
      pageSize
    }),
  })

  const incidents = pagedResult?.items || []

  const { data: searchFilters, isLoading: isLoadingFilters } = useQuery({
    queryKey: ['asset-filters'],
    queryFn: () => assetService.getSearchFilters()
  })

  const handleCreate = () => {
    setIsReportOpen(true)
  }

  const handleView = (id: string) => {
    navigate(`/maintenance/incidents/${id}`)
  }

  const renderFilters = () => (
    <div className="flex flex-col gap-6 h-full overflow-hidden">
      <div className="shrink-0">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4" /> Búsqueda
        </h3>
        <Input
          placeholder="Título o activo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full"
        />
      </div>

      <ScrollArea className="flex-1 min-h-0 pr-4">
        {isLoadingFilters ? (
          <div className="text-sm text-muted-foreground">Cargando filtros...</div>
        ) : searchFilters?.map((filter) => (
          <div key={filter.attributeKey} className="mb-6">
            <h4 className="text-sm font-medium mb-2 capitalize">{filter.attributeLabel || filter.attributeKey}</h4>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  <span className="truncate">
                    {catalogFilters[filter.attributeKey]
                      ? filter.options.find(
                        (opt) => opt.catalogItemId === catalogFilters[filter.attributeKey]
                      )?.label
                      : "Todos"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-3rem)] sm:w-full p-0">
                <Command>
                  <CommandInput placeholder="Buscar opción..." />
                  <CommandList>
                    <CommandEmpty>No se encontró la opción.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          const newFilters = { ...catalogFilters }
                          delete newFilters[filter.attributeKey]
                          setCatalogFilters(newFilters)
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            !catalogFilters[filter.attributeKey] ? "opacity-100" : "opacity-0"
                          )}
                        />
                        Todos
                      </CommandItem>
                      {filter.options.map((opt) => (
                        <CommandItem
                          key={opt.catalogItemId}
                          onSelect={() => {
                            setCatalogFilters({ ...catalogFilters, [filter.attributeKey]: opt.catalogItemId })
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              catalogFilters[filter.attributeKey] === opt.catalogItemId
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {opt.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        ))}
      </ScrollArea>
    </div>
  )

  return (
    <div className="flex flex-col gap-4 p-4 pt-0">
      <Card className="flex flex-1 flex-col">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <div>
            <CardTitle>Incidencias</CardTitle>
            <CardDescription>
              Gestioná las incidencias reportadas en los activos.
            </CardDescription>
          </div>
          <Button size="icon" onClick={handleCreate}>
            <Plus className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 p-0 flex flex-col">
          <div className="flex flex-col lg:flex-row flex-1 gap-6 mt-4 p-4 pt-0 overflow-hidden">
            {/* Filtros Mobile */}
            <div className="lg:hidden shrink-0">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="w-full flex items-center justify-center gap-2">
                    <Menu className="h-4 w-4" />
                    Filtros y Búsqueda
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[85vw] sm:w-[350px] p-4 flex flex-col">
                  <SheetHeader className="mb-4 text-left">
                    <SheetTitle>Filtros</SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-hidden">
                    {renderFilters()}
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Sidebar de Filtros Desktop */}
            <div className="hidden lg:flex w-64 flex-col gap-6 shrink-0 h-full">
              {renderFilters()}
            </div>

            {/* Grilla de Incidencias */}
            <div className="flex-1 rounded-lg border shadow-sm p-4">
                {isLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : incidents?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center">
                    <p className="text-muted-foreground mb-4">No hay incidencias reportadas.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Activo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Reportado el</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incidents?.map((incident) => (
                        <TableRow key={incident.id}>
                          <TableCell className="font-medium">{incident.title}</TableCell>
                          <TableCell>{incident.assetName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{incident.state}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {incident.reportedAt ? format(parseApiDate(incident.reportedAt), 'PPp', { locale: es }) : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleView(incident.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              
              {/* Pagination Controls */}
              {!isLoading && (
                <div className="flex items-center justify-between border-t border-border pt-4 mt-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      Total: {pagedResult?.totalCount || 0} incidencias
                    </span>
                    <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                      <SelectTrigger className="w-[100px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 / pág</SelectItem>
                        <SelectItem value="20">20 / pág</SelectItem>
                        <SelectItem value="50">50 / pág</SelectItem>
                        <SelectItem value="100">100 / pág</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Anterior
                    </Button>
                    <div className="flex items-center text-sm px-2">
                      Página {page} de {pagedResult?.totalPages || 1}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={page >= (pagedResult?.totalPages || 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ReportIncidentSheet
        open={isReportOpen}
        onOpenChange={setIsReportOpen}
        onSuccess={(id) => {
          setIsReportOpen(false)
          handleView(id)
        }}
      />
    </div>
  )
}
