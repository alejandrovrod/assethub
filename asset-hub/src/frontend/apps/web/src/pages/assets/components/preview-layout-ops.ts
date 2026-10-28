/**
 * preview-layout-ops.ts
 *
 * Pure, surgical helpers to reorder tabs / sections / fields inside an asset
 * template JSON-Schema (schemaJson) WITHOUT touching anything else
 * (dependencies, validationRules, required, formats, ...).
 *
 * Field order = insertion order of `schema.properties` keys.
 * Tab order   = `x-form-tabs` metadata, then first appearance in properties.
 * Section order (per tab) = `x-form-sections[tab]` metadata, then appearance.
 */

export const DEFAULT_TAB_LABEL = 'General';

/** Destination index inside a group. -1 means "append at the end". */
export type GroupIndex = number;

const clean = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

export function tabOf(prop: unknown): string {
  return clean((prop as Record<string, unknown> | null)?.tab) ?? DEFAULT_TAB_LABEL;
}

export function sectionOf(prop: unknown): string | undefined {
  return clean((prop as Record<string, unknown> | null)?.section);
}

export interface LayoutFieldRef {
  key: string;
  tab: string;
  section?: string;
}

export interface LayoutModel {
  tabs: string[];
  sectionsByTab: Record<string, string[]>;
  /** Property keys in schema.properties insertion order. */
  fieldsInOrder: LayoutFieldRef[];
}

function pushUnique(list: string[], value: string): void {
  const v = (value || '').trim();
  if (v && !list.includes(v)) list.push(v);
}

/** Ordered tab labels for an already-parsed schema object. */
export function orderedTabs(schema: Record<string, unknown>): string[] {
  const tabs: string[] = [];
  const raw = schema['x-form-tabs'];
  if (Array.isArray(raw)) raw.forEach((t: unknown) => { if (typeof t === 'string') pushUnique(tabs, t); });
  const props = (schema.properties ?? {}) as Record<string, unknown>;
  Object.keys(props).forEach((k) => pushUnique(tabs, tabOf(props[k])));
  if (tabs.length === 0) tabs.push(DEFAULT_TAB_LABEL);
  return tabs;
}

/** Ordered section labels of a tab for an already-parsed schema object. */
export function orderedSections(schema: Record<string, unknown>, tab: string): string[] {
  const sections: string[] = [];
  const xSec = schema['x-form-sections'];
  if (xSec && typeof xSec === 'object') {
    const list = (xSec as Record<string, unknown>)[tab];
    if (Array.isArray(list)) list.forEach((s: unknown) => { if (typeof s === 'string') pushUnique(sections, s); });
  }
  const props = (schema.properties ?? {}) as Record<string, unknown>;
  Object.keys(props).forEach((k) => {
    if (tabOf(props[k]) === tab) {
      const s = sectionOf(props[k]);
      if (s) pushUnique(sections, s);
    }
  });
  return sections;
}

