// useAssets.ts — Local (IndexedDB) asset search, filters and scan resolution
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  normalizeSearchCode,
  normalizeSearchText,
  type AssetRecord,
  type FieldDatabase,
} from '@asset-hub/core-offline';

export type AssetStateBucket = 'all' | 'operational' | 'maintenance' | 'failure' | 'other';

export interface AssetStateBucketConfig {
  key: AssetStateBucket;
  label: string;
  /** Tailwind classes for the state chip on a card. */
  chipClassName: string;
  /** Tailwind class for the accent bar on the left edge of a card. */
  accentClassName: string;
}

export const ASSET_STATE_BUCKETS: AssetStateBucketConfig[] = [
  {
    key: 'operational',
    label: 'Operativo',
    chipClassName: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    accentClassName: 'bg-emerald-500',
  },
  {
    key: 'maintenance',
    label: 'En mantenimiento',
    chipClassName: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    accentClassName: 'bg-amber-500',
  },
  {
    key: 'failure',
    label: 'Falla',
    chipClassName: 'bg-red-500/10 text-red-600 dark:text-red-400',
    accentClassName: 'bg-red-500',
  },
  {
    key: 'other',
    label: 'Sin clasificar',
    chipClassName: 'bg-muted text-muted-foreground',
    accentClassName: 'bg-muted-foreground/40',
  },
];

export const ASSET_CRITICALITY_CONFIG: Record<
  AssetRecord['criticality'],
  { label: string; className: string }
> = {
  critical: { label: 'Crítica', className: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  high: { label: 'Alta', className: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  medium: { label: 'Media', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  low: { label: 'Baja', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
};

/**
 * The tenant has free-text asset states (`Activo`, `Instalado_Activo`, `En_Reparacion`,
 * `Falla_Total`, `Limpieza`, …). The field app groups them into the three buckets a
 * technician cares about so the filter is useful regardless of the template naming.
 */
export function classifyAssetState(state?: string): Exclude<AssetStateBucket, 'all'> {
  const value = normalizeSearchText(state ?? '');
  if (!value) return 'other';
  if (/falla|averi|fuera de servicio|out of service|broken|inoperativ/.test(value)) return 'failure';
  if (/reparacion|mantenimiento|maintenance|limpieza|cleaning|inactivo|pausa/.test(value)) {
    return 'maintenance';
  }
  if (/activo|operativo|active|instalado|operational|normal|servicio/.test(value)) {
    return 'operational';
  }
  return 'other';
}

export function getAssetStateBucket(state?: string): AssetStateBucketConfig {
  const key = classifyAssetState(state);
  return ASSET_STATE_BUCKETS.find((bucket) => bucket.key === key) ?? ASSET_STATE_BUCKETS[3];
}

/** Location paths arrive as `/Carretera UNETI/Luminaria/`; the UI reads better as `Carretera UNETI › Luminaria`. */
export function formatLocationPath(pathNames?: string): string {
  if (!pathNames) return '';
  return pathNames
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' › ');
}

function matchesQuery(asset: AssetRecord, textQuery: string, codeQuery: string): boolean {
  if (!textQuery && !codeQuery) return true;

  if (asset.searchText && asset.searchText.includes(textQuery)) return true;
  if (asset.code && normalizeSearchText(asset.code).includes(textQuery)) return true;
  if (asset.name && normalizeSearchText(asset.name).includes(textQuery)) return true;
  if (asset.locationPath && normalizeSearchText(asset.locationPath).includes(textQuery)) return true;

  if (codeQuery) {
    const codes = asset.searchCodes ?? [];
    if (codes.some((code) => code === codeQuery || code.includes(codeQuery))) return true;
    if (asset.code && normalizeSearchCode(asset.code).includes(codeQuery)) return true;
  }

  return false;
}

export function useAssetSearch(query: string, bucket: AssetStateBucket = 'all') {
  const result = useLiveQuery(async () => {
    const all = await db.assets.toArray();
    const textQuery = normalizeSearchText(query);
    const codeQuery = normalizeSearchCode(query);

    const counts: Record<AssetStateBucket, number> = {
      all: all.length,
      operational: 0,
      maintenance: 0,
      failure: 0,
      other: 0,
    };
    for (const asset of all) {
      counts[classifyAssetState(asset.state)] += 1;
    }

    const assets = all
      .filter((asset) => bucket === 'all' || classifyAssetState(asset.state) === bucket)
      .filter((asset) => matchesQuery(asset, textQuery, codeQuery))
      .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '', undefined, { numeric: true }));

    return { assets, counts };
  }, [query, bucket]);

  return {
    assets: result?.assets ?? [],
    counts:
      result?.counts ??
      ({ all: 0, operational: 0, maintenance: 0, failure: 0, other: 0 } as Record<
        AssetStateBucket,
        number
      >),
    isLoading: result === undefined,
  };
}

export function useAsset(assetId: string) {
  const asset = useLiveQuery(() => db.assets.get(assetId), [assetId]);
  return {
    asset: asset ?? null,
    isLoading: asset === undefined,
  };
}

/**
 * Resolve a scanned QR / barcode payload to a local asset.
 *
 * The tag usually carries the asset code, but some templates print a URL or a serial
 * number, so we also try the last path segment and the normalized code index.
 */
export async function findAssetByScannedCode(
  database: FieldDatabase,
  tenantId: string,
  payload: string,
): Promise<AssetRecord | undefined> {
  const raw = payload.trim();
  if (!raw) return undefined;

  const candidates = new Set<string>();
  const normalized = normalizeSearchCode(raw);
  if (normalized) candidates.add(normalized);
  if (raw.includes('/')) {
    const tail = normalizeSearchCode(raw.split('/').filter(Boolean).pop() ?? '');
    if (tail) candidates.add(tail);
  }

  for (const candidate of candidates) {
    const bySearchCode = await database.assets.where('searchCodes').equals(candidate).first();
    if (bySearchCode) return bySearchCode;

    const byCode = await database.assets
      .where('[tenantId+code]')
      .equals([tenantId, candidate])
      .first();
    if (byCode) return byCode;
  }

  const textQuery = normalizeSearchText(raw);
  if (!textQuery) return undefined;

  return database.assets
    .filter(
      (asset) =>
        normalizeSearchText(asset.code) === textQuery ||
        (asset.searchText ?? '').includes(textQuery),
    )
    .first();
}
