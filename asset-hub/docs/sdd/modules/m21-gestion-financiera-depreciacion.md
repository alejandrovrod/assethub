# M21 — Gestión Financiera, Depreciación y Bajas de Activos (Fixed Assets V1)

**Estado actual**: Especificado V1  
**Propósito**: Dotar a AssetHub de control financiero de activos fijos, cálculo de depreciaciones automáticas, ajustes por revaluación/deterioro, capitalización de mejoras y flujo formal de bajas y custodias, manteniendo la coherencia con el árbol físico y técnico de activos.

---

## Modelo de dominio

### Entidades Principales

#### `AssetFinanceBook`
Configuración financiera y contable por activo (1:1). Define parámetros de amortización.

| Propiedad | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner (query filter) |
| `AssetId` | `Guid` | FK → Asset (único) |
| `AcquisitionCost` | `decimal(18,4)` | Costo de adquisición base |
| `ResidualValue` | `decimal(18,4)` | Valor residual/salvamento |
| `UsefulLifeMonths` | `int` | Vida útil en meses |
| `DepreciationMethod` | `enum` | `StraightLine`, `DoubleDeclining`, `WrittenDownValue`, `Manual` |
| `DepreciationRatePct` | `decimal(5,2)?` | Tasa % para WDV/Manual |
| `FrequencyMonths` | `int` | Frecuencia devengo (default 1) |
| `StartDate` | `DateTime` | Fecha inicio depreciación |
| `Currency` | `string(3)` | ISO 4217 (default MXN) |
| `IsActive` | `bool` | Módulo financiero activo para este activo |
| `RowVersion` | `byte[]` | Concurrency token |
| `CreatedAt` / `UpdatedAt` | `DateTime` | UTC |

#### `AssetDepreciationSchedule`
Calendario proyectado e histórico de depreciación por activo y libro financiero.

| Propiedad | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner |
| `AssetId` | `Guid` | FK → Asset |
| `FinanceBookId` | `Guid` | FK → AssetFinanceBook |
| `PeriodNumber` | `int` | Número de período (1..N) |
| `PeriodStartDate` | `DateTime` | Inicio período (UTC) |
| `PeriodEndDate` | `DateTime` | Fin período (UTC) |
| `ProjectedDepreciationAmount` | `decimal(18,4)` | Cuota proyectada |
| `ProjectedAccumulatedDepreciation` | `decimal(18,4)` | Acumulado proyectado |
| `ProjectedNetBookValue` | `decimal(18,4)` | Valor neto proyectado |
| `IsPosted` | `bool` | Cuota devengada |
| `PostedEntryId` | `Guid?` | FK → AssetDepreciationEntry |
| `RowVersion` | `byte[]` | Concurrency token |
| `CreatedAt` / `UpdatedAt` | `DateTime` | UTC |

#### `AssetDepreciationEntry`
Registro inmutable de una cuota contabilizada (posted).

| Propiedad | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner |
| `AssetId` | `Guid` | FK → Asset |
| `FinanceBookId` | `Guid` | FK → AssetFinanceBook |
| `ScheduleId` | `Guid` | FK → AssetDepreciationSchedule |
| `PeriodNumber` | `int` | Período devengado |
| `AccountingDate` | `DateTime` | Fecha contable (UTC) |
| `DepreciationAmount` | `decimal(18,4)` | Monto depreciado |
| `AccumulatedDepreciation` | `decimal(18,4)` | Depreciación acumulada |
| `NetBookValue` | `decimal(18,4)` | Valor neto resultante |
| `IdempotencyKey` | `string(64)` | Unique: `{AssetId}:{PeriodNumber}:{FrequencyMonths}` |
| `PostedBy` | `Guid` | Usuario |
| `PostedAt` | `DateTime` | UTC |
| `Notes` | `string?` | Observaciones |

#### `AssetValueAdjustment`
Modificación formal del valor contable (revaluación o deterioro), con recálculo prospectivo.

| Propiedad | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner |
| `AssetId` | `Guid` | FK → Asset |
| `FinanceBookId` | `Guid` | FK → AssetFinanceBook |
| `AdjustmentType` | `enum` | `Revaluation`, `Impairment` |
| `PreviousNetBookValue` | `decimal(18,4)` | Valor neto antes |
| `AdjustmentAmount` | `decimal(18,4)` | Delta (±) |
| `NewNetBookValue` | `decimal(18,4)` | Valor neto resultante |
| `Reason` | `string` | Justificación obligatoria |
| `EffectiveDate` | `DateTime` | Fecha efectiva (UTC) |
| `ApprovedBy` | `Guid` | Usuario aprobador |
| `ApprovedAt` | `DateTime` | UTC |
| `CreatedAt` | `DateTime` | UTC |

