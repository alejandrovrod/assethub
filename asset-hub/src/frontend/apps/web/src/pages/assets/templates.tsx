import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Edit, Trash2 } from 'lucide-react'
import { assetTemplateService } from '@/services/asset-template.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { AssetTemplateFormSheet } from './components/asset-template-form-sheet'

export default function AssetsTemplates() {
  const queryClient = useQueryClient()
  
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)

  const { data: templates, isLoading } = useQuery({
    queryKey: ['asset-templates'],
    queryFn: assetTemplateService.getTemplates,
  })

  const deleteMutation = useMutation({
    mutationFn: assetTemplateService.deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-templates'] })
      toast.success('Plantilla eliminada')
    },
    onError: () => toast.error('Error al eliminar la plantilla')
  })

  const handleCreate = () => {
    setEditingTemplate(null)
    setIsFormOpen(true)
  }

  const handleEdit = (template: any) => {
    setEditingTemplate(template)
    setIsFormOpen(true)
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <div>
            <CardTitle>Plantillas de Activos</CardTitle>
            <CardDescription>
              Gestioná las plantillas (esquemas y ciclo de vida) para los distintos tipos de activos.
            </CardDescription>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Plantilla
          </Button>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden">
          <ScrollArea className="h-[calc(100vh-16rem)]">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : templates?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <p className="text-muted-foreground mb-4">No hay plantillas registradas.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-[100px]">Versión</TableHead>
                    <TableHead className="w-[100px]">Estado</TableHead>
                    <TableHead className="w-[100px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates?.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.code}</TableCell>
                      <TableCell>{template.name}</TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[200px]">
                        {template.description}
                      </TableCell>
                      <TableCell>v{template.version}</TableCell>
                      <TableCell>
                        {template.isActive ? (
                          <Badge variant="default" className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20">Activo</Badge>
                        ) : (
                          <Badge variant="secondary">Inactivo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => handleEdit(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm('¿Estás seguro de eliminar esta plantilla?')) {
                              deleteMutation.mutate(template.id)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
      
      <AssetTemplateFormSheet 
        open={isFormOpen} 
        onOpenChange={setIsFormOpen} 
        template={editingTemplate} 
      />
    </div>
  )
}

