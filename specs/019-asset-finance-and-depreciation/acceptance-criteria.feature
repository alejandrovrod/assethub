# Criterios de Aceptación BDD/Gherkin - Módulo Finanzas y Depreciación

## Feature: Gestión de Perfil Financiero

### Background:
```gherkin
Given un tenant con módulo financiero habilitado
And un usuario con rol "Administrador Financiero"
And un activo "CAM-001" (Compresor de Aire) en estado "Operativo"
```

### Scenario: Crear perfil financiero con método Línea Recta
```gherkin
When el usuario configura el perfil financiero con:
  | Campo                    | Valor          |
  | AcquisitionCost          | 150000         |
  | ResidualValue            | 15000          |
  | UsefulLifeMonths         | 60             |
  | DepreciationMethod       | StraightLine   |
  | FrequencyMonths          | 1              |
  | StartDate                | 2026-01-01     |
  | Currency                 | MXN            |
Then el sistema crea AssetFinanceBook vinculado al activo
And el campo MonthlyStraightLineAmount = 2250.0000
And el estado IsActive = true
```

### Scenario: Error si valor residual supera costo de adquisición
```gherkin
When el usuario intenta configurar:
  | AcquisitionCost | 100000 |
  | ResidualValue   | 120000 |
Then el sistema rechaza con código "residual_exceeds_acquisition"
And mensaje: "El valor residual no puede superar el costo de adquisición"
```

### Scenario: Actualizar perfil financiero recalcula schedule
```gherkin
Given un activo con perfil financiero StraightLine (costo 100000, residual 10000, vida 60)
And schedule generado con 60 períodos
When el usuario actualiza UsefulLifeMonths a 72
And confirma regeneración de schedule
Then el sistema regenera AssetDepreciationSchedule con 72 períodos
And la cuota mensual pasa a 1250.0000
And los períodos ya Posted permanecen inmutables
```

---

## Feature: Generación de Cronograma de Depreciación

### Scenario: Generar schedule Línea Recta
```gherkin
Given un activo con perfil: costo 120000, residual 20000, vida 48 meses, StraightLine
When se ejecuta POST /depreciation-schedules/generate
Then se crean 48 registros AssetDepreciationSchedule
And cada período tiene ProjectedDepreciationAmount = 2083.3333
And ProjectedNetBookValue período 48 = 20000 (residual)
And IsPosted = false para todos
```

### Scenario: Generar schedule Doble Saldo Decreciente
```gherkin
Given un activo con perfil: costo 100000, residual 5000, vida 60 meses, DoubleDeclining
When se genera el schedule
Then la tasa mensual = 2/60 = 0.03333...
And período 1: depreciación = 3333.33, neto = 96666.67
And período 2: depreciación = 3222.22, neto = 93444.44
And la depreciación disminuye cada período
And el último período ajusta para no bajar de residual
```

### Scenario: Generar schedule Valor en Libros (WDV) con tasa custom
```gherkin
Given un activo con perfil: costo 200000, residual 10000, vida 120 meses, WrittenDownValue
And DepreciationRatePct = 20% anual (1.6667% mensual)
When se genera el schedule
Then cada cuota = NetBookValue * 0.016667 (máximo hasta residual)
And la cuota disminuye progresivamente
```

### Scenario: Generar schedule Manual con cuotas personalizadas
```gherkin
Given un activo con perfil: DepreciationMethod = Manual
When se envía GenerateScheduleRequest con ManualSchedule:
  | PeriodNumber | PeriodStartDate | PeriodEndDate   | DepreciationAmount |
  | 1            | 2026-01-01      | 2026-01-31      | 5000               |
  | 2            | 2026-02-01      | 2026-02-28      | 4500               |
  | 3            | 2026-03-01      | 2026-03-31      | 4000               |
Then el sistema valida que suma cuotas = AcquisitionCost - ResidualValue
And crea 3 períodos con los montos exactos especificados
And ProjectedNetBookValue coincide con cálculo acumulado
```

### Scenario: Error al generar schedule Manual sin cuotas
```gherkin
Given un activo con método Manual
When se ejecuta generate sin ManualSchedule
Then falla con código "manual_schedule_required"
```

---

## Feature: Devengo de Cuotas (Posting)

