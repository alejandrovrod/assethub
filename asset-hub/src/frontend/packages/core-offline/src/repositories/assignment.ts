// assignment.ts — who owns a work item, resolved from its dynamic properties.
//
// The tenant data model does NOT assign work through the `AssignedEmployeeId` column: the
// column is NULL on almost every row while the assignee lives in `propertiesJson`.
//
// Two different roles live in those properties and they must not be confused:
//
//   asignar_a  ("Asignar a")  → the person who EXECUTES the task. This is the assignment.
//   reportar_a ("Reportar a") → the person who FOLLOWS UP. Not an assignment.
//
// Treating the follower as the assignee is what made "Mi Jornada" list work that other
// employees execute: the technician only watches those tasks, they do not do them.

/**
 * Property keys that declare who executes the work, in priority order.
 * `asignado_a` is a legacy spelling found in existing rows.
 */
export const ASSIGNEE_PROPERTY_KEYS = ['asignar_a', 'asignado_a'] as const;

/**
 * Property keys that declare who follows up on the work.
 * These never make a work item appear in the technician's own workload.
 * `reportado_a` and `recibe_a` are legacy spellings.
 */
export const FOLLOW_UP_PROPERTY_KEYS = ['reportar_a', 'reportado_a', 'recibe_a'] as const;

export type PropertyBag = Record<string, unknown>;

/** Parse `propertiesJson` defensively: tenant data contains malformed values. */
export function parseProperties(propertiesJson?: string | null): PropertyBag | undefined {
  if (!propertiesJson) return undefined;
  try {
    const parsed = typeof propertiesJson === 'string' ? JSON.parse(propertiesJson) : propertiesJson;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return parsed as PropertyBag;
  } catch {
    return undefined;
  }
}

function valuesOf(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim());
  }
  return [];
}

function collectIds(props: PropertyBag, keys: readonly string[]): string[] {
  const ids: string[] = [];
  for (const key of keys) {
    for (const id of valuesOf(props[key])) {
      if (!ids.some((existing) => existing.toLowerCase() === id.toLowerCase())) {
        ids.push(id);
      }
    }
  }
  return ids;
}

/** The executor ids declared by the properties, highest priority first. */
export function resolveAssigneeIds(propertiesJson?: string | null): string[] {
  const props = parseProperties(propertiesJson);
  if (!props) return [];
  return collectIds(props, ASSIGNEE_PROPERTY_KEYS);
}

/** The executor declared by the properties, if any. */
export function resolveAssigneeId(propertiesJson?: string | null): string | undefined {
  return resolveAssigneeIds(propertiesJson)[0];
}

/** The follow-up ids declared by the properties, highest priority first. */
export function resolveFollowUpIds(propertiesJson?: string | null): string[] {
  const props = parseProperties(propertiesJson);
  if (!props) return [];
  return collectIds(props, FOLLOW_UP_PROPERTY_KEYS);
}

/**
 * Whether the actor EXECUTES this work item.
 *
 * Only the assignee keys count. A work item where the actor merely appears as follower,
 * as the reporter, or inside any other field is not part of the actor's workload.
 */
export function matchesActorInProperties(
  propertiesJson: string | null | undefined,
  actorIds: Array<string | undefined>,
): boolean {
  const targets = new Set(actorIds.filter((id): id is string => !!id).map((id) => id.toLowerCase()));
  if (targets.size === 0) return false;

  return resolveAssigneeIds(propertiesJson).some((id) => targets.has(id.toLowerCase()));
}
