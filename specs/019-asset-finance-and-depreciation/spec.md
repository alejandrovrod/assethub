# Especificación: Gestión Financiera, Depreciación y Bajas de Activos V1

**Feature Branch**: `019-asset-finance-and-depreciation`  
**Fecha**: 2026-09-21  
**Estado**: Especificado V1

---

## Propósito

Incorporar en AssetHub las capacidades de administración de activos fijos inspiradas en estándares de clase mundial (como ERPNext): cálculo sistemático de depreciaciones, ajuste/revaluación de valor, capitalización de gastos de reparación mayores (CAPEX vs OPEX), asignación formal de custodias y protocolo de desincorporación/baja definitiva.

---

## Alcance

- Configuración de libros financieros (`AssetFinanceBook`) por activo o heredado por plantilla/categoría.
- Generación de tablas y cronogramas de amortización (`AssetDepreciationSchedule`).
- Métodos de depreciación: Línea Recta (*Straight Line*), Saldo Decreciente (*Double Declining*), Valor Neto (*Written Down Value*) y Manual.
- Registro de devengo de cuotas periódicas de depreciación.
- Revaluación y deterioro contable (`AssetValueAdjustment`).
- Flujo de baja formal (`AssetDisposal`: chatarrización/scrapping, venta, robo/pérdida).
- Control de custodias y traslados con actas (`AssetCustodyTransfer`).
- Capitalización de órdenes de mantenimiento en el costo del activo.
- Vistas e interfaces web en React/TypeScript integradas en la ficha del activo.

---

## Actores y Permisos

| Actor | Permisos mínimos |
|---|---|
| Administrador Financiero / Tenant Admin | `assets.finance.read`, `assets.finance.write`, `assets.depreciation.post`, `assets.disposal.write` |
| Gestor de Mantenimiento / Jefe de Planta | `assets.read`, `maintenance.orders.write`, `assets.capitalization.propose` |
| Técnico / Operador | `assets.read`, `assets.custody.read` |
| Auditor Contable | `assets.finance.read`, `assets.depreciation.read`, `assets.disposal.read` |

---

## Decisiones de Producto y Arquitectura

1. **Activación Modular**: La gestión financiera es opcional; no bloquea la creación física de activos simples.
2. **Métodos de Cálculo**:
   - *Straight Line*: $\frac{\text{Costo Inicial} - \text{Valor Residual}}{\text{Meses de Vida Útil}}$.
   - *Double Declining*: Tasa del doble de línea recta sobre el valor residual del ejercicio.
   - *Written Down Value*: Porcentaje constante sobre el valor libro actual.
   - *Manual*: Cronograma provisto explícitamente por el usuario financiero.
3. **Cierre de Ciclo de Vida**: Un activo en estado `Disposed` o `Scrapped` queda bloqueado para nuevas asignaciones, planes preventivos o consumos de inventario.
4. **Idempotencia y UTC**: Todas las transacciones de depreciación y ajuste de valor emplean timestamps UTC y validación de idempotencia por clave única por período.
5. **Aislamiento Multi-Tenant**: Restricción estricta de acceso por `TenantId` a nivel de consultas y mutaciones en base de datos.
6. **Tratamiento Prospectivo de Cambios**: Cualquier mejora capitalizada, revaluación o deterioro recalcula únicamente las cuotas futuras no devengadas; las cuotas históricas permanecen inmutables.

---

## Modelo de Datos (Entidades de Dominio)

### 1. AssetFinanceBook — Perfil Financiero del Activo

Representa la configuración contable de un activo. Puede definirse explícitamente o heredarse del template/categoría.

| Campo | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner (query filter) |
| `AssetId` | `Guid` | FK → Asset (único por activo) |
| `AcquisitionCost` | `decimal(18,4)` | Costo de adquisición (base) |
| `ResidualValue` | `decimal(18,4)` | Valor residual/salvamento |
| `UsefulLifeMonths` | `int` | Vida útil en meses |
| `DepreciationMethod` | `enum` | `StraightLine`, `DoubleDeclining`, `WrittenDownValue`, `Manual` |
| `DepreciationRatePct` | `decimal(5,2)` | Tasa % para WDV / Manual (opcional) |
| `FrequencyMonths` | `int` | Frecuencia de devengo (default 1 = mensual) |
| `StartDate` | `DateTime` | Fecha de inicio de depreciación (puesta en marcha) |
| `Currency` | `string(3)` | ISO 4217 (default MXN) |
| `IsActive` | `bool` | Activo financiero habilitado |
| `CreatedAt` | `DateTime` | UTC |
| `UpdatedAt` | `DateTime` | UTC |

