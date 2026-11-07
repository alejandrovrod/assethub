// assets.$assetId.tsx — Field asset inspector: details, work and incident history
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ClipboardList,
  History,
  Loader2,
  MapPin,
  Navigation,
  Wrench,
  X,
} from 'lucide-react';
import {
  db,
  type AssetRecord,
  type MaintenanceOrderRecord,
  type TaskRecord,
} from '@asset-hub/core-offline';
import { PropagatedPropertiesDisplay } from '../shared/components/PropagatedPropertiesDisplay';
import { DynamicTemplateForm } from '../shared/components/DynamicTemplateForm';
import { SearchableSelect } from '../shared/components/SearchableSelect';
import { reportIncident } from '../commands/report-incident';
import {
  ASSET_CRITICALITY_CONFIG,
  formatLocationPath,
  getAssetStateBucket,
} from '../features/assets/hooks/useAssets';

interface Props {
  assetId: string;
  tenantId: string;
  onClose: () => void;
  onNavigateOrder?: (orderId: string) => void;
  onNavigateTask?: (taskId: string) => void;
}

type Tab = 'details' | 'work' | 'incidents';

const TAB_CONFIG: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
  { key: 'details', label: 'Detalles', icon: <ClipboardList className="h-3.5 w-3.5" /> },
  { key: 'work', label: 'Órdenes y tareas', icon: <Wrench className="h-3.5 w-3.5" /> },
  { key: 'incidents', label: 'Incidencias', icon: <History className="h-3.5 w-3.5" /> },
];

const TASK_STATE_CONFIG: Record<string, { label: string; className: string }> = {
  todo: { label: 'Pendiente', className: 'bg-muted text-muted-foreground' },
  rework: { label: 'Retrabajo', className: 'bg-red-500/10 text-red-600' },
  in_progress: { label: 'En curso', className: 'bg-amber-500/15 text-amber-700' },
  paused: { label: 'Pausada', className: 'bg-amber-500/10 text-amber-600' },
  done: { label: 'Hecha', className: 'bg-emerald-500/10 text-emerald-600' },
  cancelled: { label: 'Cancelada', className: 'bg-muted text-muted-foreground line-through' },
};

const ORDER_STATE_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'bg-muted text-muted-foreground' },
  approved: { label: 'Aprobada', className: 'bg-blue-500/10 text-blue-600' },
  scheduled: { label: 'Programada', className: 'bg-indigo-500/10 text-indigo-600' },
  in_progress: { label: 'En progreso', className: 'bg-amber-500/15 text-amber-700' },
  done: { label: 'Terminada', className: 'bg-emerald-500/10 text-emerald-600' },
  verified: { label: 'Verificada', className: 'bg-purple-500/10 text-purple-600' },
  cancelled: { label: 'Cancelada', className: 'bg-red-500/10 text-red-600' },
};

/** Renders the asset code as a QR so another device can scan the screen. */
function AssetQrBadge({ value }: { value: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !value) return;
    container.innerHTML = '';

    // Dynamic import keeps the QR encoder out of the initial bundle; it is only needed
    // when an asset detail is open.
    let cancelled = false;
    import('@zxing/browser')
      .then(({ BrowserQRCodeSvgWriter }) => {
        if (cancelled) return;
        try {
          new BrowserQRCodeSvgWriter().writeToDom(container, value, 64, 64);
        } catch {
          // A code that cannot be encoded (empty/odd payload) simply leaves the badge blank.
        }
      })
      .catch(() => {
        // Offline and not yet cached: the badge stays blank, the code is still shown as text.
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      ref={containerRef}
      aria-label={`Código QR del activo ${value}`}
      className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
    />
  );
}

function formatDate(ms?: number): string {
  if (!ms) return 'Sin fecha';
  return new Date(ms).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getCurrentPosition(
  timeoutMs = 4000,
): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs },
    );
  });
}

