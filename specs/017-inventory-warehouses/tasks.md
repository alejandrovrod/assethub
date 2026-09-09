# Tareas de implementación: Inventario y Almacenes V1

## Fase 1: dominio y persistencia

- [ ] **TASK-INV-001** Crear constantes para modos, tipos, direcciones y estados `Draft/Posted/Reversed`.
- [ ] **TASK-INV-002** Crear `TenantInventorySettings`, `Warehouse`, `StockBalance` e `InventoryTransaction` con auditoría y soft delete donde corresponda.
- [ ] **TASK-INV-003** Extender `MaintenancePart` con `WarehouseId`, `InventoryTransactionId`, `SourceType`, `ExternalSupplierName` y `ExternalReference` nullable.
- [ ] **TASK-INV-004** Agregar `DbSet` y configuraciones EF Core en `TenantDbContext`.
- [ ] **TASK-INV-005** Configurar filtros tenant, FKs restrict, índices únicos, precisión decimal y `RowVersion`.
- [ ] **TASK-INV-006** Crear migración compatible y probarla sobre base nueva y base con datos históricos.

## Fase 2: reglas y aplicación backend

- [ ] **TASK-INV-007** Implementar validación de modo por tenant y compatibilidad de `MaintenancePart`.
- [ ] **TASK-INV-008** Implementar fórmula de promedio ponderado y redondeo a cuatro decimales.
- [ ] **TASK-INV-009** Implementar servicio transaccional de posting para ingresos, salidas, ajustes y reversiones.
- [ ] **TASK-INV-010** Rechazar saldo negativo dentro de la misma transacción bajo concurrencia.
- [ ] **TASK-INV-011** Implementar idempotencia por tenant, operación y `Idempotency-Key`.
- [ ] **TASK-INV-012** Implementar auditoría de usuario, razón y timestamps UTC para transacciones.
- [ ] **TASK-INV-013** Exponer configuración y CRUD de almacenes con permisos.
- [ ] **TASK-INV-014** Exponer queries paginadas de stock y transacciones, incluyendo `below_minimum`.
- [ ] **TASK-INV-015** Exponer ingresos, ajustes y reversión con problem details.
- [ ] **TASK-INV-016** Integrar consumo efectivo de órdenes con `MaintenancePart` y transacción de salida.
- [ ] **TASK-INV-017** Garantizar que external no modifique stock e internal exija almacén.
- [ ] **TASK-INV-018** Garantizar que hybrid procese líneas internas y externas atómicamente.

## Fase 3: frontend

- [ ] **TASK-INV-019** Crear pantalla de configuración de inventario y selector de modo.
- [ ] **TASK-INV-020** Crear listado y form-sheet de almacenes.
- [ ] **TASK-INV-021** Crear listado de stock con filtros y alertas de mínimo.
- [ ] **TASK-INV-022** Crear listado/detalle de transacciones inmutables.
- [ ] **TASK-INV-023** Crear form-sheet de ajustes con previsualización de saldo.
- [ ] **TASK-INV-024** Extender editor de materiales de órdenes para origen interno/externo.
- [ ] **TASK-INV-025** Implementar estados de permisos, carga, error, doble submit e invalidación de queries.

## Fase 4: pruebas

- [ ] **TASK-INV-026** Probar estados y reglas de transacción unitariamente.
- [ ] **TASK-INV-027** Probar fórmula de costo, redondeo y alertas de mínimo.
- [ ] **TASK-INV-028** Probar rechazo de saldo negativo y rollback atómico.
- [ ] **TASK-INV-029** Probar idempotencia duplicada y conflicto de payload.
- [ ] **TASK-INV-030** Probar aislamiento cross-tenant y permisos.
- [ ] **TASK-INV-031** Probar tenant externo sin movimiento de stock.
- [ ] **TASK-INV-032** Probar orden híbrida con salida interna y línea externa.
- [ ] **TASK-INV-033** Probar compatibilidad con `MaintenancePart` histórica.
- [ ] **TASK-INV-034** Probar migración sobre datos existentes.
- [ ] **TASK-INV-035** Probar contratos API y problem details.
- [ ] **TASK-INV-036** Probar flujos UI de configuración, stock, ajustes y orden.

## Fase 5: documentación y verificación

- [ ] **TASK-INV-037** Ejecutar quickstart y registrar resultados de build/test/migración.
- [ ] **TASK-INV-038** Revisar que la UI no prometa reservas, lotes, bins o compras.
- [ ] **TASK-INV-039** Verificar cada `REQ-INV-*`, `RULE-INV-*`, `SCN-INV-*` y criterio `CA-INV-*`.
