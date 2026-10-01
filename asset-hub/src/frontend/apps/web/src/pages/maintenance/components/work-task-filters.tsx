import { Search, User, Users, Box, AlertTriangle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AsyncCombobox } from '@/components/ui/async-combobox'
import { DatePicker } from '@/components/date-picker'
import { parseISO } from 'date-fns'
import { apiClient as api } from '@/lib/api-client'

export interface WorkTaskFilters {
  searchTerm?: string
  state?: string
  assignedEmployeeId?: string
  assignedEmployeeName?: string
  assignedTeamId?: string
  assignedTeamName?: string
  assetId?: string
  assetName?: string
  incidentId?: string
  incidentTitle?: string
  dueFrom?: string
  dueTo?: string
}

interface EmployeeOption { id: string; name: string }
interface TeamOption { id: string; name: string }
interface AssetOption { id: string; name: string; code?: string }
interface IncidentOption { id: string; title: string }

interface Props {
  filters: WorkTaskFilters
  onChange: (filters: WorkTaskFilters) => void
}

const STATE_OPTIONS = [
  { value: '', labelKey: 'form.filters.states.allStates' as const },
  { value: 'todo', labelKey: 'form.filters.states.todo' as const },
  { value: 'in_progress', labelKey: 'form.filters.states.inProgress' as const },
  { value: 'done', labelKey: 'form.filters.states.done' as const },
  { value: 'cancelled', labelKey: 'form.filters.states.cancelled' as const },
]

function parseOptionalDate(value?: string): Date | undefined {
  if (!value) return undefined
  try {
    return parseISO(value)
  } catch {
    return undefined
  }
}

function toIsoDate(date: Date | undefined): string | undefined {
  if (!date) return undefined
  return date.toISOString().split('T')[0]
}

export function WorkTaskFilters({ filters, onChange }: Props) {
  const { t } = useTranslation(['maintenance', 'common'])
  const update = (patch: Partial<WorkTaskFilters>) => onChange({ ...filters, ...patch })

  const clearFilters = () =>
    onChange({
      searchTerm: '',
      state: '',
      assignedEmployeeId: '',
      assignedEmployeeName: '',
      assignedTeamId: '',
      assignedTeamName: '',
      assetId: '',
      assetName: '',
      incidentId: '',
      incidentTitle: '',
      dueFrom: '',
      dueTo: '',
    })

  const hasFilters =
    filters.searchTerm ||
    filters.state ||
    filters.assignedEmployeeId ||
    filters.assignedTeamId ||
    filters.assetId ||
    filters.incidentId ||
    filters.dueFrom ||
    filters.dueTo

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg border bg-muted/20">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t('form.filters.search')}</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('tasks.searchPlaceholder')}
              value={filters.searchTerm ?? ''}
              onChange={(e) => update({ searchTerm: e.target.value })}
              className="pl-9"
            />
          </div>
        </div>

        <div className="min-w-[180px]">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t('common:labels.status')}</label>
          <Select value={filters.state ?? ''} onValueChange={(value) => update({ state: value })}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('form.filters.states.allStates')} />
            </SelectTrigger>
            <SelectContent>
              {STATE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[220px]">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t('form.filters.assignedEmployee')}</label>
          <AsyncCombobox<EmployeeOption>
            fetcher={async (query) => {
              const { data } = await api.get<{ items: EmployeeOption[] }>('/employees', { params: { q: query } })
              return data.items
            }}
            labelKey="name"
            valueKey="id"
            placeholder={filters.assignedEmployeeName ?? t('form.filters.searchEmployee')}
            searchPlaceholder={t('form.searchTypePlaceholder')}
            emptyText={t('form.filters.noEmployees')}
            onSelect={(item) => update({ assignedEmployeeId: item.id, assignedEmployeeName: item.name })}
            renderTrigger={(onClick) => (
              <Button
                type="button"
                variant="outline"
                role="combobox"
                onClick={onClick}
                className="w-[220px] justify-between font-normal"
              >
                {filters.assignedEmployeeName ?? filters.assignedEmployeeId ?? t('form.filters.searchEmployee')}
                <User className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            )}
          />
        </div>

        <div className="min-w-[220px]">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t('form.filters.assignedTeam')}</label>
          <AsyncCombobox<TeamOption>
            fetcher={async (query) => {
              const { data } = await api.get<{ items: TeamOption[] }>('/teams', { params: { q: query } })
              return data.items
            }}
            labelKey="name"
            valueKey="id"
            placeholder={filters.assignedTeamName ?? t('form.filters.searchTeam')}
            searchPlaceholder={t('form.searchTypePlaceholder')}
            emptyText={t('form.filters.noTeams')}
            onSelect={(item) => update({ assignedTeamId: item.id, assignedTeamName: item.name })}
            renderTrigger={(onClick) => (
              <Button
                type="button"
                variant="outline"
                role="combobox"
                onClick={onClick}
                className="w-[220px] justify-between font-normal"
              >
                {filters.assignedTeamName ?? filters.assignedTeamId ?? t('form.filters.searchTeam')}
                <Users className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            )}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t('fields.asset')}</label>
          <AsyncCombobox<AssetOption>
            fetcher={async (query) => {
              const { data } = await api.get<{ items: AssetOption[] }>('/assets', { params: { q: query } })
              return data.items
            }}
            labelKey="name"
            valueKey="id"
            placeholder={filters.assetName ?? t('form.filters.searchAsset')}
            searchPlaceholder={t('form.searchTypePlaceholder')}
            emptyText={t('form.noAssetsFound')}
            onSelect={(item) => update({ assetId: item.id, assetName: item.name })}
            renderTrigger={(onClick) => (
              <Button
                type="button"
                variant="outline"
                role="combobox"
                onClick={onClick}
                className="w-[220px] justify-between font-normal"
              >
                {filters.assetName ?? filters.assetId ?? t('form.filters.searchAsset')}
                <Box className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            )}
          />
        </div>

        <div className="min-w-[220px]">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t('form.filters.incident')}</label>
          <AsyncCombobox<IncidentOption>
            fetcher={async (query) => {
              const { data } = await api.get<{ items: IncidentOption[] }>('/incidents', { params: { q: query } })
              return data.items
            }}
            labelKey="title"
            valueKey="id"
            placeholder={filters.incidentTitle ?? t('form.filters.searchIncident')}
            searchPlaceholder={t('form.searchTypePlaceholder')}
            emptyText={t('form.filters.noIncidents')}
            onSelect={(item) => update({ incidentId: item.id, incidentTitle: item.title })}
            renderTrigger={(onClick) => (
              <Button
                type="button"
                variant="outline"
                role="combobox"
                onClick={onClick}
                className="w-[220px] justify-between font-normal"
              >
                {filters.incidentTitle ?? filters.incidentId ?? t('form.filters.searchIncident')}
                <AlertTriangle className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            )}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t('form.filters.dueFrom')}</label>
          <DatePicker
            selected={parseOptionalDate(filters.dueFrom)}
            onSelect={(date) => update({ dueFrom: toIsoDate(date) })}
            placeholder={t('form.filters.startDatePlaceholder')}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t('form.filters.dueTo')}</label>
          <DatePicker
            selected={parseOptionalDate(filters.dueTo)}
            onSelect={(date) => update({ dueTo: toIsoDate(date) })}
            placeholder={t('form.filters.endDatePlaceholder')}
          />
        </div>

        {hasFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="mb-0.5">
            <X className="mr-1 h-4 w-4" />
            {t('common:actions.clear')}
          </Button>
        )}
      </div>
    </div>
  )
}
