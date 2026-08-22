import { useQuery } from '@tanstack/react-query'
import { assetService } from '@/services/asset.service'
import { useMemo } from 'react'

export function usePropagatedProperties(assetId?: string) {
  const { data: assetDetail, isLoading } = useQuery({
    queryKey: ['asset', assetId],
    queryFn: () => assetService.getAssetById(assetId!),
    enabled: !!assetId,
  })

  const propagatedPropertiesJson = useMemo(() => {
    if (!assetDetail || !assetDetail.schemaJson || !assetDetail.propertiesJson) {
      return undefined
    }

    try {
      const schema = JSON.parse(assetDetail.schemaJson)
      const properties = JSON.parse(assetDetail.propertiesJson)
      const propagated: Record<string, any> = {}

      if (schema && schema.properties) {
        Object.keys(schema.properties).forEach((key) => {
          const propDef = schema.properties[key]
          if (propDef.propagateToWork && properties[key] !== undefined) {
            propagated[key] = properties[key]
          }
        })
      }

      if (Object.keys(propagated).length > 0) {
        return JSON.stringify(propagated)
      }
    } catch (e) {
      console.error('Error parsing asset properties for propagation', e)
    }

    return undefined
  }, [assetDetail])

  return {
    propagatedPropertiesJson,
    isLoading
  }
}
