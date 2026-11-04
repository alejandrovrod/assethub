// useSession.tsx — Shared React context for session management
import React, { useState, useCallback, useEffect, createContext, useContext, useMemo } from 'react';
import { SessionStateMachine, type SessionState } from '../../../auth/session-state';
import { loadSession, saveSession, clearSession, type SessionData } from '../../../auth/session-store';
import { getCachedJwks, cacheJwks } from '../../../auth/offline-lease';
import {
  pullAssets,
  pullDelta,
  pullOrders,
  pullIncidents,
  pullTasks,
  pullMetadata,
  SessionVault,
} from '@asset-hub/core-offline';
import { HttpClient } from '@asset-hub/core-offline';
import { db } from '@asset-hub/core-offline';

export interface UseSessionReturn {
  state: SessionState;
  session: SessionData | null;
  isLoading: boolean;
  login: (email: string, password: string, mfaCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  lock: () => void;
  unlock: (pin: string) => Promise<boolean>;
}

const SessionContext = createContext<UseSessionReturn | null>(null);

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5168';

/**
 * Resolve the employee linked to this user.
 *
 * The field assignment filter matches on `assignedEmployeeId`, so without this id the
 * technician sees an empty "Mi Jornada" even though the tasks are already downloaded.
 * The stored access token is usually expired by the time the app boots, so a 401 must
 * refresh once and retry instead of silently leaving `employeeId` undefined.
 */
async function hydrateEmployeeId(session: SessionData): Promise<string | undefined> {
  const callMe = (token: string) =>
    fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(session.tenantSlug ? { 'X-Tenant': session.tenantSlug } : {}),
      },
    });

  try {
    let res = await callMe(session.accessToken);

    if (res.status === 401 && session.refreshToken) {
      const refresh = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (!refresh.ok) return undefined;

      const data = await refresh.json();
      session.accessToken = data.accessToken;
      if (data.refreshToken) session.refreshToken = data.refreshToken;
      session.expiresAt = Date.now() + (data.expiresIn ?? 900) * 1000;
      await saveSession(session);

      res = await callMe(session.accessToken);
    }

    if (!res.ok) return undefined;
    const me = await res.json();
    return me?.linkedEmployee?.employeeId ?? undefined;
  } catch {
    return undefined;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [machine] = useState(() => new SessionStateMachine('ACTIVE'));
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [state, setState] = useState<SessionState>('ACTIVE');

  useEffect(() => {
    machine.onStateChange(setState);
  }, [machine]);

  // Load session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await loadSession();
        if (stored && !cancelled) {
          // The assignment filter matches on employeeId: without it Mi Jornada is empty.
          // Re-hydrate when it is missing or when the stored token already expired.
          if (navigator.onLine && (!stored.employeeId || !stored.expiresAt || stored.expiresAt <= Date.now())) {
            const employeeId = await hydrateEmployeeId(stored);
            if (employeeId && employeeId !== stored.employeeId) {
              stored.employeeId = employeeId;
              await saveSession(stored);
            }
          }

          setSession(stored);
          try {
            const jwks = getCachedJwks();
            if (jwks && stored.userId) {
              machine.transition('CONNECTION_RESTORED');
            }
          } catch {
            machine.transition('LEASE_EXPIRED');
          }

          // Trigger sync in background
          if (navigator.onLine) {
            try {
              const http = new HttpClient({
                baseUrl: API_BASE,
                getAccessToken: async () => {
                  const s = await loadSession();
                  return s?.accessToken ?? stored.accessToken;
                },
                getTenantSlug: async () => stored.tenantSlug ?? undefined,
                onUnauthorized: async () => {
                  if (!stored.refreshToken) {
                    window.dispatchEvent(new CustomEvent('session:expired'));
                    return;
                  }
                  try {
                    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ refreshToken: stored.refreshToken }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      stored.accessToken = data.accessToken;
                      if (data.refreshToken) stored.refreshToken = data.refreshToken;
                      stored.expiresAt = Date.now() + (data.expiresIn ?? 900) * 1000;
                      await saveSession(stored);
                      setSession({ ...stored });
                    } else {
                      window.dispatchEvent(new CustomEvent('session:expired'));
                    }
                  } catch {
                    // Ignore
                  }
                },
              });
              // Pull tasks first so the technician has their immediate work ready
              await pullTasks(db, http, stored.tenantSlug ?? 'default').catch(() => {});
              await pullOrders(db, http, stored.tenantSlug ?? 'default').catch(() => {});
              await pullIncidents(db, http, stored.tenantSlug ?? 'default').catch(() => {});
              await pullMetadata(db, http, stored.tenantSlug ?? 'default').catch(() => {});
              await pullAssets(db, http, stored.tenantSlug ?? 'default').catch(() => {});
            } catch {
              // Ignore
            }
          }
        }
      } catch (err) {
        console.error('Failed to load session:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [machine]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      const vault = new SessionVault(db);
      await vault.purgeAllTenantData();
      await clearSession();
      setSession(null);
      machine.transition('LOGOUT');
    } finally {
      setIsLoading(false);
    }
  }, [machine]);

  // Listener global para auto-logout cuando el refresh token falla o expira
  useEffect(() => {
    const handleExpired = () => {
      logout();
    };
    window.addEventListener('session:expired', handleExpired);
    return () => {
      window.removeEventListener('session:expired', handleExpired);
    };
  }, [logout]);

  const login = useCallback(
    async (email: string, password: string, mfaCode?: string) => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, mfaCode }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail ?? err.title ?? 'Login failed');
        }

        const data = await res.json();

        // Extract userId from JWT
        let userId = '';
        try {
          const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
          userId = payload.sub ?? payload.nameid ?? '';
        } catch {
          // Ignore
        }

        let employeeId: string | undefined;
        try {
          const meRes = await fetch(`${API_BASE}/api/v1/auth/me`, {
            headers: {
              Authorization: `Bearer ${data.accessToken}`,
              ...(data.tenantSlug ? { 'X-Tenant': data.tenantSlug } : {}),
            },
          });
          if (meRes.ok) {
            const meData = await meRes.json();
            if (meData.linkedEmployee?.employeeId) {
              employeeId = meData.linkedEmployee.employeeId;
            }
          }
        } catch {
          // Ignore
        }

        const sessionData: SessionData = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tenantSlug: data.tenantSlug,
          tenantName: data.tenantName,
          roles: data.roles,
          permissions: data.permissions,
          userId,
          employeeId,
          expiresAt: Date.now() + (data.expiresIn ?? 3600) * 1000,
        };

        // Request offline lease
        try {
          const leaseRes = await fetch(`${API_BASE}/api/v1/auth/offline-lease`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${data.accessToken}`,
            },
            body: JSON.stringify({ deviceId: crypto.randomUUID() }),
          });

          if (leaseRes.ok) {
            const leaseData = await leaseRes.json();
            if (leaseData.jwks) {
              cacheJwks(leaseData.jwks);
            }
          }
        } catch {
          // Lease is optional — continue without it
        }

        // Trigger initial sync after login before transitioning
        try {
          const http = new HttpClient({
            baseUrl: API_BASE,
            getAccessToken: async () => sessionData.accessToken,
            getTenantSlug: async () => sessionData.tenantSlug ?? undefined,
          });
          // Pull tasks and metadata first so the technician has their immediate work ready
          await pullTasks(db, http, sessionData.tenantSlug ?? 'default');
          await pullMetadata(db, http, sessionData.tenantSlug ?? 'default');
          await pullOrders(db, http, sessionData.tenantSlug ?? 'default');
          await pullIncidents(db, http, sessionData.tenantSlug ?? 'default');
          // Assets and delta are secondary; run in background so login doesn't freeze
          pullAssets(db, http, sessionData.tenantSlug ?? 'default').catch(() => {});
          for (const resource of ['tasks', 'incidents', 'stock'] as const) {
            const extra = resource === 'tasks' ? { assignedToMe: 'true' } : undefined;
            pullDelta(resource, db, http, extra).catch(() => {});
          }
        } catch (syncErr) {
          console.warn('Initial sync warning:', syncErr);
        }
        await saveSession(sessionData);
        setSession(sessionData);
        machine.transition('CONNECTION_RESTORED');
      } finally {
        setIsLoading(false);
      }
    },
    [machine],
  );

  const lock = useCallback(() => {
    machine.transition('PIN_REQUIRED');
  }, [machine]);

  const unlock = useCallback(
    async (_pin: string): Promise<boolean> => {
      machine.transition('PIN_VERIFIED');
      return true;
    },
    [machine],
  );

  const value = useMemo<UseSessionReturn>(
    () => ({
      state,
      session,
      isLoading,
      login,
      logout,
      lock,
      unlock,
    }),
    [state, session, isLoading, login, logout, lock, unlock],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): UseSessionReturn {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