**Invariantes**:
- `AcquisitionCost >= ResidualValue >= 0`
- `UsefulLifeMonths > 0`
- `FrequencyMonths > 0` y divide a `UsefulLifeMonths` (para métodos sistemáticos)

### 2. AssetDepreciationSchedule — Cronograma Proyectado

Tabla de amortización proyectada (una fila por período futuro o histórico).

| Campo | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner |
| `AssetId` | `Guid` | FK → Asset |
| `FinanceBookId` | `Guid` | FK → AssetFinanceBook |
| `PeriodNumber` | `int` | Número de período (1..N) |
| `PeriodStartDate` | `DateTime` | Inicio del período (UTC) |
| `PeriodEndDate` | `DateTime` | Fin del período (UTC) |
| `ProjectedDepreciationAmount` | `decimal(18,4)` | Cuota proyectada |
| `ProjectedAccumulatedDepreciation` | `decimal(18,4)` | Acumulado proyectado |
| `ProjectedNetBookValue` | `decimal(18,4)` | Valor neto proyectado |
| `IsPosted` | `bool` | Si la cuota ya fue devengada |
| `PostedEntryId` | `Guid?` | FK → AssetDepreciationEntry (si posted) |
| `CreatedAt` | `DateTime` | UTC |
| `UpdatedAt` | `DateTime` | UTC |

**Índices**: `(TenantId, AssetId, PeriodNumber)` único; `(TenantId, AssetId, IsPosted)`.

### 3. AssetDepreciationEntry — Asiento de Depreciación Devengado

Registro inmutable de una cuota contabilizada (posted).

| Campo | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner |
| `AssetId` | `Guid` | FK → Asset |
| `FinanceBookId` | `Guid` | FK → AssetFinanceBook |
| `ScheduleId` | `Guid` | FK → AssetDepreciationSchedule |
| `PeriodNumber` | `int` | Período devengado |
| `AccountingDate` | `DateTime` | Fecha contable (UTC) |
| `DepreciationAmount` | `decimal(18,4)` | Monto depreciado |
| `AccumulatedDepreciation` | `decimal(18,4)` | Depreciación acumulada tras este asiento |
| `NetBookValue` | `decimal(18,4)` | Valor neto en libros resultante |
| `IdempotencyKey` | `string(64)` | Clave única por período (`{AssetId}:{PeriodNumber}:{FrequencyMonths}`) |
| `PostedBy` | `Guid` | Usuario que registró |
| `PostedAt` | `DateTime` | UTC |
| `Notes` | `string?` | Observaciones |

**Índices**: `(TenantId, IdempotencyKey)` único (idempotencia); `(TenantId, AssetId, PeriodNumber)`.

### 4. AssetValueAdjustment — Ajuste de Valor (Revaluación/Deterioro)

Registro inmutable de cambio en el valor contable del activo.

| Campo | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner |
| `AssetId` | `Guid` | FK → Asset |
| `FinanceBookId` | `Guid` | FK → AssetFinanceBook |
| `AdjustmentType` | `enum` | `Revaluation` (subida), `Impairment` (baja) |
| `PreviousNetBookValue` | `decimal(18,4)` | Valor neto antes del ajuste |
| `AdjustmentAmount` | `decimal(18,4)` | Delta (positivo o negativo) |
| `NewNetBookValue` | `decimal(18,4)` | Valor neto resultante |
| `Reason` | `string` | Justificación obligatoria |
| `EffectiveDate` | `DateTime` | Fecha efectiva (UTC) |
| `ApprovedBy` | `Guid` | Usuario aprobador |
| `ApprovedAt` | `DateTime` | UTC |
| `IsPosted` | `bool` | Siempre true al crear (inmutable) |
| `CreatedAt` | `DateTime` | UTC |

**Regla**: Al crear, recalcula prospectivamente las cuotas `AssetDepreciationSchedule` pendientes (`IsPosted == false`) desde el período siguiente al `EffectiveDate`.

### 5. AssetDisposal — Baja / Desincorporación

Registro inmutable de fin de vida contable y operativa.