export function AssetDetailPage({
  assetId,
  tenantId,
  onClose,
  onNavigateOrder,
  onNavigateTask,
}: Props) {
  const asset = useLiveQuery(() => db.assets.get(assetId), [assetId]);
  const [tab, setTab] = useState<Tab>('details');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  const work = useLiveQuery(async () => {
    const orders = await db.maintenance_orders.where('assetId').equals(assetId).toArray();
    const orderIds = orders.map((order) => order.id);

    const [directTasks, orderTasks] = await Promise.all([
      db.tasks.where('assetId').equals(assetId).toArray(),
      orderIds.length > 0
        ? db.tasks.where('maintenanceOrderId').anyOf(orderIds).toArray()
        : Promise.resolve([] as TaskRecord[]),
    ]);

    const byId = new Map<string, TaskRecord>();
    for (const task of [...directTasks, ...orderTasks]) byId.set(task.id, task);

    const tasksByOrder = new Map<string, TaskRecord[]>();
    const looseTasks: TaskRecord[] = [];
    for (const task of byId.values()) {
      const belongsToOrder = task.maintenanceOrderId && orderIds.includes(task.maintenanceOrderId);
      if (!belongsToOrder) {
        looseTasks.push(task);
        continue;
      }
      const list = tasksByOrder.get(task.maintenanceOrderId as string) ?? [];
      list.push(task);
      tasksByOrder.set(task.maintenanceOrderId as string, list);
    }
    for (const list of tasksByOrder.values()) list.sort((a, b) => a.dueAtMs - b.dueAtMs);
    looseTasks.sort((a, b) => a.dueAtMs - b.dueAtMs);

    orders.sort((a, b) => b.scheduledStartMs - a.scheduledStartMs);

    return {
      orders: orders as MaintenanceOrderRecord[],
      tasks: Array.from(byId.values()),
      tasksByOrder,
      looseTasks,
    };
  }, [assetId]);

  const incidents = useLiveQuery(async () => {
    const list = await db.incidents.where('assetId').equals(assetId).toArray();
    return list.sort((a, b) => b.createdAtLocalMs - a.createdAtLocalMs);
  }, [assetId]);

  const bomMaterials = useLiveQuery(
    () => db.asset_bom_materials.where('assetId').equals(assetId).toArray(),
    [assetId],
  );

  const stateBucket = useMemo(() => getAssetStateBucket(asset?.state), [asset?.state]);
  const criticality = useMemo(
    () => (asset ? ASSET_CRITICALITY_CONFIG[asset.criticality] : undefined),
    [asset?.criticality],
  );

  const captureGeo = useCallback(async () => {
    setGeoStatus('Capturando…');
    const coords = await getCurrentPosition(10000);
    if (!coords) {
      setGeoStatus('No se pudo obtener la ubicación');
      return;
    }
    await db.assets.update(assetId, {
      latitude: coords.latitude,
      longitude: coords.longitude,
      geoJson: JSON.stringify({
        type: 'Point',
        coordinates: [coords.longitude, coords.latitude],
      }),
    });
    setGeoStatus(
      `Lat: ${coords.latitude.toFixed(6)}, Lng: ${coords.longitude.toFixed(6)}`,
    );
  }, [assetId]);

  if (asset === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (asset === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-sm font-semibold">Activo no encontrado</p>
        <p className="text-xs text-muted-foreground">
          Puede que ya no esté en el catálogo local. Sincronizá para actualizarlo.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Volver
        </button>
      </div>
    );
  }

  const location = formatLocationPath(asset.locationPath);
  const orderCount = work?.orders.length ?? 0;
  const taskCount = work?.tasks.length ?? 0;
  const incidentCount = incidents?.length ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Volver a activos"
              className="-ml-2 rounded-full p-2 transition hover:bg-muted"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold">
                  {asset.code || '—'}
                </span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${stateBucket.chipClassName}`}
                >
                  {asset.state ? asset.state.replace(/_/g, ' ') : 'Sin estado'}
                </span>
                {criticality && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${criticality.className}`}
                  >
                    {criticality.label}
                  </span>
                )}
              </div>
              <h1 className="mt-1 truncate text-lg font-bold leading-tight">
                {asset.name || 'Sin nombre'}
              </h1>
              {location && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{location}</span>
                </p>
              )}
            </div>
          </div>
          <AssetQrBadge value={asset.code} />
        </div>

        <nav className="mt-3 flex gap-1 rounded-xl bg-muted p-1">
          {TAB_CONFIG.map((item) => {
            const count =
              item.key === 'work'
                ? orderCount + taskCount
                : item.key === 'incidents'
                  ? incidentCount
                  : undefined;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                  tab === item.key
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
                {count !== undefined && count > 0 && (
                  <span className="rounded-full bg-primary/10 px-1 text-[10px] font-bold text-primary">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {flash && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
          <span className="flex-1">{flash}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label="Cerrar aviso">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <main className="flex-1 space-y-4 p-4 pb-28">
        {tab === 'details' && (
          <>
            <section className="grid grid-cols-2 gap-2">
              <InfoTile label="Estado" value={asset.state?.replace(/_/g, ' ') || '—'} />
              <InfoTile label="Criticidad" value={criticality?.label ?? '—'} />
              <InfoTile label="Plantilla" value={asset.templateName || '—'} />
              <InfoTile label="Serie" value={asset.serial || '—'} />
              <InfoTile label="Ubicación" value={location || 'Sin ubicación'} className="col-span-2" />
            </section>

            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Propiedades técnicas
              </h2>
              <PropagatedPropertiesDisplay
                ctx={{ tenantId, assetId: asset.id }}
                localPropertiesJson={asset.propertiesJson}
                isReadOnly
              />
            </section>

            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Georreferencia
              </h2>
              <p className="text-sm">
                {asset.latitude && asset.longitude
                  ? `${asset.latitude.toFixed(6)}, ${asset.longitude.toFixed(6)}`
                  : 'Sin ubicación GPS registrada'}
              </p>
              <button
                type="button"
                onClick={captureGeo}
                className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-input bg-background text-sm font-semibold transition active:scale-[0.99]"
              >
                <Navigation className="h-4 w-4" />
                {geoStatus ?? 'Capturar GPS'}
              </button>
              <p className="mt-1 text-[10px] text-muted-foreground">
                La captura se guarda en el dispositivo.
              </p>
            </section>

            {bomMaterials && bomMaterials.length > 0 && (
              <section className="rounded-xl border bg-card p-4">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Repuestos (BOM)
                </h2>
                <ul className="space-y-1.5">
                  {bomMaterials.map((material) => (
                    <li key={material.id} className="flex justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        {material.catalogItemLabel}{' '}
                        <span className="text-xs text-muted-foreground">
                          ({material.catalogItemCode})
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        ×{material.quantity} {material.unitOfMeasure}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {asset.syncState && asset.syncState !== 'synced' && (
              <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700">
                Hay cambios locales pendientes de sincronización en este activo.
              </p>
            )}
          </>
        )}

        {tab === 'work' && (
          <>
            {orderCount === 0 && taskCount === 0 ? (
              <EmptyState
                icon={<Wrench className="h-9 w-9 text-muted-foreground/40" />}
                title="Sin órdenes ni tareas"
                description="Este activo no tiene trabajo asignado en el dispositivo."
              />
            ) : (
              <>
                {work?.orders.map((order) => {
                  const config = ORDER_STATE_CONFIG[order.state] ?? ORDER_STATE_CONFIG.draft;
                  const orderTasks = work.tasksByOrder.get(order.id) ?? [];
                  return (
                    <section key={order.id} className="overflow-hidden rounded-xl border bg-card">
                      <button
                        type="button"
                        onClick={() => onNavigateOrder?.(order.id)}
                        disabled={!onNavigateOrder}
                        className="flex w-full items-start justify-between gap-2 p-3 text-left transition hover:bg-muted/40 disabled:cursor-default"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{order.title}</p>
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <CalendarClock className="h-3 w-3" />
                            {formatDate(order.scheduledStartMs)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${config.className}`}
                        >
                          {config.label}
                        </span>
                      </button>

                      {orderTasks.length > 0 && (
                        <ul className="divide-y border-t">
                          {orderTasks.map((task) => (
                            <TaskRow key={task.id} task={task} onSelect={onNavigateTask} />
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}

                {(work?.looseTasks.length ?? 0) > 0 && (
                  <section className="overflow-hidden rounded-xl border bg-card">
                    <h2 className="border-b p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Tareas sueltas
                    </h2>
                    <ul className="divide-y">
                      {work?.looseTasks.map((task) => (
                        <TaskRow key={task.id} task={task} onSelect={onNavigateTask} />
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </>
        )}

        {tab === 'incidents' && (
          <>
            {incidentCount === 0 ? (
              <EmptyState
                icon={<History className="h-9 w-9 text-muted-foreground/40" />}
                title="Sin incidencias registradas"
                description="Cuando reportes una falla sobre este activo va a aparecer acá."
              />
            ) : (
              <ul className="space-y-2">
                {incidents?.map((incident) => (
                  <li key={incident.id} className="rounded-xl border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {incident.title}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          incident.syncState === 'synced'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : incident.syncState === 'pending' || incident.syncState === 'draft'
                              ? 'bg-amber-500/10 text-amber-600'
                              : 'bg-red-500/10 text-red-600'
                        }`}
                      >
                        {incident.state?.replace(/_/g, ' ') || incident.syncState}
                      </span>
                    </div>
                    {incident.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {incident.description}
                      </p>
                    )}
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {new Date(incident.createdAtLocalIso).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <button
          type="button"
          onClick={() => setIsReportOpen(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-destructive text-sm font-bold text-white shadow-sm transition active:scale-[0.99]"
        >
          <AlertTriangle className="h-4 w-4" />
          Reportar incidencia
        </button>
      </div>

      {isReportOpen && (
        <ReportIncidentSheet
          asset={asset}
          tenantId={tenantId}
          onClose={() => setIsReportOpen(false)}
          onCreated={() => {
            setIsReportOpen(false);
            setTab('incidents');
            setFlash('Incidencia reportada. Se sincronizará cuando haya conexión.');
          }}
        />
      )}
    </div>
  );
}

function InfoTile({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-lg bg-muted/50 px-3 py-2 ${className ?? ''}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed p-8 text-center">
      <div className="flex justify-center">{icon}</div>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function TaskRow({
  task,
  onSelect,
}: {
  task: TaskRecord;
  onSelect?: (taskId: string) => void;
}) {
  const config = TASK_STATE_CONFIG[task.state] ?? TASK_STATE_CONFIG.todo;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(task.id)}
        disabled={!onSelect}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-muted/40 disabled:cursor-default"
      >
        <div className="min-w-0">
          <p className="truncate text-sm">{task.title}</p>
          {task.dueAtMs > 0 && (
            <p className="text-[11px] text-muted-foreground">Vence {formatDate(task.dueAtMs)}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${config.className}`}>
          {config.label}
        </span>
      </button>
    </li>
  );
}

function ReportIncidentSheet({
  asset,
  tenantId,
  onClose,
  onCreated,
}: {
  asset: AssetRecord;
  tenantId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [workflowTemplateId, setWorkflowTemplateId] = useState<string>('');
  const [formProperties, setFormProperties] = useState<Record<string, any>>({});
  const [extraPhotoIds, setExtraPhotoIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Obtener plantillas de incidencia guardadas en IndexedDB
  const incidentTemplates = useLiveQuery(
    async () => {
      const all = await db.workflow_templates.toArray();
      // Filtrar plantillas que correspondan a incidencias
      return all.filter((t) => !t.entityType || t.entityType === 'incident' || t.entityType === 'incidents');
    },
    [],
  ) ?? [];

  // Seleccionar la primera plantilla automáticamente si hay disponibles
  useEffect(() => {
    if (incidentTemplates.length > 0 && !workflowTemplateId) {
      setWorkflowTemplateId(incidentTemplates[0].id);
    }
  }, [incidentTemplates, workflowTemplateId]);

  const selectedTemplate = useMemo(() => {
    return incidentTemplates.find((t) => t.id === workflowTemplateId) || null;
  }, [incidentTemplates, workflowTemplateId]);

  const handleFormFieldChange = (key: string, value: any) => {
    setFormProperties((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const coords = await getCurrentPosition();
      await reportIncident(db, {
        title: title.trim(),
        description: description.trim(),
        assetId: asset.id,
        assetCode: asset.code,
        assetName: asset.name,
        workflowTemplateId: workflowTemplateId || undefined,
        propertiesJson: JSON.stringify(formProperties),
        photoIds: extraPhotoIds,
        tenantId,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reportar la incidencia');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/50 sm:items-center sm:justify-center">
      <form
        onSubmit={handleSubmit}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold">Reportar incidencia</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {asset.code} · {asset.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-1.5 transition hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">{error}</p>
        )}

        {/* Selector de Plantilla de Incidencia */}
        <div className="mt-4 space-y-1.5">
          <label htmlFor="incident-template" className="text-xs font-semibold">
            Plantilla de Incidencia
          </label>
          <SearchableSelect
            id="incident-template"
            value={workflowTemplateId}
            onChange={(next) => {
              setWorkflowTemplateId(next);
              setFormProperties({});
              setExtraPhotoIds([]);
            }}
            options={incidentTemplates.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
            placeholder="(Sin plantilla específica)"
            searchPlaceholder="Buscar plantilla..."
            icon={<ClipboardList className="h-3.5 w-3.5" />}
          />
        </div>

        {/* Campos dinámicos de la plantilla (Reportar a, Imágenes, etc.) */}
        <DynamicTemplateForm
          template={selectedTemplate}
          values={formProperties}
          onChange={handleFormFieldChange}
          onPhotosChange={(ids) => setExtraPhotoIds((prev) => [...prev, ...ids])}
          disabled={isSubmitting}
        />

        <div className="mt-3 space-y-1.5">
          <label htmlFor="incident-title" className="text-xs font-semibold">
            Título
          </label>
          <input
            id="incident-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            autoFocus
            placeholder={`Falla en ${asset.name || asset.code}`}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="mt-3 space-y-1.5">
          <label htmlFor="incident-description" className="text-xs font-semibold">
            Descripción
          </label>
          <textarea
            id="incident-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            placeholder="Qué falla, cuándo empezó, qué se observa…"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Se guarda en el dispositivo y se envía al sincronizar. No hace falta conexión.
        </p>

        <button
          type="submit"
          disabled={isSubmitting || !title.trim()}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-destructive text-sm font-bold text-white disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
          {isSubmitting ? 'Guardando…' : 'Reportar incidencia'}
        </button>
      </form>
    </div>
  );
}