### Scenario: Postear primera cuota mensual
```gherkin
Given un activo con schedule generado, período 1 pendiente
When se ejecuta POST /depreciation-entries/post con PeriodsToPost = 1
Then se crea AssetDepreciationEntry para período 1
And DepreciationAmount = cuota proyectada
And AccumulatedDepreciation = cuota
And NetBookValue = AcquisitionCost - cuota
And Schedule.IsPosted = true para período 1
And Schedule.PostedEntryId = Entry.Id
And response incluye NewNetBookValue actualizado
```

### Scenario: Postear múltiples cuotas en lote
```gherkin
Given un activo con 12 períodos pendientes
When se ejecuta post con PeriodsToPost = 3
Then se crean 3 AssetDepreciationEntry consecutivos
And cada uno con IdempotencyKey único
And response.PeriodsPosted = 3
```

### Scenario: Idempotencia - doble envío misma cuota
```gherkin
Given un activo con período 5 pendiente
When se POSTea períodos=1 (período 5) con IdempotencyKey "asset-123:5:1"
And se vuelve a POSTear períodos=1 con mismo IdempotencyKey
Then solo existe 1 AssetDepreciationEntry para período 5
And segunda llamada retorna 200 con entry existente (no duplica)
And response.PeriodsPosted = 1 (no suma doble)
```

### Scenario: Error al postear período ya devengado
```gherkin
Given un activo con período 3 ya Posted
When se intenta postear períodos=1 desde período 3
Then falla con código "period_already_posted"
```

### Scenario: Error al postear en activo dado de baja
```gherkin
Given un activo con AssetDisposal registrado (Disposed)
When se intenta postear cuotas
Then falla con código "asset_disposed"
And mensaje: "No se pueden devengar cuotas en activo dado de baja"
```

### Scenario: Fecha contable personalizada
```gherkin
Given un activo con período 1 pendiente
When se postea con AccountingDate = "2026-01-31T23:59:59Z"
Then el AssetDepreciationEntry.AccountingDate = fecha especificada
And PostedAt = ahora (UTC)
```

---

## Feature: Ajustes de Valor (Revaluación y Deterioro)

### Scenario: Revaluación positiva recalcula futuro
```gherkin
Given un activo con:
  | NetBookValue actual    | 40000 |
  | ResidualValue          | 5000  |
  | Períodos Posted        | 12    |
  | Períodos pendientes    | 36    |
  | Método                 | StraightLine |
When se registra ValueAdjustment:
  | AdjustmentType   | Revaluation |
  | AdjustmentAmount | +15000      |
  | Reason           | "Revaluación técnica por mejora de mercado" |
  | EffectiveDate    | 2026-07-01  |
Then se crea AssetValueAdjustment con NewNetBookValue = 55000
And los 12 períodos Posted NO cambian (inmutables)
And los 36 períodos pendientes recalculan:
  - Nueva base depreciable = 55000 - 5000 = 50000
  - Nueva cuota mensual = 50000 / 36 = 1388.89
And response incluye schedule actualizado
```

### Scenario: Deterioro (Impairment) respeta valor residual
```gherkin
Given un activo con NetBookValue = 12000, ResidualValue = 10000
When se intenta Impairment con AdjustmentAmount = -5000 (resultaría 7000)
Then falla con código "below_residual_value"
And mensaje: "El ajuste reduciría el valor neto por debajo del residual (10000)"
```

### Scenario: Deterioro válido hasta residual
```gherkin
Given un activo con NetBookValue = 12000, ResidualValue = 10000
When se registra Impairment AdjustmentAmount = -2000
Then se crea ajuste con NewNetBookValue = 10000
And schedule futuro recalcula con base 0 (ya en residual)
And cuotas futuras = 0
```

### Scenario: Error al ajustar activo sin perfil financiero
```gherkin
Given un activo SIN AssetFinanceBook
When se intenta crear ValueAdjustment
Then falla con código "finance_book_not_found"
```

---

## Feature: Capitalización de Órdenes de Mantenimiento

### Scenario: Capitalizar orden Completed extiende vida útil
```gherkin
Given un activo con:
  | NetBookValue       | 50000 |
  | UsefulLifeMonths   | 60    |
  | Períodos consumidos | 24   |
  | Períodos restantes | 36    |
And una MaintenanceOrder "MO-456" en estado Completed
  | LaborCost  | 8000  |
  | PartsCost  | 12000 |
  | Total      | 20000 |
When se ejecuta POST /maintenance-orders/MO-456/capitalize con:
  | NewUsefulLifeMonths | 84  |
  | EffectiveDate       | 2026-07-15 |
Then se crea AssetRepairCapitalization con CapitalizedAmount = 20000
And AssetFinanceBook.AcquisitionCost pasa a 170000 (150000 + 20000)
And UsefulLifeMonths actualizado a 84 (total, no adicional)
And schedule futuro (períodos 25-84) recalcula sobre nueva base
  - Nueva base = (150000+20000) - ResidualValue
  - Nueva cuota = nueva base / 60 períodos restantes
And la orden MO-456 queda marcada como capitalizada
```

