// tasks.$taskId.tsx — Work Task Detail screen with tabs, lock checks, evidences, comments and offline propagation
import { useState, useEffect, useRef } from 'react';
import {
  Clock,
  MapPin,
  Calendar,
  AlertTriangle,
  FileText,
  History,
  MessageSquare,
  ClipboardCheck,
  Send,
  Loader2,
  ArrowRight,
  Trash2,
} from 'lucide-react';
import { useTask } from '../features/tasks/hooks/useTasks';
import { TaskTransitionSheet } from '../features/tasks/components/TaskTransitionSheet';
import { ChecklistForm } from '../features/tasks/components/ChecklistForm';
import { PropagatedPropertiesDisplay } from '../shared/components/PropagatedPropertiesDisplay';
import { EvidenceCapture } from '../shared/components/EvidenceCapture';
import { uploadMedia } from '../media/uploader';
import { loadSession } from '../auth/session-store';
import {
  db,
  TaskRepository,
  updateTaskProperties,
  enqueueOrCoalesce,
  sha256,
} from '@asset-hub/core-offline';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5168';

/** Server-side evidence ids are GUIDs; local ones are media_queue ids and never hit the API. */
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface EvidenceItem {
  id?: string;
  blobUri: string;
  type: string;
  isLocal?: boolean;
  sha256?: string;
}

export const STATE_LABELS: Record<string, string> = {
  draft: 'Borrador',
  todo: 'Por hacer',
  ready: 'Por hacer',
  in_progress: 'En progreso',
  paused: 'Pausada',
  done: 'Completada',
  verified: 'Verificada',
  cancelled: 'Cancelada',
  rework: 'Re-trabajo',
};

export interface HistoryEntry {
  id: string;
  fromState?: string;
  toState: string;
  changedAt: string;
  changedByName?: string | null;
  action?: string;
  reason?: string;
  geo?: { latitude: number; longitude: number; status: string };
  isLocal?: boolean;
}

interface TaskDetailPageProps {
  taskId: string;
  onNavigateOrder?: (orderId: string) => void;
  onNavigateIncident?: (incidentId: string) => void;
  onNavigateAsset?: (assetId: string) => void;
}

