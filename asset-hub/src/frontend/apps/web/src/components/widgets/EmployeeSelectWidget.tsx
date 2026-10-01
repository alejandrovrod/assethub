import { WidgetProps } from '@rjsf/utils'
import { AsyncCombobox } from '@/components/ui/async-combobox'
import { Button } from '@/components/ui/button'
import { User } from 'lucide-react'
import { apiClient as api } from '@/lib/api-client'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export function EmployeeSelectWidget(props: WidgetProps) {
  const { id, value, onChange, disabled, readonly } = props
  const [employeeName, setEmployeeName] = useState<string>('')
  const { t } = useTranslation('common')

  // Fetch the employee name if a value is pre-selected and we don't have the name yet
  useEffect(() => {
    if (value && !employeeName) {
      api.get(`/employees/${value}`).then((res) => {
        if (res.data) {
          setEmployeeName(`${res.data.firstName} ${res.data.lastName}`)
        }
      }).catch(() => {
        setEmployeeName(t('select.employeeNotFound'))
      })
    }
  }, [value, employeeName])

  return (
    <div className="w-full">
      <AsyncCombobox<{ id: string; name: string }>
        fetcher={async (query) => {
          const { data } = await api.get<{ items: Array<{ id: string; firstName: string; lastName: string }> }>('/employees', {
            params: { search: query, isActive: true },
          })
          return data.items.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))
        }}
        labelKey="name"
        valueKey="id"
        placeholder={t('select.employeePlaceholder')}
        searchPlaceholder={t('labels.placeholder')}
        emptyText={t('status.noResults')}
        onSelect={(item) => {
          onChange(item.id)
          setEmployeeName(item.name)
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
            {value ? employeeName || t('status.loading') : t('select.employeePlaceholder')}
            <User className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      />
    </div>
  )
}