export function parseLayoutModel(schemaJson: string): LayoutModel | null {
  try {
    const schema = JSON.parse(schemaJson || '{}') as Record<string, unknown>;
    if (!schema || typeof schema !== 'object') return null;
    if (!schema.properties || typeof schema.properties !== 'object') {
      return { tabs: orderedTabs(schema), sectionsByTab: {}, fieldsInOrder: [] };
    }
    const props = schema.properties as Record<string, unknown>;
    const fieldsInOrder: LayoutFieldRef[] = Object.keys(props).map((key) => ({
      key,
      tab: tabOf(props[key]),
      section: sectionOf(props[key]),
    }));
    const tabs = orderedTabs(schema);
    const sectionsByTab: Record<string, string[]> = {};
    tabs.forEach((t) => {
      const secs = orderedSections(schema, t);
      if (secs.length > 0) sectionsByTab[t] = secs;
    });
    return { tabs, sectionsByTab, fieldsInOrder };
  } catch {
    return null;
  }
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

type AnySchema = Record<string, unknown> & {
  properties?: Record<string, Record<string, unknown>>;
};

/** Applies fn to the property definition wherever it lives (properties or dependencies blocks). */
function withPropDef(schema: AnySchema, key: string, fn: (def: Record<string, unknown>) => void): boolean {
  if (schema.properties?.[key]) {
    fn(schema.properties[key]);
    return true;
  }
  const deps = schema.dependencies;
  if (deps && typeof deps === 'object') {
    for (const d of Object.values(deps as Record<string, unknown>)) {
      const oneOf = (d as Record<string, unknown> | null)?.oneOf;
      if (Array.isArray(oneOf)) {
        for (const opt of oneOf) {
          const def = (opt as Record<string, unknown> | null)?.properties as
            | Record<string, Record<string, unknown>>
            | undefined;
          if (def?.[key]) {
            fn(def[key]);
            return true;
          }
        }
      }
    }
  }
  return false;
}

function applyTag(
  def: Record<string, unknown>,
  destTab: string,
  destSection: string | undefined,
  siblingTabs: Set<string>,
): void {
  siblingTabs.add(destTab);
  const singleDefault = siblingTabs.size === 1 && siblingTabs.has(DEFAULT_TAB_LABEL);
  if (singleDefault) delete def.tab;
  else def.tab = destTab;
  if (destSection) def.section = destSection;
  else delete def.section;
}

function siblingTabSet(props: Record<string, Record<string, unknown>>): Set<string> {
  const set = new Set<string>();
  Object.values(props).forEach((p) => set.add(tabOf(p)));
  return set;
}

/**
 * Moves a field to (destTab, destSection) at destIndex within that group
 * (-1 = end). Reorders `properties` keys; retags `tab`/`section`.
 * Fields living only under `dependencies` are retagged in place (no reorder).
 */
export function moveFieldKey(
  schemaInput: unknown,
  key: string,
  destTab: string,
  destSection: string | undefined,
  destIndex: GroupIndex,
): unknown {
  const schema = deepClone(schemaInput as AnySchema);
  if (!schema.properties || typeof schema.properties !== 'object') return schema;
  const entry = schema.properties[key];
  if (entry === undefined) {
    withPropDef(schema, key, (def) =>
      applyTag(def, destTab, destSection, siblingTabSet(schema.properties ?? {})),
    );
    return schema;
  }
  delete schema.properties[key];
  applyTag(entry, destTab, destSection, siblingTabSet(schema.properties));
  const remaining = Object.keys(schema.properties);
  const inGroup = (k: string) =>
    tabOf(schema.properties?.[k]) === destTab &&
    (sectionOf(schema.properties?.[k]) ?? undefined) === (destSection ?? undefined);

  let insertAt: number;
  if (destIndex >= 0) {
    let seen = 0;
    let anchor: string | null = null;
    for (const k of remaining) {
      if (inGroup(k)) {
        if (seen === destIndex) {
          anchor = k;
          break;
        }
        seen++;
      }
    }
    insertAt = anchor !== null ? remaining.indexOf(anchor) : -1;
  } else {
    insertAt = -1;
  }
  if (insertAt < 0) {
    // Append right after the last member of the destination group...
    insertAt = remaining.length;
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (inGroup(remaining[i])) {
        insertAt = i + 1;
        break;
      }
    }
    if (insertAt === remaining.length) {
      // ...or, when the group is empty, at the end of the destination tab
      // (before the first key of a later tab) so tab contiguity is preserved.
      const order = orderedTabs(schema);
      const tabIdx = order.indexOf(destTab);
      if (tabIdx >= 0) {
        for (let i = 0; i < remaining.length; i++) {
          if (order.indexOf(tabOf(schema.properties[remaining[i]])) > tabIdx) {
            insertAt = i;
            break;
          }
        }
      }
    }
  }
  const ordered = remaining.slice();
  ordered.splice(Math.min(insertAt, ordered.length), 0, key);
  const next: Record<string, Record<string, unknown>> = {};
  ordered.forEach((k) => {
    next[k] = k === key ? entry : (schema.properties as Record<string, Record<string, unknown>>)[k];
  });
  schema.properties = next;
  return schema;
}

/** Reorders the tab strip (materializes `x-form-tabs`). */
export function moveTabLabel(schemaInput: unknown, from: number, to: number): unknown {
  const schema = deepClone(schemaInput as AnySchema);
  const tabs = orderedTabs(schema);
  if (from < 0 || from >= tabs.length || to < 0 || to >= tabs.length || from === to) return schema;
  const [moved] = tabs.splice(from, 1);
  tabs.splice(to, 0, moved);
  schema['x-form-tabs'] = tabs;
  return schema;
}