export function TaskDetailPage({
  taskId,
  onNavigateOrder,
  onNavigateIncident,
  onNavigateAsset,
}: TaskDetailPageProps) {
  const { task, isLoading } = useTask(taskId);
  const [tab, setTab] = useState<'details' | 'checklist' | 'history' | 'comments'>('details');
  const [showTransition, setShowTransition] = useState(false);

  // Evidences (persisted in Dexie task.evidencesJson and db.media_queue)
  const [evidences, setEvidences] = useState<EvidenceItem[]>([]);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const inFlightUploadsRef = useRef(new Set<string>());

  // History (persisted in Dexie task.historyJson and synced from server)
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Comments
  const [comments, setComments] = useState<
    Array<{ id: string; text: string; createdAt?: string; createdByName?: string }>
  >([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);

  // Load initial comments from task.commentsJson or API
  useEffect(() => {
    let cancelled = false;
    if (task?.commentsJson) {
      try {
        const parsed = JSON.parse(task.commentsJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setComments(parsed);
        }
      } catch {
        // Ignore
      }
    }

    if (navigator.onLine && taskId) {
      setIsLoadingComments(true);
      (async () => {
        try {
          const session = await loadSession();
          const res = await fetch(`${API_BASE}/api/v1/work-tasks/${taskId}/comments`, {
            headers: {
              ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
              ...(session?.tenantSlug ? { 'X-Tenant': session.tenantSlug } : {}),
            },
          });
          if (res.ok && !cancelled) {
            const data = await res.json();
            const items = Array.isArray(data?.items) ? data.items : [];
            setComments(items);
            const serialized = JSON.stringify(items);
            if (task?.commentsJson !== serialized) {
              await db.tasks.update(taskId, { commentsJson: serialized });
            }
          }
        } catch {
          // Offline fallback
        } finally {
          if (!cancelled) setIsLoadingComments(false);
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // Load existing evidences from Dexie (IndexedDB) and sync with API
  useEffect(() => {
    let cancelled = false;

    async function loadEvidences() {
      const localMap = new Map<string, EvidenceItem>();

      // 1. Load from task cached in IndexedDB
      try {
        const cachedTask = await db.tasks.get(taskId);
        if (cachedTask?.evidencesJson) {
          const parsed = JSON.parse(cachedTask.evidencesJson);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const key = item.id || item.blobUri;
              if (key) localMap.set(key, item);
            }
          }
        }
      } catch {
        // Ignore
      }

      // 2. Also load from Dexie media_queue for this task
      try {
        const queuedMedia = await db.media_queue
          .where('[ownerType+ownerId]')
          .equals(['task_evidence', taskId])
          .toArray();

        for (const item of queuedMedia) {
          const displayUri = item.remoteUrl || (item.blob ? URL.createObjectURL(item.blob) : '');
          if (displayUri) {
            const hasMatch = Array.from(localMap.values()).some(
              (e) => (item.remoteUrl && e.blobUri === item.remoteUrl) || (item.id && e.id === item.id)
            );
            if (!hasMatch) {
              localMap.set(item.id, {
                id: item.id,
                blobUri: displayUri,
                type: 'photo',
                isLocal: !item.remoteUrl,
                sha256: item.sha256,
              });
            }
          }
        }
      } catch {
        // Ignore
      }

      const initialList = Array.from(localMap.values());
      if (!cancelled && initialList.length > 0) {
        setEvidences(initialList);
      }

      // 3. Reconcile with server if online
      if (navigator.onLine && taskId) {
        try {
          const session = await loadSession();
          let serverItems: any[] = [];
          const res = await fetch(`${API_BASE}/api/v1/work-tasks/${taskId}/evidences`, {
            headers: {
              ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
              ...(session?.tenantSlug ? { 'X-Tenant': session.tenantSlug } : {}),
            },
          });
          if (res.ok && !cancelled) {
            const data = await res.json();
            serverItems = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
            
            for (const s of serverItems) {
              const key = s.id || s.blobUri;
              if (key) {
                const match = Array.from(localMap.entries()).find(
                  ([_, v]) => v.blobUri === s.blobUri || v.id === s.id
                );
                if (match) {
                  localMap.delete(match[0]);
                }
                localMap.set(key, { ...s, isLocal: false });
              }
            }
            const merged = Array.from(localMap.values());
            setEvidences(merged);
            await db.tasks.update(taskId, {
              evidencesJson: JSON.stringify(merged),
            });
          }

          // 4. Automatically push any unconfirmed local evidences to the server
          if (session?.accessToken) {
            const unconfirmed = Array.from(localMap.values()).filter(
              (e) => e.isLocal && !serverItems.some((s: any) => s.id === e.id || (s.blobUri && s.blobUri === e.blobUri))
            );
            for (const item of unconfirmed) {
              let remoteUrl = item.blobUri?.startsWith('http') ? item.blobUri : undefined;
              if (!remoteUrl) {
                const queued = (item.id ? await db.media_queue.get(item.id) : null)
                  ?? (await db.media_queue
                    .where('[ownerType+ownerId]')
                    .equals(['task_evidence', taskId])
                    .toArray())[0];
                if (queued?.remoteUrl) {
                  remoteUrl = queued.remoteUrl;
                } else if (queued?.blob) {
                  const uploadRes = await uploadMedia(
                    db,
                    queued.blob,
                    task?.tenantId ?? '',
                    'task_evidence',
                    taskId,
                    'task_photo',
                    API_BASE,
                    session.accessToken,
                  );
                  remoteUrl = uploadRes.remoteUrl;
                }
              }
              if (remoteUrl) {
                // If this blobUri already exists in serverItems, mark local item as synced without POSTing again
                const alreadyOnServer = serverItems.find((s: any) => s.blobUri === remoteUrl);
                if (alreadyOnServer) {
                  const serverId = alreadyOnServer.id ?? item.id;
                  localMap.set(serverId, {
                    id: serverId,
                    blobUri: remoteUrl,
                    type: item.type || 'photo',
                    isLocal: false,
                  });
                  if (item.id && item.id !== serverId) {
                    localMap.delete(item.id);
                  }
                  continue;
                }

                // Guard against concurrent in-flight uploads of the same evidence
                if (inFlightUploadsRef.current.has(remoteUrl)) {
                  continue;
                }
                inFlightUploadsRef.current.add(remoteUrl);

                try {
                  const postRes = await fetch(`${API_BASE}/api/v1/work-tasks/${taskId}/evidences`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${session.accessToken}`,
                      ...(session.tenantSlug ? { 'X-Tenant': session.tenantSlug } : {}),
                    },
                    body: JSON.stringify({
                      type: item.type || 'photo',
                      blobUri: remoteUrl,
                    }),
                  });
                  if (postRes.ok) {
                    const created = await postRes.json();
                    const serverId = created?.id ?? item.id;
                    localMap.set(serverId, {
                      id: serverId,
                      blobUri: remoteUrl,
                      type: item.type || 'photo',
                      isLocal: false,
                    });
                    if (item.id && item.id !== serverId) {
                      localMap.delete(item.id);
                    }
                  } else {
                    console.error('Evidence sync error:', postRes.status, await postRes.text());
                  }
                } finally {
                  inFlightUploadsRef.current.delete(remoteUrl);
                }
              }
            }
            const syncedList = Array.from(localMap.values());
            setEvidences(syncedList);
            await db.tasks.update(taskId, {
              evidencesJson: JSON.stringify(syncedList),
            });
          }
        } catch {
          // Keep local evidences intact
        }
      }
    }

    loadEvidences();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // Load and sync history (from Dexie cache + server API)
  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      // 1. Initial load from local IndexedDB
      let localEntries: HistoryEntry[] = [];
      try {
        const cachedTask = await db.tasks.get(taskId);
        if (cachedTask?.historyJson) {
          const parsed = JSON.parse(cachedTask.historyJson);
          if (Array.isArray(parsed)) {
            localEntries = parsed.map((item: any, idx: number) => ({
              id: item.id || `local-${idx}`,
              fromState: item.fromState,
              toState: item.toState,
              changedAt: item.changedAt || item.timestampIso || new Date().toISOString(),
              changedByName: item.changedByName,
              action: item.action,
              reason: item.reason,
              geo: item.geo,
              isLocal: !!item.isLocal || (!item.id && !!item.timestampIso),
            }));
          }
        }
      } catch {
        // Ignore parsing errors
      }

      if (!cancelled && localEntries.length > 0) {
        setHistory(localEntries);
      }

      // 2. Fetch server history if online
      if (navigator.onLine && taskId) {
        setIsLoadingHistory(true);
        try {
          const session = await loadSession();
          const res = await fetch(`${API_BASE}/api/v1/work-tasks/${taskId}/history`, {
            headers: {
              ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
              ...(session?.tenantSlug ? { 'X-Tenant': session.tenantSlug } : {}),
            },
          });
          if (res.ok && !cancelled) {
            const data = await res.json();
            const serverItems: any[] = Array.isArray(data)
              ? data
              : Array.isArray(data?.items)
              ? data.items
              : [];

            const formattedServerItems: HistoryEntry[] = serverItems.map((s) => ({
              id: s.id,
              fromState: s.fromState,
              toState: s.toState,
              changedAt: s.changedAt,
              changedByName: s.changedByName,
              isLocal: false,
            }));

            // Retain un-synced local transitions that don't match any server transition
            const unSyncedLocal = localEntries.filter((loc) => {
              if (!loc.isLocal) return false;
              const locTime = new Date(loc.changedAt).getTime();
              return !formattedServerItems.some(
                (srv) =>
                  srv.toState === loc.toState &&
                  Math.abs(new Date(srv.changedAt).getTime() - locTime) < 60_000,
              );
            });

            const merged = [...unSyncedLocal, ...formattedServerItems].sort(
              (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
            );

            setHistory(merged);
            await db.tasks.update(taskId, {
              historyJson: JSON.stringify(merged),
            });
          }
        } catch {
          // Keep local fallback
        } finally {
          if (!cancelled) setIsLoadingHistory(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [taskId, historyRefreshKey]);

  // Send new comment
  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCommentText.trim();
    if (!trimmed || isSendingComment || !task) return;

    setIsSendingComment(true);
    const session = await loadSession();
    const optimisticComment = {
      id: crypto.randomUUID(),
      text: trimmed,
      createdAt: new Date().toISOString(),
      createdByName: session?.tenantName ?? 'Técnico',
    };

    const nextComments = [optimisticComment, ...comments];
    setComments(nextComments);
    setNewCommentText('');

    try {
      await db.tasks.update(taskId, { commentsJson: JSON.stringify(nextComments) });
      if (navigator.onLine && session?.accessToken) {
        await fetch(`${API_BASE}/api/v1/work-tasks/${taskId}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
            ...(session.tenantSlug ? { 'X-Tenant': session.tenantSlug } : {}),
          },
          body: JSON.stringify({ text: trimmed }),
        });
      } else {
        await db.transaction('rw', [db.outbox_mutations], async (tx) => {
          await enqueueOrCoalesce(tx, {
            aggregateType: 'task',
            aggregateId: taskId,
            tenantId: task.tenantId,
            operation: 'task.comment',
            path: `/api/v1/work-tasks/${taskId}/comments`,
            method: 'POST',
            bodyJson: JSON.stringify({ text: trimmed }),
            status: 'pending',
            priority: 50,
          });
        });
      }
    } catch (err) {
      console.warn('Failed to post comment:', err);
    } finally {
      setIsSendingComment(false);
    }
  };

  // Capture and upload evidence
  const handleCaptureEvidence = async (file: File) => {
    if (!task || isUploadingEvidence) return;
    setIsUploadingEvidence(true);
    const localUrl = URL.createObjectURL(file);
    const tempId = crypto.randomUUID();

    try {
      const hash = await sha256(file);

      // Check if media already exists in Dexie media_queue
      let mediaItem = await db.media_queue.where('sha256').equals(hash).first();
      const mediaId = mediaItem?.id ?? tempId;

      if (!mediaItem) {
        try {
          await db.media_queue.add({
            id: mediaId,
            tenantId: task.tenantId,
            ownerType: 'task_evidence',
            ownerId: task.id,
            purpose: 'task_photo',
            blob: file,
            mimeType: file.type || 'image/jpeg',
            bytes: file.size,
            sha256: hash,
            status: 'pending',
            attempts: 0,
            nextAttemptAtMs: 0,
            createdAtMs: Date.now(),
          } as any);
        } catch {
          mediaItem = await db.media_queue.where('sha256').equals(hash).first();
        }
      }

      const displayUri = mediaItem?.remoteUrl || localUrl;
      const optimisticEvidence = {
        id: mediaId,
        blobUri: displayUri,
        type: 'photo',
        isLocal: !mediaItem?.remoteUrl,
        sha256: hash,
      };

      // 1. Immediately store in Dexie task.evidencesJson and state so it survives refresh & sync
      const currentFiltered = evidences.filter((e) => e.id !== mediaId && e.blobUri !== displayUri);
      const nextEvidences = [optimisticEvidence, ...currentFiltered];
      setEvidences(nextEvidences);
      await db.tasks.update(taskId, {
        evidencesJson: JSON.stringify(nextEvidences),
      });

      // 2. Upload to server if online
      const session = await loadSession();
      if (navigator.onLine && session?.accessToken) {
        let remoteUrl = mediaItem?.remoteUrl;
        if (!remoteUrl) {
          const uploadRes = await uploadMedia(
            db,
            file,
            task.tenantId,
            'task_evidence',
            task.id,
            'task_photo',
            API_BASE,
            session.accessToken,
          );
          remoteUrl = uploadRes.remoteUrl;
        }

        if (remoteUrl) {
          if (inFlightUploadsRef.current.has(remoteUrl)) {
            return;
          }
          inFlightUploadsRef.current.add(remoteUrl);

          try {
            const postRes = await fetch(`${API_BASE}/api/v1/work-tasks/${taskId}/evidences`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.accessToken}`,
                ...(session.tenantSlug ? { 'X-Tenant': session.tenantSlug } : {}),
              },
              body: JSON.stringify({
                type: 'photo',
                blobUri: remoteUrl,
              }),
            });

            if (postRes.ok) {
              const created = await postRes.json();
              const serverId = created?.id ?? mediaId;
              const finalized = nextEvidences.map((e) =>
                e.id === mediaId ? { ...e, id: serverId, blobUri: remoteUrl!, isLocal: false } : e
              );
              setEvidences(finalized);
              await db.tasks.update(taskId, {
                evidencesJson: JSON.stringify(finalized),
              });
              await db.media_queue.where('sha256').equals(hash).modify({
                status: 'uploaded',
                remoteUrl,
              });
            }
          } finally {
            inFlightUploadsRef.current.delete(remoteUrl);
          }
        }
      }
    } catch (err) {
      console.warn('Evidence capture saved locally, remote upload error:', err);
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <p className="text-muted-foreground">Tarea no encontrada en la base local</p>
      </div>
    );
  }

  const repo = new TaskRepository(db);
  const allowedTransitions = repo.getAllowedTransitions(task);
  const isStateBlocked = repo.isStateChangeBlocked(task);
  const isEditBlocked = repo.isEditBlocked(task);

  /**
   * Delete an evidence. Local-first: the technician may be offline and must see the photo
   * disappear immediately. The server copy (if any) is removed online, or queued in the
   * outbox for the next drain.
   */
  const handleDeleteEvidence = async (evidence: EvidenceItem) => {
    if (isEditBlocked) return;
    if (!window.confirm('¿Eliminar esta evidencia? Esta acción no se puede deshacer.')) return;

    try {
      // 1. Drop it from the local snapshot so the UI reacts immediately.
      const nextEvidences = evidences.filter(
        (e) => !(evidence.id && e.id === evidence.id) && e.blobUri !== evidence.blobUri,
      );
      setEvidences(nextEvidences);
      await db.tasks.update(taskId, { evidencesJson: JSON.stringify(nextEvidences) });

      // 2. Drop the queued media so the Sync Center stops offering to upload it.
      //    `media_queue` is indexed by [ownerType+ownerId]; matching by id/sha256/remoteUrl
      //    afterwards covers the three ways an evidence can be linked to its media row.
      const queuedForTask = await db.media_queue
        .where('[ownerType+ownerId]')
        .equals(['task_evidence', taskId])
        .toArray();

      const queuedIds = queuedForTask
        .filter(
          (m) =>
            (!!evidence.id && m.id === evidence.id) ||
            (!!evidence.sha256 && m.sha256 === evidence.sha256) ||
            (!!evidence.blobUri && m.remoteUrl === evidence.blobUri),
        )
        .map((m) => m.id);

      if (queuedIds.length > 0) {
        await db.media_queue.bulkDelete(queuedIds);
      }

      // 3. Only evidences that already exist on the server need a remote DELETE.
      const serverId = evidence.isLocal ? undefined : evidence.id;
      if (!serverId || !GUID_RE.test(serverId)) return;

      const path = `/api/v1/work-tasks/${taskId}/evidences/${serverId}`;
      const session = await loadSession();

      if (navigator.onLine && session?.accessToken) {
        try {
          const res = await fetch(`${API_BASE}${path}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              ...(session.tenantSlug ? { 'X-Tenant': session.tenantSlug } : {}),
            },
          });

          // 204 is the happy path; 404 means the server already lost it, which is fine.
          if (res.ok || res.status === 404) return;

          if (res.status < 500) {
            // 4xx is a business rule (e.g. the task was closed): retrying won't help.
            console.warn('Evidence delete rejected by server:', res.status, await res.text());
            return;
          }
        } catch {
          // Network died mid-request: fall through and queue it.
        }
      }

      await db.transaction('rw', [db.outbox_mutations], async (tx) => {
        await enqueueOrCoalesce(tx, {
          aggregateType: 'task',
          aggregateId: taskId,
          tenantId: task.tenantId,
          operation: 'task.evidence.delete',
          path,
          method: 'DELETE',
          status: 'pending',
          priority: 100,
        });
      });
    } catch (err) {
      console.warn('Failed to delete evidence:', err);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background pb-20">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3">
        {task.state === 'rework' && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <span className="font-bold">Tarea Devuelta para Corrección:</span>{' '}
            {task.reworkReason || 'Verifique el trabajo realizado'}
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-foreground">{task.title}</h1>
            {task.assetName && (
              <button
                onClick={() => task.assetId && onNavigateAsset && onNavigateAsset(task.assetId)}
                className="mt-0.5 text-xs font-medium text-primary hover:underline"
              >
                Activo: {task.assetName} {task.assetCode ? `(${task.assetCode})` : ''}
              </button>
            )}
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold uppercase text-foreground">
            {task.state}
          </span>
        </div>

        {/* Related links */}
        <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
          {task.maintenanceOrderId && (
            <button
              onClick={() => onNavigateOrder && onNavigateOrder(task.maintenanceOrderId!)}
              className="rounded-md border bg-muted/50 px-2 py-1 text-muted-foreground hover:text-foreground"
            >
              OT: {task.maintenanceOrderTitle || task.maintenanceOrderId.slice(0, 8)}
              {task.maintenanceOrderState ? ` (${task.maintenanceOrderState})` : ''}
            </button>
          )}

          {task.incidentId && (
            <button
              onClick={() => onNavigateIncident && onNavigateIncident(task.incidentId!)}
              className="rounded-md border bg-destructive/10 px-2 py-1 text-destructive hover:bg-destructive/20"
            >
              Incidencia vinculada
            </button>
          )}
        </div>

        {/* Order state lock warning */}
        {isStateBlocked && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/15 p-2.5 text-xs text-amber-800 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Orden de trabajo en "{task.maintenanceOrderState}". Inicie la OT para habilitar
              transiciones.
            </span>
          </div>
        )}
      </header>

      {/* Tabs */}
      <nav className="flex border-b bg-card">
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

        {task.checklistSchemaJson && (
          <button
            onClick={() => setTab('checklist')}
            className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 ${
              tab === 'checklist'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground'
            }`}
          >
            <ClipboardCheck className="h-4 w-4" />
            Checklist
          </button>
        )}

        <button
          onClick={() => setTab('history')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 ${
            tab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground'
          }`}
        >
          <History className="h-4 w-4" />
          Historial
        </button>

        <button
          onClick={() => setTab('comments')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-semibold border-b-2 ${
            tab === 'comments'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Comentarios
        </button>
      </nav>

      {/* Tab content */}
      <main className="flex-1 p-4">
        {tab === 'details' && (
          <div className="space-y-4">
            {task.description && (
              <div className="rounded-xl border bg-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Descripción
                </h3>
                <p className="mt-1.5 text-sm">{task.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border bg-card p-3">
                <span className="text-muted-foreground">Prioridad</span>
                <p className="mt-1 font-bold capitalize">{task.priority}</p>
              </div>

              {task.dueAtMs > 0 && (
                <div className="rounded-xl border bg-card p-3">
                  <span className="text-muted-foreground">Vencimiento</span>
                  <p className="mt-1 flex items-center gap-1 font-semibold">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {new Date(task.dueAtMs).toLocaleDateString()}
                  </p>
                </div>
              )}

              {task.startedAtLocalIso && (
                <div className="rounded-xl border bg-card p-3">
                  <span className="text-muted-foreground">Iniciada</span>
                  <p className="mt-1 flex items-center gap-1 font-semibold">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {new Date(task.startedAtLocalIso).toLocaleTimeString()}
                  </p>
                </div>
              )}

              {task.completedAtLocalIso && (
                <div className="rounded-xl border bg-card p-3">
                  <span className="text-muted-foreground">Completada</span>
                  <p className="mt-1 flex items-center gap-1 font-semibold">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {new Date(task.completedAtLocalIso).toLocaleTimeString()}
                  </p>
                </div>
              )}
            </div>

            {/* Propagated Dynamic Properties */}
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Propiedades Dinámicas Propagadas
              </h3>
              <PropagatedPropertiesDisplay
                key={task.id}
                ctx={{
                  tenantId: task.tenantId,
                  assetId: task.assetId,
                  workflowTemplateId: task.workflowTemplateId,
                  incidentId: task.incidentId,
                  maintenanceOrderId: task.maintenanceOrderId,
                }}
                localPropertiesJson={task.propertiesJson}
                isReadOnly={isEditBlocked}
                onSave={async (newProperties) => {
                  await updateTaskProperties(db, task.id, newProperties);
                }}
              />
            </div>

            {/* Evidencias Técnicas */}
            <div className="rounded-xl border bg-card p-4">
              <EvidenceCapture
                onCapture={handleCaptureEvidence}
                currentCount={evidences.length}
                maxFiles={10}
                isUploading={isUploadingEvidence}
                disabled={isEditBlocked}
              />

              {evidences.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {evidences.map((ev, idx) => (
                    <div
                      key={ev.id ?? idx}
                      className="group relative aspect-square overflow-hidden rounded-lg border bg-muted/20 shadow-sm"
                    >
                      <a
                        href={ev.blobUri}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-full w-full"
                      >
                        <img
                          src={ev.blobUri}
                          alt={`Evidencia ${idx + 1}`}
                          onError={async (e) => {
                            const target = e.currentTarget;
                            try {
                              const queued = await db.media_queue
                                .where('[ownerType+ownerId]')
                                .equals(['task_evidence', taskId])
                                .toArray();
                              const match =
                                queued.find((q) => q.remoteUrl === ev.blobUri || q.id === ev.id) ||
                                queued[idx];
                              if (match?.blob) {
                                target.src = URL.createObjectURL(match.blob);
                              }
                            } catch {
                              // ignore
                            }
                          }}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      </a>
                      {!isEditBlocked && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteEvidence(ev)}
                          className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white shadow-sm transition-colors hover:bg-destructive"
                          title="Eliminar evidencia"
                          aria-label="Eliminar evidencia"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  No hay fotos de evidencia registradas.
                </p>
              )}
            </div>
          </div>
        )}

        {tab === 'checklist' && task.checklistSchemaJson && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Formulario de Verificación
            </h3>
            <ChecklistForm
              taskId={task.id}
              schemaJson={task.checklistSchemaJson}
              uiSchemaJson={task.checklistUiSchemaJson}
              draftJson={task.checklistDraftJson}
              responseJson={task.checklistResponseJson}
              isReadOnly={task.state === 'done' || task.state === 'cancelled'}
            />
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Historial de Estados
            </h3>
            {isLoadingHistory ? (
              <div className="rounded-xl border bg-card p-6 text-center text-xs text-muted-foreground">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                Cargando historial…
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-xl border bg-card p-6 text-center text-xs text-muted-foreground">
                <History className="mx-auto mb-2 h-6 w-6 opacity-40" />
                No hay transiciones registradas aún.
              </div>
            ) : (
              <div className="relative space-y-4 pl-2 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                {history.map((item) => (
                  <div key={item.id} className="relative flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted">
                      <History className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                        {item.fromState && (
                          <span className="inline-flex items-center rounded-md border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground">
                            {STATE_LABELS[item.fromState] || item.fromState}
                          </span>
                        )}
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="inline-flex items-center rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                          {STATE_LABELS[item.toState] || item.toState}
                        </span>
                        {item.isLocal && (
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                            Local (offline)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(item.changedAt).toLocaleString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {item.changedByName && ` · ${item.changedByName}`}
                      </div>
                      {item.reason && (
                        <p className="mt-1 text-[11px] text-muted-foreground">Motivo: {item.reason}</p>
                      )}
                      {item.geo && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>
                            Lat: {item.geo.latitude.toFixed(4)}, Lon: {item.geo.longitude.toFixed(4)} ({item.geo.status})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'comments' && (
          <div className="space-y-4">
            {/* New Comment Input */}
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Agregar Comentario
              </h3>
              <form onSubmit={handleSendComment} className="space-y-2">
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Escriba una observación o comentario técnico..."
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background p-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={isSendingComment || !newCommentText.trim()}
                  className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-xs font-bold text-primary-foreground disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {isSendingComment ? 'Enviando…' : 'Publicar Comentario'}
                </button>
              </form>
            </div>

            {/* Comments List */}
            <div className="space-y-2">
              {isLoadingComments ? (
                <div className="rounded-xl border bg-card p-6 text-center text-xs text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  Cargando comentarios…
                </div>
              ) : comments.length === 0 ? (
                <div className="rounded-xl border bg-card p-6 text-center text-xs text-muted-foreground">
                  <MessageSquare className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  No hay comentarios registrados para esta tarea.
                </div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="rounded-xl border bg-card p-3.5 text-xs shadow-xs">
                    <div className="mb-1 flex items-center justify-between text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {comment.createdByName || 'Técnico'}
                      </span>
                      <span>
                        {comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ''}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{comment.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Fixed Bottom Action Bar (56 px touch targets) */}
      <footer className="fixed bottom-0 left-0 right-0 border-t bg-card/95 p-3 backdrop-blur-xs">
        <button
          onClick={() => setShowTransition(true)}
          disabled={allowedTransitions.length === 0}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-md transition-transform active:scale-98 disabled:opacity-50"
        >
          {isStateBlocked
            ? 'Transición Bloqueada por OT'
            : allowedTransitions.length === 0
            ? 'Sin transiciones disponibles'
            : 'Cambiar Estado de Tarea'}
        </button>
      </footer>

      {showTransition && (
        <TaskTransitionSheet
          taskId={task.id}
          currentState={task.state}
          allowedTransitions={allowedTransitions}
          maintenanceOrderState={task.maintenanceOrderState}
          onClose={() => setShowTransition(false)}
          onTransitioned={() => {
            setHistoryRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
