// maintenance-orders.tsx — List of maintenance orders (work orders)
import { useState, useEffect } from 'react';
import { loadSession } from '../auth/session-store';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5168';

interface MaintenanceOrder {
  id: string;
  orderNumber?: string;
  title?: string;
  state?: string;
  priority?: string;
  assetName?: string;
}

export function MaintenanceOrdersPage() {
  const [orders, setOrders] = useState<MaintenanceOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const session = await loadSession();
        if (!session?.accessToken) { setIsLoading(false); return; }
        const res = await fetch(`${API_BASE}/api/v1/maintenance-orders?pageSize=50`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOrders(Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : []);
        } else {
          setError('Error al cargar órdenes de trabajo');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error de red');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Órdenes de Trabajo</h2>

      {isLoading && <p className="text-muted-foreground">Cargando…</p>}
      {error && <p className="text-destructive">{error}</p>}

      {!isLoading && orders.length === 0 && !error && (
        <p className="text-muted-foreground">No hay órdenes de trabajo asignadas</p>
      )}

      <ul className="space-y-2">
        {orders.map((order) => (
          <li key={order.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{order.orderNumber ?? order.id}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                order.state === 'completed' ? 'bg-green-500/10 text-green-600' :
                order.state === 'in_progress' ? 'bg-blue-500/10 text-blue-600' :
                'bg-muted text-muted-foreground'
              }`}>
                {order.state ?? 'pendiente'}
              </span>
            </div>
            {order.title && <p className="mt-1 text-sm">{order.title}</p>}
            {order.assetName && (
              <p className="mt-1 text-xs text-muted-foreground">{order.assetName}</p>
            )}
            {order.priority && (
              <p className="mt-1 text-xs text-muted-foreground">Prioridad: {order.priority}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