/**
 * Reorders sections of a tab: rewrites the tab's property-key blocks
 * (sectionless first, then sections in the new order) and `x-form-sections[tab]`.
 */
export function moveSectionLabel(schemaInput: unknown, tab: string, from: number, to: number): unknown {
  const schema = deepClone(schemaInput as AnySchema);
  const secs = orderedSections(schema, tab);
  if (from < 0 || from >= secs.length || to < 0 || to >= secs.length || from === to) return schema;
  const [moved] = secs.splice(from, 1);
  secs.splice(to, 0, moved);
  reorderTabKeysBySections(schema, tab, secs);
  const xSec = ((schema['x-form-sections'] ?? {}) as Record<string, unknown>) as Record<string, string[]>;
  schema['x-form-sections'] = { ...xSec, [tab]: secs };
  return schema;
}

function reorderTabKeysBySections(schema: AnySchema, tab: string, secs: string[]): void {
  const props = schema.properties ?? {};
  const keys = Object.keys(props);
  const tabKeys = keys.filter((k) => tabOf(props[k]) === tab);
  if (tabKeys.length === 0) return;
  const rank = (k: string): number => {
    const s = sectionOf(props[k]);
    if (!s) return -1;
    const i = secs.indexOf(s);
    return i < 0 ? secs.length : i;
  };
  const ordered = tabKeys
    .map((k, i) => ({ k, i }))
    .sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i)
    .map((e) => e.k);
  const start = keys.findIndex((k) => tabOf(props[k]) === tab);
  const inTab = new Set(tabKeys);
  const head = keys.slice(0, start);
  const tail = keys.slice(start).filter((k) => !inTab.has(k));
  const next: Record<string, Record<string, unknown>> = {};
  [...head, ...ordered, ...tail].forEach((k) => {
    next[k] = props[k];
  });
  schema.properties = next;
}

/** Renames a section (empty name removes it → fields become sectionless). */
export function renameSectionLabel(
  schemaInput: unknown,
  tab: string,
  oldLabel: string,
  newLabel: string,
): unknown {
  const schema = deepClone(schemaInput as AnySchema);
  const next = (newLabel || '').trim();
  const props = schema.properties ?? {};
  Object.keys(props).forEach((k) => {
    if (tabOf(props[k]) === tab && sectionOf(props[k]) === oldLabel) {
      if (next) props[k].section = next;
      else delete props[k].section;
    }
  });
  // Keep dependencies-located fields consistent too.
  const deps = (schema as Record<string, unknown>).dependencies;
  if (deps && typeof deps === 'object') {
    for (const d of Object.values(deps as Record<string, unknown>)) {
      const oneOf = (d as Record<string, unknown> | null)?.oneOf;
      if (Array.isArray(oneOf)) {
        for (const opt of oneOf) {
          const defs = (opt as Record<string, unknown> | null)?.properties as
            | Record<string, Record<string, unknown>>
            | undefined;
          if (!defs) continue;
          Object.keys(defs).forEach((k) => {
            if (tabOf(defs[k]) === tab && sectionOf(defs[k]) === oldLabel) {
              if (next) defs[k].section = next;
              else delete defs[k].section;
            }
          });
        }
      }
    }
  }
  const xSec = ((schema['x-form-sections'] ?? {}) as Record<string, unknown>) as Record<string, string[]>;
  const list = [...(xSec[tab] ?? [])];
  const idx = list.indexOf(oldLabel);
  if (idx >= 0) {
    if (next && !list.includes(next)) list[idx] = next;
    else if (!next) list.splice(idx, 1);
    else list.splice(idx, 1);
  }
  schema['x-form-sections'] = { ...xSec, [tab]: list };
  return schema;
}

/** Declares an (initially empty) section in `x-form-sections[tab]`. */
export function createSectionLabel(schemaInput: unknown, tab: string, label: string): unknown {
  const schema = deepClone(schemaInput as AnySchema);
  const name = (label || '').trim();
  if (!name) return schema;
  const xSec = ((schema['x-form-sections'] ?? {}) as Record<string, unknown>) as Record<string, string[]>;
  const list = [...(xSec[tab] ?? [])];
  if (!list.some((s) => s.toLowerCase() === name.toLowerCase())) list.push(name);
  schema['x-form-sections'] = { ...xSec, [tab]: list };
  return schema;
}
