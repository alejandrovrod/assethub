// useSync.ts — React hook for sync state and controls
import { useState, useEffect, useCallback } from 'react';
import { db, uuidv7 } from '@asset-hub/core-offline';
import { createSyncEngine } from '@asset-hub/core-offline';
import { createDrainer } from '@asset-hub/core-offline';
import { createLeader } from '@asset-hub/core-offline';
import { HttpClient } from '@asset-hub/core-offline';
import { pullAssets, needsAssetCatalogRefresh, pullDelta, pullOrders, pullIncidents, pullTasks, pullMetadata, reconcileIncidentCreates } from '@asset-hub/core-offline';
import { loadSession } from '../../auth/session-store';
import { saveSession } from '../../auth/session-store';
import { uploadMedia } from '../../media/uploader';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5168';

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  deadCount: number;
  pendingMediaCount: number;
  uploadedMediaCount: number;
  lastSyncAt: number | null;
  lastError: unknown | null;
  isLeader: boolean;
}

export function useSync() {
  const [state, setState] = useState<SyncState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingCount: 0,
    deadCount: 0,
    pendingMediaCount: 0,
    uploadedMediaCount: 0,
    lastSyncAt: null,
    lastError: null,
    isLeader: true,
  });

  const [engine] = useState(() => {
    const http = new HttpClient({
      baseUrl: API_BASE,
      getAccessToken: async () => {
        const session = await loadSession();
        return session?.accessToken ?? '';
      },
      getTenantSlug: async () => {
        const session = await loadSession();
        return session?.tenantSlug ?? undefined;
      },
      onUnauthorized: async () => {
        const session = await loadSession();
        if (!session?.refreshToken) {
          window.dispatchEvent(new CustomEvent('session:expired'));
          return;
        }
        try {
          const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: session.refreshToken }),
          });
          if (res.ok) {
            const data = await res.json();
            await saveSession({
              ...session,
              accessToken: data.accessToken,
              refreshToken: data.refreshToken ?? session.refreshToken,
              expiresAt: Date.now() + (data.expiresIn ?? 900) * 1000,
            });
          } else {
            // Refresh token inválido o revocado -> cerrar sesión y sacar al usuario
            window.dispatchEvent(new CustomEvent('session:expired'));
          }
        } catch {
          // Error de red no es token inválido, no forzamos logout si está offline
        }
      },
    });
    const drainer = createDrainer(db, http);
    const leader = createLeader();

    const pullFn = async () => {
      let pulled = 0;
      const session = await loadSession();
      const tenantId = session?.tenantSlug ?? 'default';

      // Tasks filtered to assigned user
      try {
        const result = await pullDelta('tasks', db, http, { assignedToMe: 'true' });
        pulled += result.fetched;
      } catch { /* continue */ }
      // Work tasks
      try {
        const taskResult = await pullTasks(db, http, tenantId);
        pulled += taskResult.fetched;
      } catch { /* continue */ }
      // Maintenance orders
      try {
        const orderResult = await pullOrders(db, http, tenantId);
        pulled += orderResult.fetched;
      } catch { /* continue */ }
      // Incidents
      try {
        // Repair rows created before the client id reached the server, then pull. Order
        // matters: the repair must run before the prune decides what is stale.
        await reconcileIncidentCreates(db, tenantId);
        const incidentResult = await pullIncidents(db, http, tenantId);
        pulled += incidentResult.fetched;
      } catch { /* continue */ }
      // Metadata (Workflow templates, employees, teams, catalogs)
      try {
        await pullMetadata(db, http, tenantId);
      } catch { /* continue */ }
      // Assets: the delta stream is only the change detector (it carries ids, not the
      // entity), the search endpoint is the payload. Refresh the full catalog only when
      // something changed or the device never downloaded it.
      try {
        const assetDelta = await pullDelta('assets', db, http);
        pulled += assetDelta.fetched;
        if (assetDelta.fetched > 0 || (await needsAssetCatalogRefresh(db))) {
          const assetResult = await pullAssets(db, http, tenantId);
          pulled += assetResult.fetched;
        }
      } catch { /* continue */ }
      // Other resources without filter
      for (const resource of ['stock'] as const) {
        try {
          const result = await pullDelta(resource, db, http);
          pulled += result.fetched;
        } catch { /* continue */ }
      }
      return { pulled };
    };

    const pushFn = async () => {
      return { pushed: 0 };
    };

    const eng = createSyncEngine({
      db,
      drainer,
      isOnline: () => navigator.onLine,
      pullFn,
      pushFn,
    });

    return { engine: eng, leader, http };
  });

  useEffect(() => {
    const updateCounts = async () => {
      const pendingMut = await db.outbox_mutations.where('status').equals('pending').count();
      const pendingTasks = await db.tasks.filter((t) => t.syncState === 'pending').count();
      const pendingIncidents = await db.incidents
        .filter((i) => i.syncState === 'pending' || i.syncState === 'draft')
        .count();
      const dead = await db.outbox_mutations.where('status').equals('dead').count();
      const pendingMedia = await db.media_queue.where('status').equals('pending').count();
      const uploadedMedia = await db.media_queue.where('status').equals('uploaded').count();
      setState((prev) => ({
        ...prev,
        pendingCount: pendingMut + pendingTasks + pendingIncidents + pendingMedia,
        deadCount: dead,
        pendingMediaCount: pendingMedia,
        uploadedMediaCount: uploadedMedia,
      }));
    };

    updateCounts();
    const interval = setInterval(updateCounts, 5000);

    const handleOnline = () => setState((prev) => ({ ...prev, isOnline: true }));
    const handleOffline = () => setState((prev) => ({ ...prev, isOnline: false }));
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    engine.engine.start();
    engine.leader.onBecameLeader(() => setState((prev) => ({ ...prev, isLeader: true })));
    engine.leader.onLostLeadership(() => setState((prev) => ({ ...prev, isLeader: false })));

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      engine.engine.stop();
      engine.leader.destroy();
    };
  }, [engine]);

  const drainNow = useCallback(async () => {
    setState((prev) => ({ ...prev, isSyncing: true, lastError: null }));
    try {
      // 1. Reset any pending/blocked/dead outbox mutations so manual sync retries immediately without waiting for backoff
      const allMutations = await db.outbox_mutations.toArray();
      for (const m of allMutations) {
        if (m.status === 'pending' || m.status === 'blocked' || m.status === 'dead') {
          if (m.attempts > 0 || m.status !== 'pending') {
            const freshId = uuidv7();
            await db.outbox_mutations.delete(m.id);
            await db.outbox_mutations.add({
              ...m,
              id: freshId,
              status: 'pending',
              attempts: 0,
              nextAttemptAtMs: 0,
              leaseOwner: undefined,
              leaseExpiresAtMs: undefined,
            });
          } else if (m.nextAttemptAtMs > 0) {
            await db.outbox_mutations.update(m.id, { nextAttemptAtMs: 0 });
          }
        }
      }

      await engine.engine.drainNow();

      // 2. Reconcile orphaned pending tasks (tasks marked 'pending' locally whose outbox mutation already finished or was discarded)
      if (navigator.onLine) {
        const session = await loadSession();
        if (session?.accessToken) {
          // 2. Refresh the asset catalog. It goes through the search endpoint because the
          // delta stream only carries ids, so the field list would end up without
          // code/name/searchText. Details are hydrated only for records still missing
          // their template schema, so a second pass is just one page request.
          try {
            await pullAssets(db, engine.http, session.tenantSlug ?? 'default');
          } catch (assetErr) {
            console.warn('Sync pull assets error:', assetErr);
          }

          const remainingMutations = await db.outbox_mutations
            .filter((m) => m.status === 'pending' || m.status === 'in_flight')
            .toArray();
          const activeAggIds = new Set(remainingMutations.map((m) => m.aggregateId));

          let reconciledAny = false;
          const pendingTasks = await db.tasks.filter((t) => t.syncState === 'pending').toArray();
          for (const task of pendingTasks) {
            if (activeAggIds.has(task.id)) continue;
            try {
              const res = await fetch(`${API_BASE}/api/v1/work-tasks/${task.id}/state`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session.accessToken}`,
                  ...(session.tenantSlug ? { 'X-Tenant': session.tenantSlug } : {}),
                  'Idempotency-Key': uuidv7(),
                  'If-Match': '*',
                },
                body: JSON.stringify({
                  state: task.state,
                  ...(task.geoEnd ? { geo: task.geoEnd } : task.geoStart ? { geo: task.geoStart } : {}),
                }),
              });
              if (res.ok || res.status === 409 || res.status === 404) {
                const rawEtag = res.headers.get('etag')?.replace(/^W\/|"$/g, '').replace(/^"/, '');
                await db.tasks.update(task.id, {
                  syncState: 'synced',
                  ...(rawEtag ? { version: rawEtag } : {}),
                });
                reconciledAny = true;
              }
            } catch (taskErr) {
              console.warn('Sync reconcile task error:', taskErr);
            }
          }

          // 3. Reconcile orphaned pending/draft incidents
          const pendingIncidents = await db.incidents
            .filter((i) => i.syncState === 'pending' || i.syncState === 'draft')
            .toArray();
          for (const inc of pendingIncidents) {
            if (activeAggIds.has(inc.id)) continue;
            try {
              const res = await fetch(`${API_BASE}/api/v1/incidents`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session.accessToken}`,
                  ...(session.tenantSlug ? { 'X-Tenant': session.tenantSlug } : {}),
                  'Idempotency-Key': uuidv7(),
                },
                body: JSON.stringify({
                  // Same id as the local row: otherwise the retry creates a second incident
                  // on the server and the local copy is pruned on the next pull.
                  id: inc.id,
                  title: inc.title,
                  description: inc.description,
                  assetId: inc.assetId,
                  photoIds: inc.photoIds ?? [],
                }),
              });
              if (res.ok || res.status === 409) {
                // Recovered from the outbox: the row lives only on this device, so the
                // pull must not treat it as stale.
                await db.incidents.update(inc.id, { syncState: 'synced', origin: 'local' });
                reconciledAny = true;
              }
            } catch {
              // Ignore network error, will retry next sync
            }
          }

          // Refresh tasks, orders, and incidents from server if any orphan was reconciled so MediatR cascades are reflected
          if (reconciledAny) {
            const tenantId = session.tenantSlug ?? 'default';
            await Promise.allSettled([
              pullTasks(db, engine.http, tenantId),
              pullOrders(db, engine.http, tenantId),
              pullIncidents(db, engine.http, tenantId),
            ]);
          }
        }
      }

      // 4. Drain pending media queue items (photos and evidences captured offline)
      if (navigator.onLine) {
        const pendingMedia = await db.media_queue.where('status').equals('pending').toArray();
        if (pendingMedia.length > 0) {
          const session = await loadSession();
          if (session?.accessToken) {
            for (const item of pendingMedia) {
              if (!item.blob) continue;
              try {
                const uploadRes = await uploadMedia(
                  db,
                  item.blob,
                  item.tenantId || session.tenantSlug || '',
                  item.ownerType,
                  item.ownerId,
                  item.purpose,
                  API_BASE,
                  session.accessToken
                );

                if (uploadRes.remoteUrl) {
                  // Si el medio pertenece a una incidencia, actualizar su propertiesJson y la mutación pendiente en el outbox
                  if (item.ownerType === 'incident') {
                    const mediaToken = `media://${item.id}`;
                    // 1. Reemplazar en db.incidents
                    const incs = await db.incidents.toArray();
                    for (const inc of incs) {
                      if (inc.propertiesJson && (inc.propertiesJson.includes(mediaToken) || (item.sha256 && inc.propertiesJson.includes(item.id)))) {
                        const updatedProps = inc.propertiesJson
                          .replaceAll(mediaToken, uploadRes.remoteUrl)
                          .replaceAll(item.id, uploadRes.remoteUrl);
                        await db.incidents.update(inc.id, { propertiesJson: updatedProps });
                      }
                    }
                    // 2. Reemplazar en db.outbox_mutations para que la mutación viaje con la ruta relativa del servidor
                    const mutations = await db.outbox_mutations.toArray();
                    for (const m of mutations) {
                      if (m.bodyJson && (m.bodyJson.includes(mediaToken) || (item.id && m.bodyJson.includes(item.id)))) {
                        const updatedBody = m.bodyJson
                          .replaceAll(mediaToken, uploadRes.remoteUrl)
                          .replaceAll(item.id, uploadRes.remoteUrl);
                        await db.outbox_mutations.update(m.id, { bodyJson: updatedBody });
                      }
                    }
                  }

                  if (item.ownerType === 'task_evidence') {
                    await fetch(`${API_BASE}/api/v1/work-tasks/${item.ownerId}/evidences`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.accessToken}`,
                        ...(session.tenantSlug ? { 'X-Tenant': session.tenantSlug } : {}),
                      },
                      body: JSON.stringify({
                        type: 'photo',
                        blobUri: uploadRes.remoteUrl,
                      }),
                    });
                  }
                }
              } catch (mediaErr) {
                console.warn('Sync drain media error:', mediaErr);
              }
            }
          }
        }
      }

      setState((prev) => ({ ...prev, lastSyncAt: Date.now() }));
    } catch (e) {
      setState((prev) => ({ ...prev, lastError: e }));
    } finally {
      setState((prev) => ({ ...prev, isSyncing: false }));
    }
  }, [engine]);

  return { state, drainNow };
}
