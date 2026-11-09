// assets.index.tsx — Field asset finder: local search, QR/barcode scan and quick filters
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight, Loader2, MapPin, QrCode, Search, X } from 'lucide-react';
import { db } from '@asset-hub/core-offline';
import {
  ASSET_CRITICALITY_CONFIG,
  ASSET_STATE_BUCKETS,
  findAssetByScannedCode,
  formatLocationPath,
  getAssetStateBucket,
  useAssetSearch,
  type AssetStateBucket,
} from '../features/assets/hooks/useAssets';

// The decoder bundle (@zxing) is only needed while the camera is open: keep it out of
// the initial chunk so the field device boots fast on a slow connection.
const BarcodeScannerModal = lazy(() =>
  import('../shared/components/BarcodeScannerModal').then((module) => ({
    default: module.BarcodeScannerModal,
  })),
);

interface AssetsPageProps {
  tenantId: string;
  onSelectAsset: (assetId: string) => void;
}

export function AssetsPage({ tenantId, onSelectAsset }: AssetsPageProps) {
  const { t } = useTranslation('assets');
  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState<AssetStateBucket>('all');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [unmatchedScan, setUnmatchedScan] = useState<string | null>(null);

  const { assets, counts, isLoading } = useAssetSearch(query, bucket);

  const filters = useMemo(
    () => ASSET_STATE_BUCKETS.filter((option) => counts[option.key] > 0),
    [counts],
  );

  const handleScan = useCallback(
    async (code: string) => {
      const asset = await findAssetByScannedCode(db, tenantId, code);
      if (asset) {
        setUnmatchedScan(null);
        setQuery('');
        setBucket('all');
        onSelectAsset(asset.id);
        return;
      }
      // No local match: keep the payload as the query so the technician sees the empty
      // state with the scanned code instead of a modal that vanishes without feedback.
      setBucket('all');
      setQuery(code);
      setUnmatchedScan(code);
    },
    [tenantId, onSelectAsset],
  );

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t('list.title')}</h2>
          <p className="text-xs text-muted-foreground">
            {isLoading ? t('list.loading') : t('list.count', { count: counts.all })}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setUnmatchedScan(null);
            }}
            placeholder={t('list.searchPlaceholder')}
            aria-label={t('list.searchAria')}
            className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-9 text-sm shadow-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setUnmatchedScan(null);
              }}
              aria-label={t('list.clearSearch')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsScannerOpen(true)}
          aria-label={t('list.scanAria')}
          className="flex h-11 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition active:scale-95"
        >
          <QrCode className="h-5 w-5" />
          <span className="hidden sm:inline">{t('list.scan')}</span>
        </button>
      </div>

      {unmatchedScan && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">{t('list.unmatchedTitle', { code: unmatchedScan })}</p>
            <p className="mt-0.5 text-amber-700/80 dark:text-amber-300/80">
              {t('list.unmatchedHint')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUnmatchedScan(null)}
            aria-label={t('list.dismissAlert')}
            className="rounded-full p-1 transition hover:bg-amber-500/20"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          onClick={() => setBucket('all')}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            bucket === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {t('list.filterAll')}
          <span className="ml-1.5 opacity-70">{counts.all}</span>
        </button>
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setBucket(filter.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              bucket === filter.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {t(filter.labelKey)}
            <span className="ml-1.5 opacity-70">{counts[filter.key]}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : counts.all === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <QrCode className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">{t('list.emptyCatalog')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <Trans
              ns="assets"
              i18nKey="list.emptyCatalogHint"
              components={{ strong: <span className="font-semibold" /> }}
            />
          </p>
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <Search className="mx-auto h-9 w-9 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold">{t('list.emptySearch')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('list.emptySearchHint')}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {assets.map((asset) => {
            const stateBucket = getAssetStateBucket(asset.state);
            const criticality = ASSET_CRITICALITY_CONFIG[asset.criticality] ?? ASSET_CRITICALITY_CONFIG.medium;
            const location = formatLocationPath(asset.locationPath);

            return (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => onSelectAsset(asset.id)}
                  className="relative flex w-full items-stretch gap-2 overflow-hidden rounded-xl border bg-card p-3 text-left shadow-xs transition hover:border-primary/40 active:scale-[0.99]"
                >
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-1 ${stateBucket.accentClassName}`}
                  />
                  <div className="min-w-0 flex-1 pl-1.5">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-tight">
                        {asset.code || '—'}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${criticality.className}`}
                      >
                        {t(criticality.labelKey)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold">
                      {asset.name || t('fields.noName')}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 font-medium ${stateBucket.chipClassName}`}
                      >
                        {asset.state ? asset.state.replace(/_/g, ' ') : 'Sin estado'}
                      </span>
                      {location && (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{location}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground/50" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {isScannerOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/95 text-white">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-white/70">Cargando escáner…</p>
            </div>
          }
        >
          <BarcodeScannerModal onScan={handleScan} onClose={() => setIsScannerOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
