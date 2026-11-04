// telemetry.ts — Local telemetry log (sync:log, 500 events max)
const STORAGE_KEY = 'field-pwa-telemetry';
const MAX_EVENTS = 500;

export interface TelemetryEvent {
  type: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export function logEvent(type: string, data?: Record<string, unknown>): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const events: TelemetryEvent[] = raw ? JSON.parse(raw) : [];
    events.push({ type, timestamp: Date.now(), data });
    // Keep only last MAX_EVENTS
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Ignore storage errors
  }
}

export function getEvents(): TelemetryEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearEvents(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function getEventCounts(): Record<string, number> {
  const events = getEvents();
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  return counts;
}
