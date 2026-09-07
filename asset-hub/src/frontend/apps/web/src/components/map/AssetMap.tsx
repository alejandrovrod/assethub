import { useEffect, useRef, useState } from 'react'
import { Maximize, Minimize } from 'lucide-react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'

// Fix para los íconos por defecto de leaflet en React
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import { MapLegend } from './MapLegend'
import { createColoredMarkerIcon } from './map-utils'

const defaultIcon = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
})

L.Marker.prototype.options.icon = defaultIcon

interface AssetMapProps {
  latitude?: number
  longitude?: number
  geoJson?: string
  onChange?: (lat?: number, lng?: number, geoJsonStr?: string) => void
  readOnly?: boolean
  assetName?: string
  riskLevel?: 'Low' | 'Moderate' | 'High' | 'Critical'
  assetState?: string
  assetStateColor?: string
}

const DEFAULT_CENTER = { lat: 19.4326, lng: -99.1332 } // CDMX, adjust as needed
const DEFAULT_ZOOM = 13

function MapResizer() {
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
  
  return null
}

function GeomanEditor({ geoJson, latitude, longitude, readOnly, onChange, assetStateColor }: any) {
  const map = useMap()
  const featureGroupRef = useRef<L.FeatureGroup>(new L.FeatureGroup())
  const isInitialized = useRef(false)

  // Setup layer group
  useEffect(() => {
    const fg = featureGroupRef.current
    map.addLayer(fg)
    
    if (!readOnly) {
      map.pm.setGlobalOptions({ 
        layerGroup: fg,
        pathOptions: {
          color: assetStateColor || '#3388ff',
          weight: 4
        }
      })
      map.pm.addControls({
        position: 'topleft',
        drawCircle: false,
        drawCircleMarker: false,
        drawRectangle: false,
        drawText: false,
        drawPolygon: true,
        drawPolyline: true,
        drawMarker: true,
        editMode: true,
        dragMode: true,
        cutPolygon: false,
        removalMode: true
      })
    }

    return () => {
      map.pm.removeControls()
      map.removeLayer(fg)
    }
  }, [map, readOnly])

  // Load initial data
  useEffect(() => {
    if (isInitialized.current) return

    const fg = featureGroupRef.current
    fg.clearLayers()

    if (geoJson) {
      try {
        const parsed = JSON.parse(geoJson)
        const layer = L.geoJSON(parsed, {
          pointToLayer: (_feature, latlng) => {
            return L.marker(latlng, {
              icon: assetStateColor ? createColoredMarkerIcon(assetStateColor) : defaultIcon
            })
          },
          style: {
            color: assetStateColor || '#3388ff',
            weight: 4
          }
        })
        layer.eachLayer(l => fg.addLayer(l))
      } catch (e) {
        console.error("Invalid geojson in AssetMap")
      }
    } else if (latitude != null && longitude != null) {
      const marker = L.marker([latitude, longitude], {
        icon: assetStateColor ? createColoredMarkerIcon(assetStateColor) : defaultIcon
      })
      fg.addLayer(marker)
    }

    if (fg.getLayers().length > 0) {
      map.fitBounds(fg.getBounds(), { maxZoom: 16 })
    }

    isInitialized.current = true
  }, [geoJson, latitude, longitude, map])

  // Bind events for changes
  useEffect(() => {
    if (readOnly) return

    const handleChange = () => {
      const layers = featureGroupRef.current.getLayers()
      if (layers.length === 0) {
        if (onChange) onChange(undefined, undefined, undefined)
        return
      }

      let finalGeoJson: any
      let centerLat: number | undefined
      let centerLng: number | undefined

      // Encontrar la capa principal (priorizamos Polígono > Línea > Punto)
      const primaryLayer = layers.find(l => l instanceof L.Polygon) 
                        || layers.find(l => l instanceof L.Polyline) 
                        || layers[0]

      const layerGeoJson = (primaryLayer as any).toGeoJSON()
      finalGeoJson = layerGeoJson.geometry
      
      // Calcular centro
      if (primaryLayer instanceof L.Marker) {
        centerLat = primaryLayer.getLatLng().lat
        centerLng = primaryLayer.getLatLng().lng
      } else if (primaryLayer instanceof L.Polygon || primaryLayer instanceof L.Polyline) {
        const bounds = (primaryLayer as any).getBounds()
        centerLat = bounds.getCenter().lat
        centerLng = bounds.getCenter().lng
      }

      if (onChange) {
        onChange(centerLat, centerLng, JSON.stringify(finalGeoJson))
      }
    }

    map.on('pm:create', (e) => {
      handleChange()
      e.layer.on('pm:edit', handleChange)
      e.layer.on('pm:dragend', handleChange)
    })

    map.on('pm:remove', () => {
      handleChange()
    })

    const attachEditEvents = () => {
      featureGroupRef.current.eachLayer(layer => {
        layer.off('pm:edit').on('pm:edit', handleChange)
        layer.off('pm:dragend').on('pm:dragend', handleChange)
      })
    }

    // Attach to any initially loaded layers
    attachEditEvents()

    return () => {
      map.off('pm:create')
      map.off('pm:remove')
    }
  }, [map, readOnly, onChange])

  return null
}

export function AssetMap({ latitude, longitude, geoJson, onChange, readOnly = false, assetName: _assetName, riskLevel, assetState, assetStateColor }: AssetMapProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const center = (latitude != null && longitude != null) 
    ? new L.LatLng(latitude, longitude) 
    : DEFAULT_CENTER

  const riskBadgeStyles = {
    Low: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
    Moderate: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400',
    High: 'bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-400',
    Critical: 'bg-destructive/15 text-destructive border-destructive/30 animate-pulse'
  }

  return (
    <div className={isFullscreen 
      ? "fixed inset-0 z-[9999] bg-background" 
      : "relative h-[400px] w-full rounded-md border overflow-hidden"
    }>
      <MapContainer center={center} zoom={DEFAULT_ZOOM} scrollWheelZoom={true} className="h-full w-full z-0">
        <MapResizer />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <GeomanEditor 
          geoJson={geoJson} 
          latitude={latitude} 
          longitude={longitude} 
          readOnly={readOnly} 
          onChange={onChange} 
          assetStateColor={assetStateColor}
        />
        <MapLegend 
          states={assetState ? [{ name: assetState, color: assetStateColor || '#3388ff' }] : []}
          showRisk={true}
        />
      </MapContainer>
      
      {riskLevel && (
        <div className="absolute top-2 left-12 z-[400] pointer-events-none">
          <div className={`px-2.5 py-1 rounded-md border text-xs font-semibold backdrop-blur-md shadow-sm ${riskBadgeStyles[riskLevel] || ''}`}>
            Riesgo Predictivo: {riskLevel}
          </div>
        </div>
      )}

      <button 
        onClick={(e) => {
          e.preventDefault()
          setIsFullscreen(!isFullscreen)
        }}
        className={`absolute z-[400] bg-background p-1.5 rounded-md border shadow-sm hover:bg-muted transition-colors ${
          isFullscreen ? 'top-4 right-4' : 'bottom-4 right-4'
        }`}
        title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
      >
        {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
      </button>

      {!readOnly && !isFullscreen && (
        <div className="absolute top-2 right-2 z-[400] pointer-events-none flex items-start justify-center">
          <div className="bg-background/90 backdrop-blur-sm border shadow-sm px-3 py-1.5 rounded-md text-xs font-medium">
            Usa las herramientas de la izquierda para dibujar
          </div>
        </div>
      )}
    </div>
  )
}
