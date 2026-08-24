import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Loader2, Wrench } from 'lucide-react'
import { preventivePlanService } from '@/services/preventive-plan.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface Props {
  assetId: string
  assetTemplateId: string
}

export function PreventivePlanAssetWidget({ assetId, assetTemplateId }: Props) {
  const navigate = useNavigate()

  const { data: byAsset, isLoading: loadingAsset } = useQuery({
    queryKey: ['preventive-plans', 'asset', assetId],
    queryFn: () => preventivePlanService.getAll({ assetId }),
  })

  const { data: byTemplate, isLoading: loadingTemplate } = useQuery({
    queryKey: ['preventive-plans', 'template', assetTemplateId],
    queryFn: () => preventivePlanService.getAll({ templateId: assetTemplateId }),
  })

  const plans = useMemo(() => {
    const map = new Map<string, (typeof byAsset extends (infer T)[] | undefined ? T : never)>()
    for (const p of byAsset ?? []) map.set(p.id, p)
    for (const p of byTemplate ?? []) map.set(p.id, p)
    return Array.from(map.values())
  }, [byAsset, byTemplate])

  const isLoading = loadingAsset || loadingTemplate

  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : plans.length > 0 ? (
        <ul className="space-y-3">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className="flex items-center justify-between p-2 rounded border bg-muted/20 cursor-pointer hover:bg-muted/40"
              onClick={() => navigate('/maintenance/preventive-plans')}
            >
              <div>
                <p className="font-medium">{plan.name}</p>
                <p className="text-xs text-muted-foreground">
                  {plan.nextRunAt
                    ? `Próxima: ${format(new Date(plan.nextRunAt), 'dd MMM yyyy', { locale: es })}`
                    : 'Sin programación'}
                </p>
              </div>
              <Badge variant={plan.isActive ? 'default' : 'secondary'}>
                {plan.isActive ? 'Activo' : 'Pausado'}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-center py-4 text-sm">
          No hay planes asociados a este activo.
        </p>
      )}
      <Button variant="ghost" size="sm" onClick={() => navigate('/maintenance/preventive-plans')} className="w-full mt-2">
        Ver todos
      </Button>
    </div>
  )
}
