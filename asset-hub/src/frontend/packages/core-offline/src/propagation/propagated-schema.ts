import type { FieldDatabase } from '../db/database';

export interface PropagatedContextIds {
  tenantId: string;
  assetId?: string;
  workflowTemplateId?: string;
  incidentId?: string;
  maintenanceOrderId?: string;
}

export interface ResolvedSchemaResult {
  schema: Record<string, any>;
  uiSchema: Record<string, any>;
  mergedFormData: Record<string, any>;
}

export interface LifecycleTransitionInfo {
  availableTransitions: string[];
  getTargetStateAssociatedModule(targetState: string): string | null;
  getTransitionRequiredSchema(
    targetState: string,
    fullSchema: Record<string, any>
  ): Record<string, any> | null;
}

/**
 * Pure offline equivalent of `PropagatedPropertiesDisplay` + `useResolvedSchema` from `apps/web`.
 * Merges JSON schemas and propertiesJson from:
 *   1. Asset (`asset.schemaJson` + `asset.propertiesJson`, tagged with `_source: 'asset'`)
 *   2. WorkflowTemplates from Incident, MaintenanceOrder, and current entity (`_source: 'workflowTemplate'`)
 * And resolves `catalogCode`, `format: 'employee'`, and `format: 'team'` against local Dexie tables.
 */
export async function buildPropagatedAndResolvedSchema(
  db: FieldDatabase,
  ctx: PropagatedContextIds,
  localPropertiesJson?: string
): Promise<ResolvedSchemaResult> {
  const [asset, incident, order] = await Promise.all([
    ctx.assetId ? db.assets.get(ctx.assetId) : Promise.resolve(undefined),
    ctx.incidentId ? db.incidents.get(ctx.incidentId) : Promise.resolve(undefined),
    ctx.maintenanceOrderId
      ? db.maintenance_orders.get(ctx.maintenanceOrderId)
      : Promise.resolve(undefined),
  ]);

  const resolvedIncident =
    incident ??
    (order?.incidentId ? await db.incidents.get(order.incidentId) : undefined);
  const resolvedAsset =
    asset ??
    (order?.assetId ? await db.assets.get(order.assetId) : undefined);

  const workflowIds = new Set<string>();
  if (ctx.workflowTemplateId) workflowIds.add(ctx.workflowTemplateId);
  if (resolvedIncident?.workflowTemplateId) workflowIds.add(resolvedIncident.workflowTemplateId);
  if (order?.workflowTemplateId) workflowIds.add(order.workflowTemplateId);

  // The bare asset inspector passes only { tenantId, assetId }: there is no workflow in
  // play, so merging every cached workflow template would pollute the asset with fields
  // that belong to unrelated incident/order templates.
  const hasWorkflowContext = Boolean(
    ctx.workflowTemplateId || ctx.incidentId || ctx.maintenanceOrderId || resolvedIncident || order
  );

  // If still no workflowIds, inspect all cached workflow templates as fallback
  if (workflowIds.size === 0 && hasWorkflowContext) {
    const allTemplates = await db.workflow_templates.toArray();
    for (const t of allTemplates) {
      workflowIds.add(t.id);
    }
  }

  const workflowTemplates =
    workflowIds.size > 0
      ? (await db.workflow_templates.bulkGet(Array.from(workflowIds))).filter(
        (wt): wt is NonNullable<typeof wt> => Boolean(wt)
      )
      : [];

  const combined: Record<string, any> = {
    type: 'object',
    properties: {},
    dependencies: {},
  };
  let hasProperties = false;

  if (resolvedAsset?.schemaJson) {
    try {
      const parsed = JSON.parse(resolvedAsset.schemaJson);
      if (parsed.properties) {
        for (const key of Object.keys(parsed.properties)) {
          parsed.properties[key]._source = 'asset';
        }
        Object.assign(combined.properties, parsed.properties);
        hasProperties = true;
      }
      if (parsed.dependencies) {
        Object.assign(combined.dependencies, parsed.dependencies);
      }
      if (parsed['x-form-tabs']) {
        combined['x-form-tabs'] = parsed['x-form-tabs'];
      }
      if (parsed['x-form-sections']) {
        combined['x-form-sections'] = parsed['x-form-sections'];
      }
    } catch {
      // Ignore malformed asset schemaJson
    }
  }

  for (const wt of workflowTemplates) {
    if (wt?.schemaJson) {
      try {
        const parsed = JSON.parse(wt.schemaJson);
        if (parsed.properties) {
          for (const key of Object.keys(parsed.properties)) {
            parsed.properties[key]._source = 'workflowTemplate';
          }
          Object.assign(combined.properties, parsed.properties);
          hasProperties = true;
        }
        if (parsed.dependencies) {
          Object.assign(combined.dependencies, parsed.dependencies);
        }
        if (parsed['x-form-tabs']) {
          combined['x-form-tabs'] = parsed['x-form-tabs'];
        }
        if (parsed['x-form-sections']) {
          combined['x-form-sections'] = parsed['x-form-sections'];
        }
      } catch {
        // Ignore malformed workflow template schemaJson
      }
    }
  }

  // Merge propagated formData in priority order: Asset -> Incident -> MaintenanceOrder -> Local entity
  const mergedFormData: Record<string, any> = {};
  for (const rawJson of [
    resolvedAsset?.propertiesJson,
    resolvedIncident?.propertiesJson,
    order?.propertiesJson,
    localPropertiesJson,
  ]) {
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed && typeof parsed === 'object') {
          // Normalise assignment alias: asignar_a is the canonical key
          if (parsed.asignado_a && !parsed.asignar_a) {
            parsed.asignar_a = parsed.asignado_a;
          }
          if (parsed.asignar_a && !parsed.asignado_a) {
            parsed.asignado_a = parsed.asignar_a;
          }
          Object.assign(mergedFormData, parsed);
        }
      } catch {
        // Ignore invalid JSON
      }
    }
  }

  // Fallback: If no schema properties were discovered, synthesize schema properties
  // from the mergedFormData so dynamic properties are always visible rather than empty.
  if (!hasProperties && Object.keys(mergedFormData).length > 0) {
    for (const [key, value] of Object.entries(mergedFormData)) {
      if (key.startsWith('_')) continue;
      const title = key
        .replace(/^field_(\d+)$/i, 'Campo $1')
        .replace(/^(field_\d+_|[a-z0-9]+_)/i, '')
        .replace(/_/g, ' ');
      combined.properties[key] = {
        title,
        type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
        readOnly: true,
      };
    }
    hasProperties = true;
  }

  if (!hasProperties) {
    return { schema: {}, uiSchema: {}, mergedFormData };
  }

  const { schema, uiSchema } = await resolveSchemaFromDexie(
    db,
    ctx.tenantId,
    combined
  );

  return { schema, uiSchema, mergedFormData };
}

