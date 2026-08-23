import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { Asset } from '@/services/asset.service'
import { Badge } from '@/components/ui/badge'

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
})

interface AssetGlobalMapModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assets: Asset[]
}

const DEFAULT_CENTER = { lat: 19.4326, lng: -99.1332 } // CDMX
const DEFAULT_ZOOM = 5

function MapResizer({ mapAssets }: { mapAssets: any[] }) {
  const map = useMap()
  
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize()
    })
    
    const container = map.getContainer()
    resizeObserver.observe(container)
    
    return () => {
      resizeObserver.disconnect()
    }
  }, [map])

  // Ajustar la vista para que encuadre a todos los activos
  useEffect(() => {
    if (mapAssets.length === 0) return

    const bounds = new L.LatLngBounds([])
    
    mapAssets.forEach(asset => {
      let lat = asset.latitude
      let lng = asset.longitude

      if (asset.geoJson) {
        try {
          const parsedGeoJson = JSON.parse(asset.geoJson)
          if (parsedGeoJson.type === 'Point' && parsedGeoJson.coordinates) {
             lng = parsedGeoJson.coordinates[0]
             lat = parsedGeoJson.coordinates[1]
          } else if (parsedGeoJson.type === 'LineString' || parsedGeoJson.type === 'Polygon') {
             // We can just add the centroid which we already know is in lat/lng from backend
             // Or we can add all coordinates to bounds.
             // Actually, the backend always provides asset.latitude and asset.longitude as the centroid/first point
             // So we can just use those.
          }
        } catch(e) {}
      }

      if (lat != null && lng != null) {
        bounds.extend(new L.LatLng(lat, lng))
      }
    })

    if (bounds.isValid()) {
      map.fitBounds(bounds, { maxZoom: 16, padding: [50, 50] })
    }
  }, [map, mapAssets])
  
  return null
}

export function AssetGlobalMapModal({ open, onOpenChange, assets }: AssetGlobalMapModalProps) {
  // Activos con coordenadas o geoJson válido
  const mapAssets = assets?.filter(a => (a.latitude != null && a.longitude != null) || a.geoJson) || []

  // Calcular centro basado en los activos, o default si no hay
  const center = mapAssets.length > 0 
    ? { lat: mapAssets[0].latitude!, lng: mapAssets[0].longitude! }
    : DEFAULT_CENTER

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none sm:max-w-none w-screen h-screen m-0 p-0 rounded-none flex flex-col overflow-hidden border-0">
        <DialogHeader className="p-6 pb-2 shrink-0">
          <DialogTitle>Mapa de Activos ({mapAssets.length} ubicados de {assets?.length || 0})</DialogTitle>
        </DialogHeader>
        <div className="flex-1 w-full relative bg-muted/20 z-0">
          {open && ( // Solo renderizar el mapa cuando el modal está abierto para evitar bugs de dimensiones
            <MapContainer center={center} zoom={DEFAULT_ZOOM} scrollWheelZoom={true} className="h-full w-full z-0">
              <MapResizer mapAssets={mapAssets} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {mapAssets.map(asset => {
                let parsedGeoJson = null
                if (asset.geoJson) {
                  try {
                    parsedGeoJson = JSON.parse(asset.geoJson)
                  } catch (e) {}
                }

                const popupContent = (
                  <div className="flex flex-col gap-2 p-1">
                    <div className="font-semibold text-base">{asset.name}</div>
                    <div className="text-sm text-muted-foreground">{asset.code}</div>
                    <div>
                      <Badge 
                        variant="secondary" 
                        style={asset.stateColor ? { backgroundColor: asset.stateColor, color: '#fff' } : undefined}
                      >
                        {asset.state}
                      </Badge>
                    </div>
                    <a 
                      href={`/assets/${asset.id}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                    >
                      Abrir detalle →
                    </a>
                  </div>
                )

                const lat = asset.latitude || (parsedGeoJson?.coordinates ? parsedGeoJson.coordinates[1] : 0)
                const lng = asset.longitude || (parsedGeoJson?.coordinates ? parsedGeoJson.coordinates[0] : 0)
                const latLng = new L.LatLng(lat, lng)

                const isComplexGeometry = parsedGeoJson && parsedGeoJson.type !== 'Point' && parsedGeoJson.type !== 'GeometryCollection'
                const style = { color: asset.stateColor || '#3388ff', weight: 4 }

                return (
                  <React.Fragment key={asset.id}>
                    {isComplexGeometry && (
                      <GeoJSON data={parsedGeoJson} style={style}>
                        <Popup minWidth={200}>{popupContent}</Popup>
                      </GeoJSON>
                    )}
                    <Marker position={latLng} icon={customIcon}>
                      <Popup minWidth={200}>
                        {popupContent}
                      </Popup>
                    </Marker>
                  </React.Fragment>
                )
              })}
            </MapContainer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
