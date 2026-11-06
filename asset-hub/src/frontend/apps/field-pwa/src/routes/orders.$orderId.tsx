// orders.$orderId.tsx — Maintenance Order Detail with offline tasks widget, parts editor & dynamic properties
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Play,
  CheckCircle,
  FileText,
  ListTodo,
  Package,
  ArrowRight,
} from 'lucide-react';
import {
  db,
  MaintenanceOrderRepository,
  TaskRepository,
  startOrder,
  completeOrder,
  updateOrderProperties,
} from '@asset-hub/core-offline';
import { PropagatedPropertiesDisplay } from '../shared/components/PropagatedPropertiesDisplay';

interface OrderDetailPageProps {
  orderId: string;
  onNavigateTask?: (taskId: string) => void;
  onNavigateAsset?: (assetId: string) => void;
}

export function OrderDetailPage({
  orderId,
  onNavigateTask,
  onNavigateAsset,
}: OrderDetailPageProps) {
  const [tab, setTab] = useState<'tasks' | 'details' | 'parts'>('tasks');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const order = useLiveQuery(() => db.maintenance_orders.get(orderId), [orderId]);

  const tasks = useLiveQuery(async () => {
    if (!order) return [];
    const taskRepo = new TaskRepository(db);
    return taskRepo.findByMaintenanceOrderId(order.tenantId, orderId);
  }, [order?.tenantId, orderId]);

  const parts = useLiveQuery(async () => {
    if (!order) return [];
    const orderRepo = new MaintenanceOrderRepository(db);
    return orderRepo.getParts(order.tenantId, orderId);
  }, [order?.tenantId, orderId]);

  const totalTasks = tasks?.length ?? 0;
  const completedTasks = tasks?.filter((t) => t.state === 'done' || t.state === 'cancelled').length ?? 0;
  const isReadyToComplete = totalTasks === 0 || completedTasks === totalTasks;

  if (order === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <p className="text-muted-foreground">Orden de trabajo no encontrada</p>
      </div>
    );
  }

  const handleStartOrder = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      await startOrder(db, orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar la orden');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteOrder = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      await completeOrder(db, orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al completar la orden');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background pb-20">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-muted-foreground uppercase">
              {order.code ? `[${order.code}] ` : ''}Tipo: {order.kind}
            </span>
            <h1 className="text-lg font-bold text-foreground">{order.title}</h1>
            {order.assetName && (
              <button
                onClick={() => order.assetId && onNavigateAsset && onNavigateAsset(order.assetId)}
                className="mt-0.5 text-xs font-medium text-primary hover:underline"
              >
                Activo: {order.assetName} {order.assetCode ? `(${order.assetCode})` : ''}
              </button>
            )}
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold uppercase text-foreground">
            {order.state}
          </span>
        </div>

        {error && (
          <div className="mt-2.5 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* State Action Controls */}
        <div className="mt-3 flex gap-2">
          {order.state !== 'in_progress' && order.state !== 'done' && order.state !== 'verified' && (
            <button
              onClick={handleStartOrder}
              disabled={isProcessing}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-98 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {isProcessing ? 'Iniciando…' : 'Iniciar Orden (Desbloquea tareas)'}
            </button>
          )}

          {order.state === 'in_progress' && (
            <div className="flex flex-1 flex-col gap-1.5">
              <button
                onClick={handleCompleteOrder}
                disabled={isProcessing || !isReadyToComplete}
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-98 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-60"
              >
                <CheckCircle className="h-4 w-4" />
                {isProcessing ? 'Completando…' : 'Completar Orden'}
              </button>
              {!isReadyToComplete && (
                <span className="text-center text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  Faltan tareas por finalizar ({completedTasks}/{totalTasks} completadas)
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex border-b bg-card">
        <button
          onClick={() => setTab('tasks')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 ${
            tab === 'tasks'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground'
          }`}
        >
          <ListTodo className="h-4 w-4" />
          Tareas ({tasks?.length ?? 0})
        </button>

        <button
          onClick={() => setTab('details')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 ${
            tab === 'details'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground'
          }`}
        >
          <FileText className="h-4 w-4" />
          Detalles
        </button>

        <button
          onClick={() => setTab('parts')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 ${
            tab === 'parts'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground'
          }`}
        >
          <Package className="h-4 w-4" />
          Repuestos ({parts?.length ?? 0})
        </button>
      </nav>

      {/* Content */}
      <main className="flex-1 p-4">
        {tab === 'tasks' && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tareas de la Orden (MaintenanceOrderTasksWidget)
            </h3>
            {tasks && tasks.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No hay tareas vinculadas a esta orden.
              </p>
            ) : (
              <div className="space-y-2">
                {tasks?.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => onNavigateTask && onNavigateTask(t.id)}
                    role="button"
                    tabIndex={0}
                    className="flex cursor-pointer items-center justify-between rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50 active:bg-muted"
                  >
                    <div>
                      <span className="font-semibold text-sm">{t.title}</span>
                      <p className="text-xs text-muted-foreground">Estado: {t.state}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'details' && (
          <div className="space-y-4">
            {order.description && (
              <div className="rounded-xl border bg-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Descripción
                </h3>
                <p className="mt-1.5 text-sm">{order.description}</p>
              </div>
            )}

            {/* Propagated Dynamic Properties */}
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Propiedades Dinámicas Propagadas
              </h3>
              <PropagatedPropertiesDisplay
                ctx={{
                  tenantId: order.tenantId,
                  assetId: order.assetId,
                  workflowTemplateId: order.workflowTemplateId,
                  incidentId: order.incidentId,
                  maintenanceOrderId: order.id,
                }}
                localPropertiesJson={order.propertiesJson}
                isReadOnly={order.state === 'done' || order.state === 'verified' || order.state === 'cancelled'}
                onSave={async (newProperties) => {
                  await updateOrderProperties(db, order.id, newProperties);
                }}
              />
            </div>
          </div>
        )}

        {tab === 'parts' && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Repuestos y Materiales (MaintenanceOrderPartsEditor)
            </h3>
            {parts && parts.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No hay repuestos registrados para esta orden.
              </p>
            ) : (
              <div className="space-y-2">
                {parts?.map((p) => (
                  <div key={p.id} className="rounded-xl border bg-card p-3 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span>{p.catalogItemLabel || p.catalogItemId}</span>
                      <span className="rounded bg-muted px-2 py-0.5">
                        Cant: {p.quantity}
                      </span>
                    </div>
                    {p.sourceType && (
                      <p className="mt-1 text-muted-foreground">Origen: {p.sourceType}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
