import { useTranslation } from 'react-i18next'

export default function SettingsAudit() {
  const { t } = useTranslation('settings')
  const { t: tCommon } = useTranslation('common')

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">

      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
        <div className="flex flex-col items-center gap-1 text-center">
          <h3 className="text-2xl font-bold tracking-tight">{tCommon('status.comingSoon')}</h3>
          <p className="text-sm text-muted-foreground">{t('audit.underConstruction')}</p>
        </div>
      </div>
    </div>
  )
}