/**
 * Offline equivalent of `useResolvedSchema`:
 * Resolves `catalogCode` into standard JSON Schema `oneOf` enums from `db.catalog_items`,
 * normalizes legacy `type: 'date'`, and maps `format: 'employee' | 'team'` to custom widgets.
 */
export async function resolveSchemaFromDexie(
  db: FieldDatabase,
  tenantId: string,
  inputSchema: Record<string, any>
): Promise<{ schema: Record<string, any>; uiSchema: Record<string, any> }> {
  const resolvedSchema = JSON.parse(JSON.stringify(inputSchema || {}));
  const generatedUiSchema: Record<string, any> = {};

  if (!resolvedSchema.properties) {
    return { schema: resolvedSchema, uiSchema: generatedUiSchema };
  }

  const catalogKeys: Array<{ propTarget: Record<string, any>; catalogCode: string }> = [];
  const employeeTargets: Array<Record<string, any>> = [];
  const teamTargets: Array<Record<string, any>> = [];

  const inspectProperty = (key: string, prop: Record<string, any>) => {
    if (!prop || typeof prop !== 'object') return;
    if (prop.format === 'employee') {
      employeeTargets.push(prop);
      generatedUiSchema[key] = { 'ui:widget': 'EmployeeSelectWidget' };
    } else if (prop.format === 'team') {
      teamTargets.push(prop);
      generatedUiSchema[key] = { 'ui:widget': 'TeamSelectWidget' };
    }
    if (prop.type === 'date') {
      prop.type = 'string';
      prop.format = 'date';
    }
    if (prop.catalogCode) {
      catalogKeys.push({ propTarget: prop, catalogCode: prop.catalogCode });
    }
  };

  for (const key of Object.keys(resolvedSchema.properties)) {
    inspectProperty(key, resolvedSchema.properties[key]);
  }

  if (resolvedSchema.dependencies) {
    for (const depKey of Object.keys(resolvedSchema.dependencies)) {
      const dep = resolvedSchema.dependencies[depKey];
      if (dep?.oneOf && Array.isArray(dep.oneOf)) {
        for (const branch of dep.oneOf) {
          if (branch?.properties) {
            for (const key of Object.keys(branch.properties)) {
              inspectProperty(key, branch.properties[key]);
            }
          }
        }
      }
    }
  }

  if (catalogKeys.length > 0) {
    const uniqueCodes = Array.from(new Set(catalogKeys.map((k) => k.catalogCode)));
    const catalogMap = new Map<string, Array<{ id: string; code: string; label: string }>>();

    await Promise.all(
      uniqueCodes.map(async (code) => {
        let items = await db.catalog_items
          .where('[tenantId+catalogCode]')
          .equals([tenantId, code])
          .toArray();
        if (items.length === 0) {
          items = await db.catalog_items
            .where('catalogCode')
            .equals(code)
            .toArray();
        }
        items.sort((a, b) => a.sortOrder - b.sortOrder);
        catalogMap.set(
          code,
          items.map((item) => ({ id: item.id, code: item.code, label: item.label }))
        );
      })
    );

    for (const { propTarget, catalogCode } of catalogKeys) {
      const options = catalogMap.get(catalogCode) ?? [];
      propTarget.oneOf = options.map((opt) => ({
        const: opt.code,
        title: opt.label,
      }));
    }
  }

  if (employeeTargets.length > 0) {
    const employees = await db.directory_entries.where('kind').equals('employee').toArray();
    for (const prop of employeeTargets) {
      if (employees.length > 0) {
        prop.oneOf = employees.map((e) => ({
          const: e.id,
          title: e.name,
        }));
      }
    }
  }

  if (teamTargets.length > 0) {
    const teams = await db.directory_entries.where('kind').equals('team').toArray();
    for (const prop of teamTargets) {
      if (teams.length > 0) {
        prop.oneOf = teams.map((t) => ({
          const: t.id,
          title: t.name,
        }));
      }
    }
  }

  return { schema: resolvedSchema, uiSchema: generatedUiSchema };
}

