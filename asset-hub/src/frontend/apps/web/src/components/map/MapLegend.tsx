import { Check } from 'lucide-react'

export interface MapLegendProps {
  states: { name: string; color: string }[]
  showRisk?: boolean
  hiddenStates?: string[]
  onStateToggle?: (stateName: string) => void
  hiddenRisks?: string[]
  onRiskToggle?: (risk: string) => void
}

export function MapLegend({ 
  states, 
  showRisk = true, 
  hiddenStates = [], 
  onStateToggle,
  hiddenRisks = [],
  onRiskToggle
}: MapLegendProps) {

  const risks = [
    { id: 'Low', label: 'Low (Bajo)', bgClass: 'bg-emerald-500', borderClass: 'border-emerald-600/30' },
    { id: 'Moderate', label: 'Moderate (Moderado)', bgClass: 'bg-amber-500', borderClass: 'border-amber-600/30' },
    { id: 'High', label: 'High (Alto)', bgClass: 'bg-orange-500', borderClass: 'border-orange-600/30' },
    { id: 'Critical', label: 'Critical (Crítico)', bgClass: 'bg-destructive', borderClass: 'border-destructive/30' } // removed animate-pulse to avoid weird UI in legend
  ]

  return (
    <div className="absolute bottom-6 left-2 z-[400] pointer-events-none flex flex-col gap-2 select-none">
      {states.length > 0 && (
        <div className="bg-background/90 backdrop-blur-sm border shadow-sm p-3 rounded-md pointer-events-auto">
          <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Filtrar por Estado</h4>
          <div className="flex flex-col gap-1.5">
            {states.map((s, i) => {
              const isHidden = hiddenStates.includes(s.name)
              return (
                <div 
                  key={i} 
                  className={`flex items-center gap-2 text-xs cursor-pointer transition-opacity hover:opacity-80 ${isHidden ? 'opacity-40 grayscale' : 'opacity-100'}`}
                  onClick={() => onStateToggle && onStateToggle(s.name)}
                >
                  <div className="relative flex items-center justify-center w-4 h-4">
                    <div 
                      className="w-3 h-3 rounded-full border border-black/20 absolute" 
                      style={{ backgroundColor: s.color || '#3388ff' }}
                    />
                    {!isHidden && <Check className="w-3 h-3 text-white absolute drop-shadow-md z-10" strokeWidth={3} />}
                  </div>
                  <span className={isHidden ? 'line-through' : ''}>{s.name}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showRisk && (
        <div className="bg-background/90 backdrop-blur-sm border shadow-sm p-3 rounded-md pointer-events-auto">
          <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Filtrar por Riesgo</h4>
          <div className="flex flex-col gap-1.5 text-xs">
            {risks.map((r) => {
              const isHidden = hiddenRisks.includes(r.id)
              return (
                <div 
                  key={r.id} 
                  className={`flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80 ${isHidden ? 'opacity-40 grayscale' : 'opacity-100'}`}
                  onClick={() => onRiskToggle && onRiskToggle(r.id)}
                >
                  <div className="relative flex items-center justify-center w-4 h-4">
                    <div className={`w-3 h-3 rounded-sm ${r.bgClass} border ${r.borderClass} absolute`} />
                    {!isHidden && <Check className="w-3 h-3 text-white absolute drop-shadow-md z-10" strokeWidth={3} />}
                  </div>
                  <span className={isHidden ? 'line-through' : ''}>{r.label}</span>
                </div>
              )
            })}
            
            {/* Opcion para activos sin riesgo predictivo evaluado */}
            <div 
              className={`flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80 mt-1 ${hiddenRisks.includes('None') ? 'opacity-40 grayscale' : 'opacity-100'}`}
              onClick={() => onRiskToggle && onRiskToggle('None')}
            >
               <div className="relative flex items-center justify-center w-4 h-4">
                  <div className="w-3 h-3 rounded-sm bg-muted border border-muted-foreground/30 absolute" />
                  {!hiddenRisks.includes('None') && <Check className="w-3 h-3 text-muted-foreground absolute drop-shadow-md z-10" strokeWidth={3} />}
               </div>
               <span className={hiddenRisks.includes('None') ? 'line-through' : ''}>Sin evaluar</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