| Campo | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner |
| `AssetId` | `Guid` | FK → Asset (único) |
| `DisposalType` | `enum` | `Scrapped`, `Sold`, `Lost`, `Donated`, `Transferred` |
| `DisposalDate` | `DateTime` | Fecha de baja (UTC) |
| `NetBookValueAtDisposal` | `decimal(18,4)` | Valor neto en libros al momento de baja |
| `ProceedsAmount` | `decimal(18,4)` | Monto recuperado (venta, seguro, etc.) |
| `GainLossAmount` | `decimal(18,4)` | `ProceedsAmount - NetBookValueAtDisposal` |
| `Reason` | `string` | Motivo obligatorio |
| `DocumentReference` | `string?` | Ref. factura, acta, póliza seguro |
| `ApprovedBy` | `Guid` | Usuario aprobador |
| `ApprovedAt` | `DateTime` | UTC |
| `CreatedAt` | `DateTime` | UTC |

**Efectos colaterales**:
- Asset.State → `Disposed` / `Scrapped` (terminal).
- Cancela `AssetDepreciationSchedule` futuros (`IsPosted == false`).
- Bloquea creación de órdenes de mantenimiento, tareas, consumos de inventario.

### 6. AssetCustodyTransfer — Traslado de Custodia

Acta de asignación/transferencia de responsabilidad física.

| Campo | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner |
| `AssetId` | `Guid` | FK → Asset |
| `FromEmployeeId` | `Guid?` | Custodio anterior (null = alta inicial) |
| `ToEmployeeId` | `Guid` | Nuevo custodio |
| `FromDepartmentId` | `Guid?` | Depto/centro costo anterior |
| `ToDepartmentId` | `Guid?` | Nuevo depto/centro costo |
| `TransferDate` | `DateTime` | Fecha efectiva (UTC) |
| `TransferType` | `enum` | `Assignment`, `Transfer`, `Return`, `Relocation` |
| `Reason` | `string` | Motivo |
| `DocumentUrl` | `string?` | URL acta digitalizada (PDF/imagen) |
| `SignedByFrom` | `Guid?` | Firma custodio saliente |
| `SignedByTo` | `Guid?` | Firma custodio entrante |
| `CreatedBy` | `Guid` | Usuario que registra |
| `CreatedAt` | `DateTime` | UTC |

### 7. AssetRepairCapitalization — Capitalización de Mantenimiento

Extensión de `MaintenanceOrder` para marcar costos como CAPEX.

| Campo | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner |
| `MaintenanceOrderId` | `Guid` | FK → MaintenanceOrder (único) |
| `AssetId` | `Guid` | FK → Asset (denormalizado) |
| `CapitalizedAmount` | `decimal(18,4)` | Monto capitalizado (labor + partes) |
| `NewUsefulLifeMonths` | `int?` | Nueva vida útil total (opcional, extiende) |
| `EffectiveDate` | `DateTime` | Fecha de capitalización (UTC) |
| `ApprovedBy` | `Guid` | Usuario aprobador financiero |
| `ApprovedAt` | `DateTime` | UTC |
| `CreatedAt` | `DateTime` | UTC |

**Regla**: Solo si `MaintenanceOrder.State == Completed || Verified`. Al aprobar: incrementa `AssetFinanceBook.AcquisitionCost` y recalcula schedule prospectivo.

---

## Algoritmos de Depreciación

### Straight Line (Línea Recta)

```csharp
monthlyAmount = (AcquisitionCost - ResidualValue) / UsefulLifeMonths;
```

Constante cada período hasta agotar vida útil o alcanzar valor residual.

### Double Declining Balance (Doble Saldo Decreciente)

```csharp
rate = 2.0 / UsefulLifeMonths; // tasa mensual
depreciationAmount = min(CurrentNetBookValue * rate, CurrentNetBookValue - ResidualValue);
```

Se aplica sobre valor neto actual; acelera al inicio.

### Written Down Value (Porcentaje sobre Valor en Libros)

```csharp
depreciationAmount = min(CurrentNetBookValue * (DepreciationRatePct / 100), CurrentNetBookValue - ResidualValue);
```

Tasa fija configurable; similar a DDB pero con tasa parametrizada.

### Manual

El usuario provee `AssetDepreciationSchedule` completo vía API (`POST /generate` con `ManualScheduleDto[]`). El sistema valida que la suma de cuotas = `AcquisitionCost - ResidualValue` y que `NetBookValue >= ResidualValue` en cada fila.

---

## Reglas e Invariantes