### Scenario: Error al capitalizar orden no completada
```gherkin
Given una MaintenanceOrder en estado "InProgress"
When se intenta capitalizar
Then falla con código "order_not_completed"
And mensaje: "Solo órdenes Completed o Verified pueden capitalizarse"
```

### Scenario: Capitalización sin extender vida útil
```gherkin
Given activo con 36 períodos restantes
And orden Completed costo 15000
When se capitaliza SIN NewUsefulLifeMonths
Then AcquisitionCost incrementa en 15000
And vida útil total NO cambia (siguen 36 períodos restantes)
And cuota mensual aumenta proporcionalmente
```

---

## Feature: Baja / Desincorporación de Activos

### Scenario: Chatarrización (Scrapped) sin recuperación
```gherkin
Given un activo con NetBookValue = 8000, ResidualValue = 5000
When se registra Disposal:
  | DisposalType   | Scrapped |
  | DisposalDate   | 2026-08-01 |
  | ProceedsAmount | 0        |
  | Reason         | "Fin de vida útil, chatarrización certificada" |
Then se crea AssetDisposal con GainLossAmount = -8000 (pérdida total)
And Asset.State = "Scrapped" (terminal)
And AssetDepreciationSchedule futuros: IsDeleted = true (cancelados)
And ya NO se pueden postear cuotas
And ya NO se pueden crear órdenes de mantenimiento
```

### Scenario: Venta con ganancia
```gherkin
Given activo con NetBookValue = 25000
When se registra Disposal tipo Sold con ProceedsAmount = 35000
Then GainLossAmount = +10000 (ganancia)
And Asset.State = "Disposed"
```

### Scenario: Pérdida/Robo con recuperación de seguro
```gherkin
Given activo con NetBookValue = 40000
When se registra Disposal tipo Lost con ProceedsAmount = 30000 (seguro)
Then GainLossAmount = -10000 (pérdida neta)
And DocumentReference = "Poliza SEG-2026-001234"
```

### Scenario: Error al dar de baja activo ya dado de baja
```gherkin
Given un activo con AssetDisposal existente
When se intenta crear otro Disposal
Then falla con código "already_disposed"
```

### Scenario: Bloqueo operacional tras baja
```gherkin
Given un activo en estado "Disposed"
When se intenta:
  - Crear MaintenanceOrder
  - Crear WorkTask
  - Registrar consumo de inventario (AssetMaterial)
  - Postear depreciación
  - Registrar ValueAdjustment
Then todas fallan con código "asset_disposed"
```

---

## Feature: Transferencias de Custodia

### Scenario: Asignación inicial de custodio
```gherkin
Given un activo SIN custodio asignado (FromEmployeeId = null)
When se registra CustodyTransfer:
  | ToEmployeeId   | EMP-001 |
  | TransferType   | Assignment |
  | Reason         | "Asignación inicial a operador" |
  | TransferDate   | 2026-01-15 |
Then se crea registro con FromEmployeeId = null
And TransferType = Assignment
And historial muestra 1 entrada
```

### Scenario: Transferencia entre empleados
```gherkin
Given activo asignado a EMP-001 (Juan Pérez)
When se registra transferencia a EMP-002 (María García):
  | FromEmployeeId | EMP-001 |
  | ToEmployeeId   | EMP-002 |
  | TransferType   | Transfer |
  | Reason         | "Rotación de turnos" |
  | DocumentUrl    | "https://docs.assethub.com/actas/ACT-2026-001.pdf" |
  | SignedByFrom   | EMP-001 |
  | SignedByTo     | EMP-002 |
Then se crea registro con ambos firmantes
And historial muestra 2 entradas cronológicas
And GET /custody-transfers retorna ambas con nombres de empleados
```

### Scenario: Devolución a almacén central
```gherkin
Given activo asignado a EMP-003
When se registra Return:
  | ToEmployeeId | EMP-ALMACEN |
  | TransferType | Return |
  | Reason       | "Activo retorna a stock central por reasignación" |
Then TransferType = Return
And FromEmployeeId = EMP-003
```

