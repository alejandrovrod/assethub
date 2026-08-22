import { WidgetProps } from '@rjsf/utils'
import { AsyncCombobox } from '@/components/ui/async-combobox'
import { Button } from '@/components/ui/button'
import { Users } from 'lucide-react'
import { apiClient as api } from '@/lib/api-client'
import { useState, useEffect } from 'react'

export function TeamSelectWidget(props: WidgetProps) {
  const { id, value, onChange, disabled, readonly } = props
  const [teamName, setTeamName] = useState<string>('')

  // Fetch the team name if a value is pre-selected and we don't have the name yet
  useEffect(() => {
    if (value && !teamName) {
      api.get(`/teams/${value}`).then((res) => {
        if (res.data) {
          setTeamName(res.data.name)
        }
      }).catch(() => {
        setTeamName('Equipo no encontrado')
      })
    }
  }, [value, teamName])

  return (
    <div className="w-full">
      <AsyncCombobox<{ id: string; name: string }>
        fetcher={async (query) => {
          const { data } = await api.get<{ items: Array<{ id: string; name: string }> }>('/teams', {
            params: { search: query, isActive: true },
          })
          return data.items.map((t) => ({ id: t.id, name: t.name }))
        }}
        labelKey="name"
        valueKey="id"
        placeholder="Buscar equipo..."
        searchPlaceholder="Escriba para buscar..."
        emptyText="No se encontraron equipos."
        onSelect={(item) => {
          onChange(item.id)
          setTeamName(item.name)
        }}
        renderTrigger={(onClick) => (
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            onClick={onClick}
            className="w-full justify-between font-normal"
            disabled={disabled || readonly}
          >
            {value ? teamName || 'Cargando...' : 'Buscar equipo...'}
            <Users className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      />
    </div>
  )
}