- **RULE-FIN-001**: `NetBookValue >= ResidualValue` siempre.
- **RULE-FIN-002**: No se pueden procesar cuotas con fecha > `DisposalDate`.
- **RULE-FIN-003**: Capitalización solo si `MaintenanceOrder.State in (Completed, Verified)`.
- **RULE-FIN-004**: `AssetValueAdjustment` y `AssetDisposal` son inmutables tras aprobar.
- **RULE-FIN-005**: Cuotas `Posted` no se eliminan; correcciones → ajustes prospectivos.
- **RULE-FIN-006**: `AssetFinanceBook` único por `AssetId` (1:1).
- **RULE-FIN-007**: `IdempotencyKey` en `AssetDepreciationEntry` evita doble devengo.

---

## Requisitos Funcionales Detallados

### REQ-FIN-001: Configuración de Perfil Financiero
- CRUD de `AssetFinanceBook` vinculado a `Asset`.
- Herencia opcional desde `AssetTemplate` (campos por defecto en template).
- Validación de integridad referencial y rangos.

### REQ-FIN-002: Generación de Cronograma
- `POST /assets/{id}/depreciation-schedules/generate` crea/actualiza `AssetDepreciationSchedule`.
- Soporta recálculo total (borra futuros no posted) o ajuste incremental.
- Para `Manual`: acepta array de cuotas custom.

### REQ-FIN-003: Devengo de Cuotas (Posting)
- `POST /assets/{id}/depreciation-entries/post` devenga 1..N períodos.
- Valida idempotencia por `IdempotencyKey`.
- Actualiza `AssetDepreciationSchedule.IsPosted` y `PostedEntryId`.
- Actualiza `AssetFinanceBook` implicitamente (valor neto actual se deriva de entries).

### REQ-FIN-004: Ajuste de Valor (Revaluación/Deterioro)
- `POST /assets/{id}/value-adjustments` crea `AssetValueAdjustment`.
- Recalcula schedule futuro: redistribuye `NewNetBookValue - ResidualValue` sobre períodos restantes según método original.
- Genera evento de auditoría.

### REQ-FIN-005: Capitalización de Mantenimiento
- `POST /maintenance-orders/{id}/capitalize` crea `AssetRepairCapitalization`.
- Suma `LaborCost + sum(Parts.UnitCost * Quantity)` → `CapitalizedAmount`.
- Incrementa `AcquisitionCost` y opcionalmente `UsefulLifeMonths`.
- Dispara recálculo de schedule prospectivo.

### REQ-FIN-006: Baja de Activo
- `POST /assets/{id}/disposal` crea `AssetDisposal`.
- Transiciona `Asset.State` a terminal.
- Cancela schedule futuros.
- Calcula `GainLossAmount`.

### REQ-FIN-007: Transferencia de Custodia
- `POST /assets/{id}/custody-transfers` crea `AssetCustodyTransfer`.
- Historial inmutable; soporta firmas digitales (URLs).

---

## Criterios de Aceptación (BDD/Gherkin)

### CA-FA-001: Cálculo Línea Recta
```gherkin
Feature: Depreciación Línea Recta
  Scenario: Activo con costo 100,000, residual 10,000, vida 60 meses
    Given un activo con perfil financiero StraightLine
      And AcquisitionCost = 100000
      And ResidualValue = 10000
      And UsefulLifeMonths = 60
    When se genera el cronograma de depreciación
    Then cada cuota mensual = 1500
    And el valor neto tras 60 meses = 10000 (residual)
```

### CA-FA-002: Capitalización de Orden Recalcula Futuro
```gherkin
Feature: Capitalización de mantenimiento
  Scenario: Orden completada se capitaliza extendiendo vida útil
    Given un activo con valor neto 50000, vida remanente 24 meses, método StraightLine
    And una orden de mantenimiento Completed con costo total 20000
    When se capitaliza la orden con NewUsefulLifeMonths = 36
    Then el AcquisitionCost pasa a 70000
    And el schedule futuro recalcula cuotas sobre 36 meses restantes
    And las cuotas ya devengadas (Posted) no cambian
```

### CA-FA-003: Bloqueo en Estado Disposed
```gherkin
Feature: Bloqueo operativo tras baja
  Scenario: No se pueden crear órdenes en activo dado de baja
    Given un activo con AssetDisposal registrado (Disposed)
    When se intenta crear una MaintenanceOrder para ese activo
    Then la operación falla con código "asset_disposed"
    And mensaje: "El activo está dado de baja y no acepta operaciones"
```

