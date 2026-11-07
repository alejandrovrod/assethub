import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@asset-hub/core-offline';
import { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { useSession } from './features/auth/hooks/useSession';
import { LoginPage } from './routes/login';
import { LockScreen } from './shared/components/LockScreen';
import { OfflineBanner } from './shared/components/OfflineBanner';
import { HighContrastToggle } from './shared/components/HighContrastToggle';
import { SyncChip } from './shared/components/SyncChip';
import { MiJornadaPage } from './routes/index';
import { TaskDetailPage } from './routes/tasks.$taskId';
import { OrdersPage } from './routes/orders.index';
import { OrderDetailPage } from './routes/orders.$orderId';
import { IncidentsPage } from './routes/incidents.index';
import { AssetsPage } from './routes/assets.index';
import { AssetDetailPage } from './routes/assets.$assetId';
import { StockPage } from './routes/stock';
import { SyncPage } from './routes/sync';

export function App() {
  const { state, session, isLoading, logout } = useSession();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [view, setView] = useState<'tasks' | 'incidents' | 'assets' | 'stock' | 'sync' | 'orders'>('tasks');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const navCounts = useLiveQuery(async () => {
    const pendingMut = await db.outbox_mutations.where('status').equals('pending').count();
    const deadMut = await db.outbox_mutations.where('status').equals('dead').count();
    const pendingMedia = await db.media_queue.where('status').equals('pending').count();
    const failedMedia = await db.media_queue.where('status').equals('failed').count();
    const pendingTasks = await db.tasks.filter((t) => t.syncState === 'pending').count();
    const pendingIncidents = await db.incidents
      .filter((i) => i.syncState === 'pending' || i.syncState === 'draft')
      .count();
    return {
      pending: pendingMut + pendingMedia + pendingTasks + pendingIncidents,
      dead: deadMut + failedMedia,
    };
  }) ?? { pending: 0, dead: 0 };

  const employee = useLiveQuery(
    () => (session?.employeeId ? db.directory_entries.get(session.employeeId) : undefined),
    [session?.employeeId]
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  if (state === 'LOCKED') {
    return <LockScreen onUnlock={async () => true} requireDeviceLock={true} />;
  }

  if (selectedTaskId) {
    return (
      <div>
        <button
          onClick={() => setSelectedTaskId(null)}
          className="p-4 text-sm font-semibold text-primary"
        >
          ← Volver a Mi Jornada
        </button>
        <TaskDetailPage
          key={selectedTaskId}
          taskId={selectedTaskId}
          onNavigateOrder={(orderId) => {
            setSelectedTaskId(null);
            setSelectedOrderId(orderId);
            setView('orders');
          }}
          onNavigateAsset={(assetId) => {
            setSelectedTaskId(null);
            setSelectedAssetId(assetId);
            setView('assets');
          }}
        />
      </div>
    );
  }

  if (selectedOrderId) {
    return (
      <div>
        <button
          onClick={() => setSelectedOrderId(null)}
          className="p-4 text-sm font-semibold text-primary"
        >
          ← Volver a Órdenes
        </button>
        <OrderDetailPage
          key={selectedOrderId}
          orderId={selectedOrderId}
          onNavigateTask={(taskId) => {
            setSelectedOrderId(null);
            setSelectedTaskId(taskId);
            setView('tasks');
          }}
          onNavigateAsset={(assetId) => {
            setSelectedOrderId(null);
            setSelectedAssetId(assetId);
            setView('assets');
          }}
        />
      </div>
    );
  }

  if (selectedAssetId) {
    return (
      <AssetDetailPage
        key={selectedAssetId}
        assetId={selectedAssetId}
        tenantId={session.tenantSlug ?? 'default'}
        onClose={() => setSelectedAssetId(null)}
        onNavigateOrder={(orderId) => {
          setSelectedAssetId(null);
          setSelectedOrderId(orderId);
          setView('orders');
        }}
        onNavigateTask={(taskId) => {
          setSelectedAssetId(null);
          setSelectedTaskId(taskId);
          setView('tasks');
        }}
      />
    );
  }

  const displayName =
    employee?.name ||
    session?.employeeName ||
    session?.userName ||
    session?.userEmail ||
    'Usuario';

  const roleBadge = session?.roleLabel || (session?.roles && session.roles[0]) || '';

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OfflineBanner isOnline={isOnline} />
      <header className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* User Avatar & Info */}
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary border border-primary/20"
              title={`${displayName}${roleBadge ? ` (${roleBadge})` : ''}`}
            >
              {initials || <User className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-xs font-bold text-foreground truncate">{displayName}</span>
                {roleBadge && (
                  <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {roleBadge}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {session.tenantName ?? 'AssetHub Campo'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <HighContrastToggle />
            <SyncChip
              isSyncing={false}
              pendingCount={navCounts.pending}
              deadCount={navCounts.dead}
              isOnline={isOnline}
            />
            <button
              onClick={() => {
                logout();
              }}
              className="rounded-lg border px-2 py-1 text-xs font-medium hover:bg-muted active:scale-95 transition-transform"
            >
              Salir
            </button>
          </div>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => {
              setView('tasks');
              setSelectedTaskId(null);
              setSelectedOrderId(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              view === 'tasks' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}
          >
            Mi Jornada
          </button>
          <button
            onClick={() => {
              setView('orders');
              setSelectedTaskId(null);
              setSelectedOrderId(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              view === 'orders' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}
          >
            OT
          </button>
          <button
            onClick={() => setView('incidents')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              view === 'incidents' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}
          >
            Incidencias
          </button>
          <button
            onClick={() => setView('assets')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              view === 'assets' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}
          >
            Activos
          </button>
          <button
            onClick={() => setView('stock')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              view === 'stock' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}
          >
            Stock
          </button>
          <button
            onClick={() => setView('sync')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              view === 'sync' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}
          >
            Sync
          </button>
        </div>
      </header>
      <main className="flex-1 p-4">
        {view === 'tasks' ? (
          <MiJornadaPage
            userId={session.userId}
            tenantId={session.tenantSlug ?? 'default'}
            employeeId={session.employeeId}
            teamIds={session.teamIds}
            onSelectTask={setSelectedTaskId}
          />
        ) : view === 'orders' ? (
          <OrdersPage
            tenantId={session.tenantSlug ?? 'default'}
            employeeId={session.employeeId}
            userId={session.userId}
            teamIds={session.teamIds}
            onSelectOrder={setSelectedOrderId}
            onSelectTask={(taskId) => {
              setSelectedOrderId(null);
              setSelectedTaskId(taskId);
              setView('tasks');
            }}
          />
        ) : view === 'incidents' ? (
          <IncidentsPage
            tenantId={session.tenantSlug ?? 'default'}
            employeeId={session.employeeId}
            userId={session.userId}
            teamIds={session.teamIds}
            onNavigateOrder={(orderId) => {
              setSelectedOrderId(orderId);
              setView('orders');
            }}
            onNavigateTask={(taskId) => {
              setSelectedTaskId(taskId);
              setView('tasks');
            }}
          />
        ) : view === 'assets' ? (
          <AssetsPage
            tenantId={session.tenantSlug ?? 'default'}
            onSelectAsset={setSelectedAssetId}
          />
        ) : view === 'stock' ? (
          <StockPage />
        ) : (
          <SyncPage />
        )}
      </main>
    </div>
  );
}