/**
 * Evaluates dynamic workflow state machine (`lifecycleStatesJson` from `WorkflowTemplateRecord`),
 * matching `IncidentDetailPage` in `apps/web`.
 */
export function evaluateWorkflowLifecycle(
  currentState: string | undefined,
  lifecycleStatesJson?: string
): LifecycleTransitionInfo {
  if (!currentState || !lifecycleStatesJson) {
    return {
      availableTransitions: [],
      getTargetStateAssociatedModule: () => null,
      getTransitionRequiredSchema: () => null,
    };
  }

  let config: any = null;
  try {
    config =
      typeof lifecycleStatesJson === 'string'
        ? JSON.parse(lifecycleStatesJson)
        : lifecycleStatesJson;
  } catch {
    return {
      availableTransitions: [],
      getTargetStateAssociatedModule: () => null,
      getTransitionRequiredSchema: () => null,
    };
  }

  const fromTransitionsMap = config?.transitions?.[currentState];
  const fromStateNode = config?.states?.[currentState]?.allowedTransitions;
  const availableTransitions: string[] = Array.isArray(fromTransitionsMap)
    ? fromTransitionsMap
    : Array.isArray(fromStateNode)
      ? fromStateNode
      : [];

  return {
    availableTransitions,
    getTargetStateAssociatedModule(targetState: string): string | null {
      return config?.states?.[targetState]?.associatedModule ?? null;
    },
    getTransitionRequiredSchema(
      targetState: string,
      fullSchema: Record<string, any>
    ): Record<string, any> | null {
      const targetConfig = config?.states?.[targetState];
      const requiresFields: string[] | undefined = targetConfig?.requiresFields;
      if (
        !requiresFields ||
        !Array.isArray(requiresFields) ||
        requiresFields.length === 0 ||
        !fullSchema?.properties
      ) {
        return targetConfig?.propertiesSchema ?? null;
      }

      const subSchema: Record<string, any> = {
        type: 'object',
        properties: {},
        required: [] as string[],
      };

      for (const fieldKey of requiresFields) {
        if (fullSchema.properties[fieldKey]) {
          const fieldDef = fullSchema.properties[fieldKey];
          subSchema.properties[fieldKey] = fieldDef;
          // Parity with AssetDetailPage: do not enforce strict required on booleans
          // so users can answer "No" (false/unchecked)
          if (fieldDef.type !== 'boolean') {
            subSchema.required.push(fieldKey);
          }
        }
      }

      if (Object.keys(subSchema.properties).length === 0) return null;

      if (fullSchema.dependencies) {
        subSchema.dependencies = {};
        for (const depKey of Object.keys(fullSchema.dependencies)) {
          if (subSchema.properties[depKey]) {
            subSchema.dependencies[depKey] = fullSchema.dependencies[depKey];
          }
        }
      }
      if (fullSchema['x-form-tabs']) {
        subSchema['x-form-tabs'] = fullSchema['x-form-tabs'];
      }
      if (fullSchema['x-form-sections']) {
        subSchema['x-form-sections'] = fullSchema['x-form-sections'];
      }

      return subSchema;
    },
  };
}