### Scenario: Relocation sin cambio de custodio
```gherkin
Given activo con custodio EMP-001 en Planta Norte
When se registra Relocation:
  | FromDepartmentId | PLANTA-NORTE |
  | ToDepartmentId   | PLANTA-SUR   |
  | TransferType     | Relocation |
  | ToEmployeeId     | EMP-001      |
Then FromEmployeeId = ToEmployeeId = EMP-001
And TransferType = Relocation
And historial refleja cambio de departamento
```

---

## Feature: Cálculos de Depreciación - Casos Edge

### Scenario: Ajuste en última cuota por redondeo (StraightLine)
```gherkin
Given activo: costo 100000, residual 10000, vida 33 meses, StraightLine
  # 90000 / 33 = 2727.2727... * 33 = 89999.9991 (diferencia 0.0009)
When se genera schedule completo
And se postean todas las cuotas
Then la última cuota (período 33) se ajusta a 2727.2737
And NetBookValue final = 10000 exacto (residual)
And AccumulatedDepreciation final = 90000 exacto
```

### Scenario: Cambio de método vía revaluación
```gherkin
Given activo con método StraightLine, 12 períodos posted, 48 pendientes
When se registra ValueAdjustment Revaluation (cambio de base)
And se especifica recálculo con método DoubleDeclining para futuro
  # Nota: en V1 el método no cambia, solo la base. Cambio de método = V2
Then el método permanece StraightLine
And solo la base depreciable cambia prospectivamente
```

### Scenario: Depreciación con frecuencia trimestral
```gherkin
Given activo con FrequencyMonths = 3 (trimestral), vida 60 meses = 20 períodos
When se genera schedule
Then se crean 20 períodos (cada 3 meses)
And PeriodEndDate - PeriodStartDate = 3 meses
And PostDepreciationRequest con PeriodsToPost = 1 postea 1 trimestre
```

---

## Feature: Permisos y Seguridad

### Scenario: Usuario sin permiso finance.read no ve pestaña Finanzas
```gherkin
Given usuario con rol "Técnico" (solo assets.read, assets.custody.read)
When accede a GET /assets/{id}/finance-profile
Then respuesta 403 Forbidden
And código "insufficient_permissions"
```

### Scenario: Usuario con finance.write pero sin depreciation.post no puede postear
```gherkin
Given usuario con assets.finance.write PERO SIN assets.depreciation.post
When intenta POST /depreciation-entries/post
Then respuesta 403 con código "insufficient_permissions"
```

### Scenario: Auditor contable solo lectura
```gherkin
Given usuario con rol "Auditor Contable" (finance.read, depreciation.read, disposal.read)
When intenta PUT /finance-profile o POST /disposal
Then 403 en ambos
When consulta GET /finance-profile, GET /depreciation-entries, GET /disposal
Then 200 OK con datos
```

---

## Feature: Multi-Tenant Aislamiento

### Scenario: Tenant A no ve datos de Tenant B
```gherkin
Given Tenant A tiene activo "AST-A-001" con finance book
And Tenant B tiene activo "AST-B-001" con finance book
When usuario Tenant A consulta GET /assets/AST-B-001/finance-profile
Then respuesta 404 (no 200 con datos de otro tenant)
And query filter por TenantId aplica automáticamente
```

### Scenario: IdempotencyKey incluye TenantId implícito
```gherkin
Given Tenant A y Tenant B tienen activo con mismo ID (imposible por query filter)
# En realidad IDs son únicos globalmente, pero IdempotencyKey incluye AssetId
When Tenant A postea cuota para su activo
Then IdempotencyKey = "asset-A:5:1" 
And Tenant B no puede colisionar aunque use mismo patrón
```

---

## Feature: Reportes y Consultas Avanzadas

### Scenario: Resumen financiero para dashboard
```gherkin
Given activo con perfil financiero activo, 12 cuotas posted, 36 pendientes
When se consulta GET /assets/{id}/finance-summary
Then response incluye:
  | Campo                     | Valor Esperado              |
  | currentNetBookValue       | AcquisitionCost - AccumDep  |
  | accumulatedDepreciation   | Suma entries posted         |
  | depreciationThisPeriod    | Última entry.DepreciationAmount |
  | nextDepreciationDate      | Próximo schedule.PeriodStartDate |
  | remainingPeriods          | Count schedule !IsPosted    |
  | hasFinanceBook            | true                        |
  | isDisposed                | false                       |
```