#### `AssetDisposal`
Registro inmutable de fin de vida contable y operativa.

| Propiedad | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner |
| `AssetId` | `Guid` | FK → Asset (único) |
| `DisposalType` | `enum` | `Scrapped`, `Sold`, `Lost`, `Donated`, `Transferred` |
| `DisposalDate` | `DateTime` | Fecha baja (UTC) |
| `NetBookValueAtDisposal` | `decimal(18,4)` | Valor neto al momento |
| `ProceedsAmount` | `decimal(18,4)` | Monto recuperado |
| `GainLossAmount` | `decimal(18,4)` | Ganancia/pérdida |
| `Reason` | `string` | Motivo obligatorio |
| `DocumentReference` | `string?` | Ref. documento soporte |
| `ApprovedBy` | `Guid` | Usuario aprobador |
| `ApprovedAt` | `DateTime` | UTC |
| `CreatedAt` | `DateTime` | UTC |

#### `AssetCustodyTransfer`
Asignación y transferencia formal de custodia/responsabilidad.

| Propiedad | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner |
| `AssetId` | `Guid` | FK → Asset |
| `FromEmployeeId` | `Guid?` | Custodio anterior |
| `ToEmployeeId` | `Guid` | Nuevo custodio |
| `FromDepartmentId` | `Guid?` | Depto anterior |
| `ToDepartmentId` | `Guid?` | Nuevo depto |
| `TransferDate` | `DateTime` | Fecha efectiva (UTC) |
| `TransferType` | `enum` | `Assignment`, `Transfer`, `Return`, `Relocation` |
| `Reason` | `string` | Motivo |
| `DocumentUrl` | `string?` | URL acta digitalizada |
| `SignedByFrom` | `Guid?` | Firma saliente |
| `SignedByTo` | `Guid?` | Firma entrante |
| `CreatedBy` | `Guid` | Usuario registra |
| `CreatedAt` | `DateTime` | UTC |

#### `AssetRepairCapitalization`
Extensión de órdenes de mantenimiento para clasificar costos como CAPEX.

| Propiedad | Tipo | Descripción |
|---|---|---|
| `Id` | `Guid` | PK |
| `TenantId` | `Guid` | Tenant owner |
| `MaintenanceOrderId` | `Guid` | FK → MaintenanceOrder (único) |
| `AssetId` | `Guid` | FK → Asset (denormalizado) |
| `CapitalizedAmount` | `decimal(18,4)` | Monto capitalizado |
| `NewUsefulLifeMonths` | `int?` | Nueva vida útil total |
| `EffectiveDate` | `DateTime` | Fecha capitalización (UTC) |
| `ApprovedBy` | `Guid` | Usuario aprobador |
| `ApprovedAt` | `DateTime` | UTC |
| `CreatedAt` | `DateTime` | UTC |

---

## Enumeraciones

```csharp
public enum DepreciationMethod
{
    StraightLine = 1,
    DoubleDeclining = 2,
    WrittenDownValue = 3,
    Manual = 4
}

public enum ValueAdjustmentType
{
    Revaluation = 1,  // Subida de valor
    Impairment = 2    // Deterioro / baja de valor
}

public enum DisposalType
{
    Scrapped = 1,
    Sold = 2,
    Lost = 3,
    Donated = 4,
    Transferred = 5
}

public enum CustodyTransferType
{
    Assignment = 1,   // Alta inicial
    Transfer = 2,     // Cambio de custodio
    Return = 3,       // Devolución a almacén/central
    Relocation = 4    // Cambio de ubicación/depto sin cambio custodio
}
```

---

## Reglas principales

1. **Independencia Operativa y Financiera**: El control financiero es configurable por tenant. Un activo puede existir físicamente sin requerir cálculos de depreciación si el tenant no lo activa.
2. **Métodos de Depreciación soportados en V1**:
   - *Línea Recta (Straight Line)*: Amortización constante a lo largo de los meses de vida útil.
   - *Saldo Decreciente Doble (Double Declining Balance)*: Depreciación acelerada sobre el valor residual en libros.
   - *Valor Neto en Libros / Cuota Fija (Written Down Value)*: Porcentaje fijo anual sobre el valor neto remanente.
   - *Manual*: Cronograma provisto explícitamente por el usuario financiero.
3. **Invariante de Valor Contable**:
   $$\text{Valor Neto en Libros} = \text{Costo Adquisición} + \text{Mejoras Capitalizadas} \pm \text{Ajustes de Valor} - \text{Depreciación Acumulada}$$
   El valor neto nunca puede ser inferior al valor residual estipulado.