### CA-FA-004: Ajuste de Valor Prospectivo
```gherkin
Feature: Revaluación prospectiva
  Scenario: Revaluación positiva recalcula solo cuotas futuras
    Given un activo con 12 cuotas Posted y 36 pendientes
    And valor neto actual 40000
    When se registra AssetValueAdjustment Revaluation +10000 (nuevo neto 50000)
    Then las 12 cuotas Posted permanecen inmutables
    And las 36 cuotas pendientes recalculan sobre base 50000 - ResidualValue
```

### CA-FA-005: Trazabilidad de Custodia
```gherkin
Feature: Historial de custodias
  Scenario: Transferencia genera acta inmutable
    Given activo asignado a Empleado A
    When se registra transferencia a Empleado B con motivo "Rotación de personal"
    Then se crea AssetCustodyTransfer con From=A, To=B, TransferType=Transfer
    And el historial muestra ambas asignaciones con fechas y firmas
```

### CA-FA-006: Idempotencia en Devengo
```gherkin
Feature: Idempotencia de posting
  Scenario: Doble envío de misma cuota no duplica asiento
    Given un activo con schedule período 5 pendiente
    When se POSTea depreciation-entries/post para período 5 dos veces con mismo IdempotencyKey
    Then solo se crea un AssetDepreciationEntry
    And la segunda llamada retorna 200 con el entry existente
```

### CA-FA-007: Deterioro (Impairment) No Bajo Residual
```gherkin
Feature: Impairment respeta valor residual
  Scenario: Impairment no puede reducir neto bajo residual
    Given activo con NetBookValue = 15000, ResidualValue = 10000
    When se intenta AssetValueAdjustment Impairment de -8000 (resultaría 7000)
    Then la operación falla con código "below_residual_value"
```

---

## Endpoints REST (OpenAPI Resumido)

Base: `/api/v1`

### Perfil Financiero
- `GET    /assets/{id}/finance-profile` → `AssetFinanceBookDto`
- `PUT    /assets/{id}/finance-profile` → `AssetFinanceBookDto` (upsert)
- `DELETE /assets/{id}/finance-profile` → `204` (desactiva financiero)

### Cronograma de Depreciación
- `GET    /assets/{id}/depreciation-schedules` → `PagedResult<AssetDepreciationScheduleDto>`
- `POST   /assets/{id}/depreciation-schedules/generate` → `GenerateScheduleResponse` (body: `GenerateScheduleRequest`)
- `POST   /assets/{id}/depreciation-schedules/recalculate` → `RecalculateScheduleResponse` (prospectivo desde fecha)

### Devengo de Cuotas
- `POST   /assets/{id}/depreciation-entries/post` → `PostDepreciationResponse` (body: `PostDepreciationRequest`)
- `GET    /assets/{id}/depreciation-entries` → `PagedResult<AssetDepreciationEntryDto>`

### Ajustes de Valor
- `POST   /assets/{id}/value-adjustments` → `AssetValueAdjustmentDto` (body: `CreateValueAdjustmentRequest`)
- `GET    /assets/{id}/value-adjustments` → `PagedResult<AssetValueAdjustmentDto>`

### Bajas / Desincorporación
- `POST   /assets/{id}/disposal` → `AssetDisposalDto` (body: `CreateDisposalRequest`)
- `GET    /assets/{id}/disposal` → `AssetDisposalDto?` (404 si no existe)

### Custodias
- `GET    /assets/{id}/custody-transfers` → `PagedResult<AssetCustodyTransferDto>`
- `POST   /assets/{id}/custody-transfers` → `AssetCustodyTransferDto` (body: `CreateCustodyTransferRequest`)

### Capitalización de Mantenimiento
- `POST   /maintenance-orders/{id}/capitalize` → `AssetRepairCapitalizationDto` (body: `CapitalizeMaintenanceRequest`)

---

## Integraciones

| Módulo | Punto de Contacto |
|---|---|
| **M08 Árbol de Activos** | `Asset` enlaza `FinanceBook` y estado `Disposed`/`Scrapped` |
| **M12 Mantenimiento** | `MaintenanceOrder` → `AssetRepairCapitalization`; bloqueo si `Asset.State` terminal |
| **M13 Personal** | `Employee` como custodio en `AssetCustodyTransfer` |
| **M17 Propagación** | Evento `AssetFinanceStateChanged` para notificaciones |
| **M20 Inventario** | Costos de partes en `MaintenanceOrder.Parts` alimentan capitalización |

---

## Persistencia y Migraciones