### Scenario: Consulta schedule con filtro solo pendientes
```gherkin
Given activo con 60 períodos totales, 15 posted, 45 pendientes
When GET /depreciation-schedules?onlyPending=true
Then response.items.length = 45
And todos tienen IsPosted = false
```

---

## Feature: Integración con Mantenimiento

### Scenario: Capitalización dispara evento para notificaciones
```gherkin
Given orden MO-789 Completed con costo 25000
When se capitaliza exitosamente
Then se emite evento DomainEvent: MaintenanceOrderCapitalized
  | Propiedad          | Valor           |
  | MaintenanceOrderId | MO-789          |
  | AssetId            | AST-001         |
  | CapitalizedAmount  | 25000           |
  | NewAcquisitionCost | 175000          |
And handlers pueden enviar notificación a contabilidad
```

### Scenario: Crear orden mantenimiento para activo disposed falla en command handler
```gherkin
Given activo en estado Disposed
When CreateMaintenanceOrderCommand con AssetId = disposed
Then handler valida estado y lanza DomainException "asset_disposed"
And comando falla antes de persistir
```

---

## Definición de Done (DoD) por Historia

| Historia | Unit Tests | Integration Tests | Contract Tests | E2E Tests | Docs |
|---|---|---|---|---|---|
| Finance Profile CRUD | ✅ | ✅ | ✅ | ✅ | OpenAPI |
| Generate Schedule (all methods) | ✅ | ✅ | ✅ | ✅ | Algoritmos |
| Post Depreciation (idempotent) | ✅ | ✅ | ✅ | ✅ | Idempotencia |
| Value Adjustment (prospective) | ✅ | ✅ | ✅ | ✅ | Reglas |
| Disposal (terminal state) | ✅ | ✅ | ✅ | ✅ | Bloqueos |
| Custody Transfer | ✅ | ✅ | ✅ | ✅ | Historial |
| Maintenance Capitalization | ✅ | ✅ | ✅ | ✅ | Integración |
| Permissions | ✅ | ✅ | ✅ | ✅ | Matrix |
| Multi-tenant isolation | ✅ | ✅ | ✅ | - | Arquitectura |

---

## Datos de Prueba (Test Fixtures)

### Activo Base para Tests
```json
{
  "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "code": "TEST-ASSET-001",
  "name": "Activo de Prueba Finanzas",
  "state": "Operativo",
  "assetTemplateId": "template-compresor"
}
```

### Perfil Financiero Estándar (StraightLine)
```json
{
  "acquisitionCost": 100000,
  "residualValue": 10000,
  "usefulLifeMonths": 60,
  "depreciationMethod": "StraightLine",
  "frequencyMonths": 1,
  "startDate": "2026-01-01T00:00:00Z",
  "currency": "MXN"
}
```

### Orden de Mantenimiento para Capitalización
```json
{
  "id": "mo-cap-001",
  "assetId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "state": "Completed",
  "laborCost": 5000,
  "parts": [
    { "catalogItemId": "part-001", "quantity": 2, "unitCost": 3000 },
    { "catalogItemId": "part-002", "quantity": 1, "unitCost": 4000 }
  ]
}
# Total = 5000 + 6000 + 4000 = 15000
```

---

## Matriz de Trazabilidad Requisitos - Casos de Prueba

| Requisito | Casos Gherkin Relacionados |
|---|---|
| REQ-FIN-001 | Crear perfil, Validaciones |
| REQ-FIN-002 | Generar schedule (4 métodos), Manual, Frecuencia |
| REQ-FIN-003 | Postear (simple, lote, idempotente, fecha custom, errores) |
| REQ-FIN-004 | Revaluación, Impairment, Respeto residual, Inmutabilidad posted |
| REQ-FIN-005 | Capitalizar (extiende vida, no extiende, errores estado) |
| REQ-FIN-006 | Disposal (tipos, ganancia/pérdida, bloqueos operacionales) |
| REQ-FIN-007 | Custodia (asignación, transferencia, return, relocation, firmas) |
| RULE-FIN-001 | Impairment bajo residual, ajuste última cuota |
| RULE-FIN-002 | Postear tras disposal |
| RULE-FIN-003 | Capitalizar solo Completed/Verified |
| RULE-FIN-004 | Inmutabilidad Adjustment/Disposal/Entry |
| RULE-FIN-005 | Prospectivo en ajustes/capitalización |
| RULE-FIN-006 | Unique FinanceBook por Asset |
| RULE-FIN-007 | IdempotencyKey único |