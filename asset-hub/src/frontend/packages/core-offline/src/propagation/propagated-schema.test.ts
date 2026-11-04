import { describe, it, expect, beforeEach } from 'vitest';
import { createFieldDatabase, type FieldDatabase } from '../db/database';
import {
  buildPropagatedAndResolvedSchema,
  evaluateWorkflowLifecycle,
} from './propagated-schema';
import { MaintenanceOrderRepository } from '../repositories/maintenance-order.repository';
import { TaskRepository } from '../repositories/task.repository';
import { AssetRepository } from '../repositories/asset.repository';
import { getDynamicValidationErrors } from '../validation/dynamic-validation-rules';

  describe('Offline Propagation, Dynamic Schemas, BOM, Parts, and State Machines (T040A-T040E)', () => {
    let db: FieldDatabase;

    beforeEach(() => {
      db = createFieldDatabase(`test-propagation-${Math.random()}`);
    });

    it('merges schemas and propertiesJson across Asset -> Incident -> Order -> Task and resolves catalogCode offline', async () => {
      const now = Date.now();

      await db.assets.put({
        id: 'asset-1',
        tenantId: 't1',
        code: 'PUMP-01',
        name: 'Main Pump',
        state: 'active',
        criticality: 'high',
        searchCodes: ['PUMP01'],
        searchText: 'pump 01 main pump',
        schemaJson: JSON.stringify({
          type: 'object',
          properties: {
            nominalRpm: { type: 'number', title: 'Nominal RPM' },
          },
        }),
        propertiesJson: JSON.stringify({ nominalRpm: 1500 }),
        historyCachedAtMs: now,
        cachedAtMs: now,
        isStale: 0,
      });

      await db.catalog_items.bulkPut([
        {
          id: 'cat-1',
          tenantId: 't1',
          catalogCode: 'failure_cause',
          code: 'bearing_wear',
          label: 'Bearing Wear',
          sortOrder: 1,
          cachedAtMs: now,
        },
        {
          id: 'cat-2',
          tenantId: 't1',
          catalogCode: 'failure_cause',
          code: 'seal_leak',
          label: 'Seal Leak',
          sortOrder: 2,
          cachedAtMs: now,
        },
      ]);

      await db.workflow_templates.bulkPut([
        {
          id: 'wt-inc',
          tenantId: 't1',
          name: 'Incident Flow',
          entityType: 'incident',
          schemaJson: JSON.stringify({
            type: 'object',
            properties: {
              failureCause: {
                type: 'string',
                title: 'Failure Cause',
                catalogCode: 'failure_cause',
              },
              inspector: {
                type: 'string',
                format: 'employee',
                title: 'Inspector',
              },
            },
          }),
          cachedAtMs: now,
        },
        {
          id: 'wt-order',
          tenantId: 't1',
          name: 'Order Flow',
          entityType: 'maintenance_order',
          schemaJson: JSON.stringify({
            type: 'object',
            properties: {
              measuredVibrationMmS: { type: 'number', title: 'Measured Vibration' },
            },
            'x-form-tabs': [{ id: 'readings', title: 'Readings' }],
          }),
          cachedAtMs: now,
        },
      ]);

      await db.incidents.put({
        id: 'inc-1',
        tenantId: 't1',
        assetId: 'asset-1',
        workflowTemplateId: 'wt-inc',
        title: 'High Vibration',
        description: 'Pump vibrating',
        severity: 'high',
        affectsOperation: true,
        propertiesJson: JSON.stringify({ failureCause: 'bearing_wear' }),
        geoStatus: 'ok',
        photoIds: [],
        reportedByUserId: 'u1',
        createdAtLocalIso: new Date(now).toISOString(),
        createdAtLocalMs: now,
        syncState: 'synced',
        cachedAtMs: now,
      });

      await db.maintenance_orders.put({
        id: 'ord-1',
        tenantId: 't1',
        title: 'Corrective Order #1',
        kind: 'corrective',
        state: 'in_progress',
        serverState: 'in_progress',
        assetId: 'asset-1',
        incidentId: 'inc-1',
        workflowTemplateId: 'wt-order',
        propertiesJson: JSON.stringify({ measuredVibrationMmS: 7.4 }),
        scheduledStartMs: now,
        scheduledEndMs: 0,
        cachedAtMs: now,
        updatedAtLocalMs: now,
        syncState: 'synced',
      });

      const result = await buildPropagatedAndResolvedSchema(
        db,
        {
          tenantId: 't1',
          assetId: 'asset-1',
          incidentId: 'inc-1',
          maintenanceOrderId: 'ord-1',
        },
        JSON.stringify({ measuredVibrationMmS: 4.1 }) // Task override
      );

      expect(result.schema.properties.nominalRpm._source).toBe('asset');
      expect(result.schema.properties.failureCause._source).toBe('workflowTemplate');
      expect(result.schema.properties.failureCause.oneOf).toEqual([
        { const: 'bearing_wear', title: 'Bearing Wear' },
        { const: 'seal_leak', title: 'Seal Leak' },
      ]);
      expect(result.uiSchema.inspector).toEqual({
        'ui:widget': 'EmployeeSelectWidget',
      });
      expect(result.schema['x-form-tabs']).toEqual([
        { id: 'readings', title: 'Readings' },
      ]);
      expect(result.mergedFormData).toEqual({
        nominalRpm: 1500,
        failureCause: 'bearing_wear',
        measuredVibrationMmS: 4.1,
      });
    });

      it('evaluates dynamic workflow lifecycle transitions, associatedModule, and required fields (excluding boolean from strict required)', () => {
        const lifecycleStatesJson = JSON.stringify({
          states: {
            open: { allowedTransitions: ['triaged', 'under_repair', 'closed'] },
            triaged: { allowedTransitions: ['closed'] },
            under_repair: {
              allowedTransitions: ['closed'],
              associatedModule: 'maintenance_order',
            },
            closed: {
              allowedTransitions: [],
              requiresFields: ['rootCauseNotes', 'safetyChecked'],
            },
          },
        });

        const info = evaluateWorkflowLifecycle('open', lifecycleStatesJson);
        expect(info.availableTransitions).toEqual(['triaged', 'under_repair', 'closed']);
        expect(info.getTargetStateAssociatedModule('under_repair')).toBe('maintenance_order');
        expect(info.getTargetStateAssociatedModule('triaged')).toBeNull();

        const fullSchema = {
          type: 'object',
          properties: {
            symptom: { type: 'string' },
            rootCauseNotes: { type: 'string', title: 'Root Cause Notes' },
            safetyChecked: { type: 'boolean', title: 'Safety Checked' },
          },
        };

        expect(info.getTransitionRequiredSchema('triaged', fullSchema)).toBeNull();
        expect(info.getTransitionRequiredSchema('closed', fullSchema)).toEqual({
          type: 'object',
          properties: {
            rootCauseNotes: { type: 'string', title: 'Root Cause Notes' },
            safetyChecked: { type: 'boolean', title: 'Safety Checked' },
          },
          // safetyChecked is boolean so it is NOT pushed to required[]
          required: ['rootCauseNotes'],
        });
      });

      it('blocks task state transitions until parent MaintenanceOrder transitions to in_progress, and filters by user/team assignment', async () => {
        const now = Date.now();
        const orderRepo = new MaintenanceOrderRepository(db);
        const taskRepo = new TaskRepository(db);

        await orderRepo.upsert({
          id: 'ord-100',
          tenantId: 't1',
          title: 'Scheduled Order',
          kind: 'preventive',
          state: 'scheduled',
          serverState: 'scheduled',
          assignedTeamId: 'team-alpha',
          scheduledStartMs: now,
          scheduledEndMs: 0,
          cachedAtMs: now,
          updatedAtLocalMs: now,
          syncState: 'synced',
        });

        await taskRepo.upsert({
          id: 'task-100',
          tenantId: 't1',
          assignedToId: '',
          assignedTeamId: 'team-alpha',
          maintenanceOrderId: 'ord-100',
          maintenanceOrderState: 'scheduled',
          title: 'Inspect Bearings',
          priority: 'high',
          state: 'todo',
          serverState: 'todo',
          dueAtMs: now,
          cachedAtMs: now,
          updatedAtLocalMs: now,
          syncState: 'synced',
        });

        const actorOrders = await orderRepo.findForActor({
          tenantId: 't1',
          employeeId: 'emp-99',
          teamIds: ['team-alpha'],
        });
        expect(actorOrders).toHaveLength(1);

        const actorTasks = await taskRepo.findForActor({
          tenantId: 't1',
          employeeId: 'emp-99',
          teamIds: ['team-alpha'],
        });
        expect(actorTasks).toHaveLength(1);

        expect(taskRepo.isStateChangeBlocked(actorTasks[0])).toBe(true);
        await expect(
          taskRepo.updateState('task-100', 'in_progress')
        ).rejects.toThrow(/parent maintenance order/);

        await orderRepo.updateStateAndPropagate('ord-100', 'in_progress');

        const unlockedTask = await taskRepo.getById('task-100');
        expect(unlockedTask?.maintenanceOrderState).toBe('in_progress');
        expect(taskRepo.isStateChangeBlocked(unlockedTask!)).toBe(false);

        await taskRepo.updateState('task-100', 'in_progress');
        const startedTask = await taskRepo.getById('task-100');
        expect(startedTask?.state).toBe('in_progress');
      });

      it('supports Asset geoJson updates, BOM materials, Order Parts linked to BOM, and Dynamic Validation Rules (T040E)', async () => {
        const now = Date.now();
        const assetRepo = new AssetRepository(db);
        const orderRepo = new MaintenanceOrderRepository(db);

        await assetRepo.upsert({
          id: 'asset-200',
          tenantId: 't1',
          code: 'COMP-02',
          name: 'Compressor #2',
          state: 'operational',
          criticality: 'critical',
          searchCodes: ['COMP02'],
          searchText: 'comp 02 compressor 2',
          historyCachedAtMs: now,
          cachedAtMs: now,
          isStale: 0,
        });

        // 1. Update asset GPS coordinates -> auto-generates GeoJSON Point [lng, lat]
        await assetRepo.updateDetails('asset-200', {
          latitude: 19.4326,
          longitude: -99.1332,
          propertiesJson: JSON.stringify({ operatingBar: 8.5 }),
        });
        const updatedAsset = await assetRepo.getById('asset-200');
        expect(updatedAsset?.geoJson).toBe(
          JSON.stringify({ type: 'Point', coordinates: [-99.1332, 19.4326] })
        );
        expect(updatedAsset?.syncState).toBe('pending');

        // 2. Add BOM material to Asset
        await assetRepo.upsertBomMaterial({
          id: 'bom-1',
          tenantId: 't1',
          assetId: 'asset-200',
          catalogItemId: 'part-seal-99',
          catalogItemCode: 'SEAL-99',
          catalogItemLabel: 'High-Pressure Seal Kit',
          quantity: 2,
          unitOfMeasure: 'pcs',
          isCritical: 1,
          notes: 'Replace every 2000h',
          syncState: 'synced',
          cachedAtMs: now,
        });

        // 3. Create Order for that Asset and suggest BOM parts
        await orderRepo.upsert({
          id: 'ord-200',
          tenantId: 't1',
          title: 'Compressor Seal Replacement',
          kind: 'corrective',
          state: 'in_progress',
          serverState: 'in_progress',
          assetId: 'asset-200',
          scheduledStartMs: now,
          scheduledEndMs: 0,
          cachedAtMs: now,
          updatedAtLocalMs: now,
          syncState: 'synced',
        });

        const suggestedBom = await orderRepo.getSuggestedBomPartsForOrder('ord-200');
        expect(suggestedBom).toHaveLength(1);
        expect(suggestedBom[0].catalogItemCode).toBe('SEAL-99');

        // 4. Add Order Part (Internal requires warehouseId)
        await expect(
          orderRepo.addPart({
            id: 'op-1',
            tenantId: 't1',
            orderId: 'ord-200',
            catalogItemId: 'part-seal-99',
            catalogItemLabel: 'High-Pressure Seal Kit',
            quantity: 2,
            unitCost: 45,
            sourceType: 'Internal',
            syncState: 'pending',
            cachedAtMs: now,
          })
        ).rejects.toThrow(/warehouseId is required/);

        await orderRepo.addPart({
          id: 'op-1',
          tenantId: 't1',
          orderId: 'ord-200',
          catalogItemId: 'part-seal-99',
          catalogItemLabel: 'High-Pressure Seal Kit',
          quantity: 2,
          unitCost: 45,
          sourceType: 'Internal',
          warehouseId: 'wh-mobile-1',
          syncState: 'pending',
          cachedAtMs: now,
        });

        const orderParts = await orderRepo.getParts('t1', 'ord-200');
        expect(orderParts).toHaveLength(1);

        // 5. Dynamic validation rules engine
        const schemaProps = {
          operatingBar: {
            type: 'number',
            title: 'Operating Pressure (bar)',
            _validationRules: [{ id: 'r1', type: 'range', min: 2, max: 12 }],
          },
          overpressureNote: {
            type: 'string',
            title: 'Overpressure Justification',
            _validationRules: [
              {
                id: 'r2',
                type: 'requiredIf',
                requiredIfField: 'alarmActive',
                requiredIfOperator: 'eq',
                requiredIfValue: 'yes',
              },
            ],
          },
        };

        const errors = getDynamicValidationErrors(
          { operatingBar: 16, alarmActive: 'yes', overpressureNote: '' },
          schemaProps
        );
        expect(errors).toHaveLength(2);
        expect(errors.map((e) => e.fieldKey)).toEqual([
          'operatingBar',
          'overpressureNote',
        ]);
      });
    });