4. **Inmutabilidad de Asientos de Depreciación**: Toda cuota devengada y aplicada no se edita directamente; las correcciones o revaluaciones generan ajustes prospectivos en las cuotas futuras.
5. **Capitalización de Mantenimiento**: Solo órdenes completadas con piezas e insumos verificados pueden marcarse como capitalizables (`IsCapitalized = true`). Al capitalizarse, el valor de adquisición/base del activo se incrementa con el costo de la reparación.
6. **Baja y Desincorporación (`AssetDisposal`)**:
   - Al registrar una baja aprobada, el activo pasa de inmediato a estado terminal (`Disposed` / `Scrapped`).
   - Se suspende de forma automática cualquier generación futura de cuotas de depreciación.
   - No se permiten nuevas órdenes de mantenimiento preventivo ni tareas operativas para dicho activo.
7. **Trazabilidad de Custodia**: Todo cambio de responsable o ubicación física genera un evento inmutable con usuario, fecha, motivo y soporte de acta digitalizada.
8. **Tratamiento Prospectivo**: Cualquier mejora capitalizada, revaluación o deterioro recalcula únicamente las cuotas futuras no devengadas; las cuotas históricas permanecen inmutables.
9. **Idempotencia**: `AssetDepreciationEntry.IdempotencyKey` único por `(AssetId, PeriodNumber, FrequencyMonths)` evita doble devengo.

---

## API Resumida

Base `/api/v1`:

### Perfil Financiero
- `GET    /assets/{id}/finance-profile` — Consulta libro financiero
- `PUT    /assets/{id}/finance-profile` — Crea/actualiza libro financiero
- `DELETE /assets/{id}/finance-profile` — Desactiva financiero (soft)

### Cronograma de Depreciación
- `GET    /assets/{id}/depreciation-schedules` — Lista paginada (proyectado + histórico)
- `POST   /assets/{id}/depreciation-schedules/generate` — Genera/recalcula schedule completo
- `POST   /assets/{id}/depreciation-schedules/recalculate` — Recalcula prospectivo desde fecha

### Devengo de Cuotas
- `POST   /assets/{id}/depreciation-entries/post` — Devenga 1..N períodos (idempotente)
- `GET    /assets/{id}/depreciation-entries` — Historial de asientos posted

### Ajustes de Valor
- `POST   /assets/{id}/value-adjustments` — Registra revaluación/deterioro
- `GET    /assets/{id}/value-adjustments` — Historial de ajustes

### Bajas / Desincorporación
- `POST   /assets/{id}/disposal` — Procesa baja definitiva
- `GET    /assets/{id}/disposal` — Consulta baja (404 si no existe)

### Custodias
- `GET    /assets/{id}/custody-transfers` — Historial de transferencias
- `POST   /assets/{id}/custody-transfers` — Registra nueva transferencia/asignación

### Capitalización de Mantenimiento
- `POST   /maintenance-orders/{id}/capitalize` — Capitaliza costos de orden completada

---

## DTOs y Contratos (C#)

### Request/Response DTOs