- Nuevas tablas en schema `tenant` con `TenantId` + query filter.
- FK `Restrict` para integridad referencial.
- Índices tenant-scoped + unique constraints donde aplique.
- Soft delete (`IsDeleted`, `DeletedAt`) en entidades mutables; inmutables (`AssetValueAdjustment`, `AssetDisposal`, `AssetDepreciationEntry`) sin soft delete.
- `RowVersion` (concurrency token) en `AssetFinanceBook` y `AssetDepreciationSchedule`.

---

## Frontend (React + TypeScript)

### Pestaña "Finanzas" en ficha de activo (`/assets/{id}`)
1. **Resumen**: Valor neto actual, depreciación acumulada, próxima cuota, estado financiero.
2. **Perfil**: Formulario CRUD `AssetFinanceBook` (campos + selector método).
3. **Cronograma**: Tabla paginada `AssetDepreciationSchedule` con columnas: Período, Fecha, Cuota Proyectada, Acumulado, Valor Neto, Estado (Pendiente/Devengado), Acción (Postear).
4. **Asientos Devengados**: Lista `AssetDepreciationEntry` con auditoría (usuario, fecha, idempotency key).
5. **Ajustes**: Lista `AssetValueAdjustment` + botón "Nueva Revaluación/Deterioro" (modal con justificación obligatoria).
6. **Bajas**: Si no existe → botón "Dar de Baja" (modal tipo, fecha, monto recuperación, motivo). Si existe → vista readonly con ganancia/pérdida.
7. **Custodias**: Timeline vertical `AssetCustodyTransfer` con avatares, fechas, motivo, descarga acta.

### Permisos UI
- Botones "Postear", "Ajustar", "Capitalizar", "Dar de Baja" solo si usuario tiene permiso correspondiente.
- Estados terminales (`Disposed`, `Scrapped`) deshabilitan edición completa.

---

## Testing Strategy

| Nivel | Cobertura |
|---|---|
| **Unit** | Algoritmos de depreciación (SL, DDB, WDV, Manual), validaciones de invariantes, recálculo prospectivo. |
| **Integration** | Flujos completos: generar schedule → postear cuotas → ajustar → capitalizar → dar de baja. Idempotencia. Permisos. |
| **Contract** | OpenAPI schema validation para todos los endpoints. |
| **E2E (Playwright)** | Happy paths UI: configurar perfil, generar schedule, postear 3 meses, revaluar, capitalizar orden, dar de baja, transferir custodia. |

---

## Métricas y Observabilidad

- **Métricas Prometheus**:
  - `asset_finance_books_total` (gauge por tenant)
  - `asset_depreciation_posted_total` (counter)
  - `asset_value_adjustments_total` (counter por tipo)
  - `asset_disposals_total` (counter por tipo)
  - `asset_custody_transfers_total` (counter)
  - `asset_maintenance_capitalizations_total` (counter)
  - `asset_depreciation_recalculation_duration_seconds` (histogram)
- **Logs estructurados**: CorrelationId, TenantId, AssetId, UserId en todas las mutaciones.
- **Auditoría**: Tabla `AssetFinanceAuditLog` (opcional V2) con snapshot antes/después de cada mutación financiera.

---

## Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Redondeo acumulado en SL | Divergencia céntimos vs residual | Ajuste en última cuota: `LastAmount = RemainingToResidual` |
| Cambio de método a mitad de vida | Complejidad recálculo | Solo permitido via `AssetValueAdjustment` con recálculo prospectivo completo |
| Concurrencia en posting | Double-post race condition | `IdempotencyKey` unique index + `RowVersion` en schedule |
| Tenant sin módulo financiero | Datos huérfanos | Feature flag `FinanceModuleEnabled` por tenant; UI oculta pestaña si off |
| Migración datos legacy | Complejidad | Script seed opcional; import CSV con mapeo de campos |

---

## Próximos Pasos (Backlog V2)

1. **Múltiples libros por activo** (GAAP local + IFRS + fiscal).
2. **Depreciación por componentes** (component accounting).
3. **Integración contable** (asientos automáticos a Diario Mayor vía webhook/API).
4. **Reportes fiscales** (anexos SAT/AFIP, libros de activos fijos).
5. **Simulador de escenarios** (what-if: venta, revaluación, cambio método).
6. **Adjuntos en ajustes/bajas** (facturas, actas, peritajes).
7. **Notificaciones automáticas** (próxima cuota, vida útil por vencer, impairment test anual).