```csharp
// Finance Profile
public record AssetFinanceBookDto(
    Guid Id,
    Guid AssetId,
    decimal AcquisitionCost,
    decimal ResidualValue,
    int UsefulLifeMonths,
    DepreciationMethod DepreciationMethod,
    decimal? DepreciationRatePct,
    int FrequencyMonths,
    DateTime StartDate,
    string Currency,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record UpsertFinanceBookRequest(
    decimal AcquisitionCost,
    decimal ResidualValue,
    int UsefulLifeMonths,
    DepreciationMethod DepreciationMethod,
    decimal? DepreciationRatePct,
    int FrequencyMonths,
    DateTime StartDate,
    string Currency = "MXN"
);

// Depreciation Schedule
public record AssetDepreciationScheduleDto(
    Guid Id,
    int PeriodNumber,
    DateTime PeriodStartDate,
    DateTime PeriodEndDate,
    decimal ProjectedDepreciationAmount,
    decimal ProjectedAccumulatedDepreciation,
    decimal ProjectedNetBookValue,
    bool IsPosted,
    Guid? PostedEntryId
);

public record GenerateScheduleRequest(
    bool ForceRegenerate = false,
    List<ManualScheduleItemDto>? ManualSchedule = null  // Solo para método Manual
);

public record ManualScheduleItemDto(
    int PeriodNumber,
    DateTime PeriodStartDate,
    DateTime PeriodEndDate,
    decimal DepreciationAmount
);

public record GenerateScheduleResponse(
    int PeriodsGenerated,
    DateTime LastPeriodEndDate
);

// Depreciation Entries (Posted)
public record AssetDepreciationEntryDto(
    Guid Id,
    int PeriodNumber,
    DateTime AccountingDate,
    decimal DepreciationAmount,
    decimal AccumulatedDepreciation,
    decimal NetBookValue,
    string IdempotencyKey,
    Guid PostedBy,
    DateTime PostedAt,
    string? Notes
);

public record PostDepreciationRequest(
    int PeriodsToPost,
    DateTime? AccountingDate = null,  // Default: hoy UTC
    string? Notes = null
);

public record PostDepreciationResponse(
    List<AssetDepreciationEntryDto> PostedEntries,
    int PeriodsPosted,
    decimal NewNetBookValue
);

// Value Adjustments
public record AssetValueAdjustmentDto(
    Guid Id,
    ValueAdjustmentType AdjustmentType,
    decimal PreviousNetBookValue,
    decimal AdjustmentAmount,
    decimal NewNetBookValue,
    string Reason,
    DateTime EffectiveDate,
    Guid ApprovedBy,
    DateTime ApprovedAt
);

public record CreateValueAdjustmentRequest(
    ValueAdjustmentType AdjustmentType,
    decimal AdjustmentAmount,
    string Reason,
    DateTime EffectiveDate
);

// Disposal
public record AssetDisposalDto(
    Guid Id,
    DisposalType DisposalType,
    DateTime DisposalDate,
    decimal NetBookValueAtDisposal,
    decimal ProceedsAmount,
    decimal GainLossAmount,
    string Reason,
    string? DocumentReference,
    Guid ApprovedBy,
    DateTime ApprovedAt
);

public record CreateDisposalRequest(
    DisposalType DisposalType,
    DateTime DisposalDate,
    decimal ProceedsAmount,
    string Reason,
    string? DocumentReference
);

// Custody Transfers
public record AssetCustodyTransferDto(
    Guid Id,
    Guid? FromEmployeeId,
    string? FromEmployeeName,
    Guid ToEmployeeId,
    string ToEmployeeName,
    Guid? FromDepartmentId,
    string? FromDepartmentName,
    Guid? ToDepartmentId,
    string? ToDepartmentName,
    DateTime TransferDate,
    CustodyTransferType TransferType,
    string Reason,
    string? DocumentUrl,
    Guid? SignedByFrom,
    Guid? SignedByTo,
    Guid CreatedBy,
    DateTime CreatedAt
);

public record CreateCustodyTransferRequest(
    Guid ToEmployeeId,
    Guid? ToDepartmentId,
    DateTime TransferDate,
    CustodyTransferType TransferType,
    string Reason,
    string? DocumentUrl,
    Guid? SignedByFrom,
    Guid? SignedByTo
);

// Maintenance Capitalization
public record AssetRepairCapitalizationDto(
    Guid Id,
    Guid MaintenanceOrderId,
    decimal CapitalizedAmount,
    int? NewUsefulLifeMonths,
    DateTime EffectiveDate,
    Guid ApprovedBy,
    DateTime ApprovedAt
);

public record CapitalizeMaintenanceRequest(
    int? NewUsefulLifeMonths,
    DateTime EffectiveDate
);
```

---

## Integraciones

| Módulo | Punto de Contacto |
|---|---|
| **M08 Árbol de Activos** | `Asset` enlaza `FinanceBook` (1:1 opcional) y estado `Disposed`/`Scrapped` terminal |
| **M12 Mantenimiento** | `MaintenanceOrder` → `AssetRepairCapitalization`; bloqueo creación si `Asset.State` terminal |
| **M13 Personal** | `Employee` como custodio en `AssetCustodyTransfer` |
| **M17 Propagación** | Evento `AssetFinanceStateChanged` para notificaciones (webhook/signalR) |
| **M20 Inventario** | Costos de partes en `MaintenanceOrder.Parts` alimentan capitalización |

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

## Persistencia y Migraciones

- Nuevas tablas en schema `tenant` con `TenantId` + query filter global.
- FK `Restrict` para integridad referencial.
- Índices tenant-scoped + unique constraints:
  - `AssetFinanceBook`: Unique `(TenantId, AssetId)`
  - `AssetDepreciationSchedule`: Unique `(TenantId, AssetId, PeriodNumber)`
  - `AssetDepreciationEntry`: Unique `(TenantId, IdempotencyKey)`
  - `AssetDisposal`: Unique `(TenantId, AssetId)`
- Soft delete (`IsDeleted`, `DeletedAt`) en `AssetFinanceBook`, `AssetDepreciationSchedule`, `AssetCustodyTransfer`, `AssetRepairCapitalization`.
- Entidades inmutables SIN soft delete: `AssetValueAdjustment`, `AssetDisposal`, `AssetDepreciationEntry`.
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
- **Logs estructurados**: CorrelationId, TenantId, AssetId, UserId en todas las mutaciones financieras.
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