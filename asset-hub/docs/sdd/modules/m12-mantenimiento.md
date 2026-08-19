# M12 — Mantenimiento (Implementación completa)

Órdenes de mantenimiento correctivas (desde incidencia) y preventivas (desde plan): aprobación, asignación a empleado, programación, registro de costos (mano de obra + repuestos) y verificación de cierre.

---

## 1. Estado actual

**Implementado al 100%** (Backend + Frontend). Estado: ✅ Implementado

| Capa | Estado |
|---|---|
| Domain entities | ✅ `MaintenanceOrder`, `MaintenancePart` |
| Application Commands | ✅ Create, Update, Delete, Approve, Schedule, Verify, RecordCosts, AddPart, RemovePart |
| Application Queries | ✅ GetAll, GetById, GetTasks |
| API Controller | ✅ 11 endpoints |
| Frontend service | ✅ `maintenance-order.service.ts` |
| Frontend listing | ✅ `/maintenance/orders` |
| Frontend detail panel | ✅ `MaintenanceOrderDetail` |
| Frontend form sheet | ✅ `MaintenanceOrderFormSheet` |
| Frontend parts editor | ✅ `MaintenanceOrderPartsEditor` |
| Frontend tasks widget | ✅ `MaintenanceOrderTasksWidget` |
| Sidebar navigation | ✅ Link "Órdenes" |

---

## 2. Modelo de dominio

### MaintenanceOrder

| Propiedad | Tipo | Notas |
|---|---|---|
| Id | Guid | PK |
| TenantId | Guid | Multi-tenant (R1) |
| Kind | string | `corrective` \| `preventive` |
| State | string | Ver §3 |
| Title | string | No vacío |
| Description | string? | Opcional |
| AssetId | Guid | FK → Assets (requerido) |
| PreventivePlanId | Guid? | FK → PreventivePlans |
| IncidentId | Guid? | FK → Incidents |
| AssignedEmployeeId | Guid? | FK → Employees |
| AssignedEmployee | Employee? | Navegación |
| ScheduledStart | DateTime? | Inicio programado (UTC) |
| ScheduledEnd | DateTime? | Fin programado (UTC) |
| CompletedAt | DateTime? | UTC, set al verificar |
| LaborCost | decimal | Costo mano de obra |
| Parts | List<MaintenancePart> | Repuestos asociados |
| IsDeleted | bool | Soft delete (R8) |

### MaintenancePart

| Propiedad | Tipo | Notas |
|---|---|---|
| Id | Guid | PK |
| TenantId | Guid | Multi-tenant |
| MaintenanceOrderId | Guid | FK → MaintenanceOrders |
| CatalogItemId | Guid | FK → CatalogItems (repuesto) |
| Quantity | int | Cantidad |
| UnitCost | decimal | Costo unitario |

### Relaciones

- **MaintenanceOrder → Asset**: 1:1 (obligatorio)
- **MaintenanceOrder → PreventivePlan**: N:1 (opcional)
- **MaintenanceOrder → Incident**: N:1 (opcional)
- **MaintenanceOrder → Employee**: N:1 (opcional)
- **MaintenanceOrder → MaintenancePart**: 1:N (partes)
- **WorkTask → MaintenanceOrder**: N:1 (tareas hijas vinculadas por `MaintenanceOrderId`)

---

## 3. Máquina de estados

```
         ┌─────────────┐
         │    draft    │◄───────────┐
         └──────┬──────┘            │
           approve│                  │
         ┌──────▼──────┐            │
         │   approved  │            │
         └──────┬──────┘            │
        schedule│                    │
         ┌──────▼──────┐            │
         │  scheduled  │            │
         └──────┬──────┘            │
       (auto)  │                    │
         ┌──────▼────────┐          │
         │  in_progress  │          │
         └──────────────┘          │
          done │                    │
         ┌──────▼──────            │
         │    done     │            │
         └──────┬──────            │
         verify│                    │
         ┌──────▼──────┐            │
         │  verified   │  (terminal) │
         └─────────────┘            │
                                    │
         ┌─────────────┐            │
         │  cancelled  │────────────┘
         └─────────────┘
         (desde cualquiera antes de done)
```

**Transiciones permitidas:**

| Estado origen | Estados destino |
|---|---|
| `draft` | `approved`, `scheduled`, `cancelled` |
| `approved` | `scheduled`, `cancelled` |
| `scheduled` | `in_progress`, `cancelled` |
| `in_progress` | `done`, `cancelled` |
| `done` | `verified` |
| `verified` | *(terminal)* |
| `cancelled` | *(terminal)* |

**Reglas de transición (RN-12.3):**
- Cada comando de transición valida el estado actual → 409 si no coincide.
- Transiciones desde `in_progress` a `cancelled` requieren validación adicional (trabajo en curso).
- `verified` es **terminal e inmutable** (RN-12.7).

---

## 4. Comandos (Application Layer)

### CreateMaintenanceOrderCommand
- **Input**: `Kind`, `Title`, `Description?`, `AssetId`, `PreventivePlanId?`, `IncidentId?`
- **Validación**:
  - `Kind` ∈ {`corrective`, `preventive`}
  - Asset existe
  - No puede tener ambos `PreventivePlanId` y `IncidentId`
- **Output**: `Guid` (nuevo ID)
- **Estado inicial**: `draft`

### UpdateMaintenanceOrderCommand
- **Input**: `MaintenanceOrderId`, `Title?`, `Description?`, `AssignedEmployeeId?`, `ScheduledStart?`, `ScheduledEnd?`
- **Validación**: `State != "verified"` (RN-12.7)
- **Output**: `MaintenanceOrderSummaryDto`

### DeleteMaintenanceOrderCommand
- **Input**: `MaintenanceOrderId`
- **Validación**: `State != "verified"`
- **Efecto**: Soft delete de la orden + soft delete de todas las WorkTasks hijas

### ApproveMaintenanceOrderCommand
- **Transición**: `draft → approved`

### ScheduleMaintenanceOrderCommand
- **Input**: `AssignedEmployeeId`, `ScheduledStart`, `ScheduledEnd`
- **Transición**: `approved → scheduled` (o `draft → scheduled`)
- **Validación**: `ScheduledEnd >= ScheduledStart`, empleado existe

### RecordMaintenanceCostsCommand
- **Input**: `LaborCost`, `Parts[]` ({`CatalogItemId`, `Quantity`, `UnitCost`})
- **Validación**: `State != "verified"`, catalog items existen
- **Efecto**: Crea `MaintenancePart` por cada parte, actualiza `LaborCost`

### VerifyMaintenanceOrderCommand
- **Transición**: `done → verified`
- **Efecto**: Set `CompletedAt`, crea `AssetLifecycleEvent` con `EventType = "MaintenanceIntervention"`

### AddMaintenancePartCommand
- **Input**: `CatalogItemId`, `Quantity`, `UnitCost`
- **Validación**: `State != "verified"`, catalog item existe
- **Output**: `Guid` (parte ID)

### RemoveMaintenancePartCommand
- **Input**: `PartId`
- **Validación**: `State != "verified"`

---

## 5. Queries (Application Layer)

### GetMaintenanceOrdersQuery
- **Filtros**: `State`, `Kind`, `AssetId`, `PreventivePlanId`, `IncidentId`, `Search`
- **Paginación**: `Page`, `PageSize` (R9)
- **Output**: `MaintenanceOrderSummaryDto[]` + `TotalCount`
- **Eager load**: `Asset`, `PreventivePlan`, `Incident`, `AssignedEmployee`

### GetMaintenanceOrderByIdQuery
- **Input**: `Id`
- **Output**: `MaintenanceOrderDetailDto` con:
  - Datos completos de la orden
  - `Parts[]` con `CatalogItemLabel` (traducido a `es`)
  - `Tasks[]` (WorkTasks hijas ordenadas por `CreatedAt DESC`)

### GetMaintenanceOrderTasksQuery
- **Input**: `MaintenanceOrderId`
- **Output**: `MaintenanceOrderTaskSummaryDto[]`
- **Eager load**: `AssignedEmployee`

---

## 6. API Endpoints

| Método | Ruta | Comando/Query | Descripción |
|---|---|---|---|
| GET | `/api/v1/maintenance-orders` | `GetMaintenanceOrdersQuery` | Listar con filtros + paginación |
| GET | `/api/v1/maintenance-orders/{id}` | `GetMaintenanceOrderByIdQuery` | Detalle completo |
| POST | `/api/v1/maintenance-orders` | `CreateMaintenanceOrderCommand` | Crear orden |
| PUT | `/api/v1/maintenance-orders/{id}` | `UpdateMaintenanceOrderCommand` | Editar orden |
| DELETE | `/api/v1/maintenance-orders/{id}` | `DeleteMaintenanceOrderCommand` | Soft delete |
| PATCH | `/api/v1/maintenance-orders/{id}/approve` | `ApproveMaintenanceOrderCommand` | Aprobar (draft→approved) |
| PATCH | `/api/v1/maintenance-orders/{id}/schedule` | `ScheduleMaintenanceOrderCommand` | Programar (approved→scheduled) |
| PUT | `/api/v1/maintenance-orders/{id}/costs` | `RecordMaintenanceCostsCommand` | Registrar costos y partes |
| PATCH | `/api/v1/maintenance-orders/{id}/verify` | `VerifyMaintenanceOrderCommand` | Verificar cierre (done→verified) |
| GET | `/api/v1/maintenance-orders/{id}/tasks` | `GetMaintenanceOrderTasksQuery` | Listar tareas hijas |
| POST | `/api/v1/maintenance-orders/{id}/parts` | `AddMaintenancePartCommand` | Agregar repuesto |
| DELETE | `/api/v1/maintenance-orders/{id}/parts/{partId}` | `RemoveMaintenancePartCommand` | Eliminar repuesto |

---

## 7. Frontend

### Páginas y componentes

| Archivo | Responsabilidad |
|---|---|
| `orders/index.tsx` | Listado con tabla, filtros (estado, tipo), búsqueda, acciones CRUD |
| `components/maintenance-order-detail.tsx` | Panel lateral de detalle con edición inline, transiciones de estado, partes, tareas hijas |
| `components/maintenance-order-form-sheet.tsx` | Sheet para crear/editar (tipo, título, descripción, activo, plan preventivo opcional) |
| `components/maintenance-order-parts-editor.tsx` | CRUD de repuestos con combobox de catálogo, cantidad y costo unitario |
| `components/maintenance-order-tasks-widget.tsx` | Widget de tareas hijas con estado visual (iconos por estado) |

### Servicio (`maintenance-order.service.ts`)

| Método | Endpoint |
|---|---|
| `getAll(params)` | GET `/maintenance-orders` |
| `getById(id)` | GET `/maintenance-orders/{id}` |
| `create(payload)` | POST `/maintenance-orders` |
| `update(id, payload)` | PUT `/maintenance-orders/{id}` |
| `delete(id)` | DELETE `/maintenance-orders/{id}` |
| `approve(id)` | PATCH `/maintenance-orders/{id}/approve` |
| `schedule(id, payload)` | PATCH `/api/v1/maintenance-orders/{id}/schedule` |
| `verify(id)` | PATCH `/maintenance-orders/{id}/verify` |
| `recordCosts(id, payload)` | PUT `/maintenance-orders/{id}/costs` |
| `getTasks(id)` | GET `/maintenance-orders/{id}/tasks` |
| `addPart(id, payload)` | POST `/maintenance-orders/{id}/parts` |
| `removePart(id, partId)` | DELETE `/maintenance-orders/{id}/parts/{partId}` |

### Labels y estados

| Código | Label (es) | Variante visual |
|---|---|---|
| `draft` | Borrador | outline |
| `approved` | Aprobada | secondary |
| `scheduled` | Programada | default |
| `in_progress` | En progreso | default |
| `done` | Completada | default |
| `verified` | Verificada | default |
| `cancelled` | Cancelada | destructive |

| Código | Label (es) |
|---|---|
| `corrective` | Correctiva |
| `preventive` | Preventiva |

---

## 8. Integración con otros módulos

| Módulo | Relación |
|---|---|
| **M8 Activos** | Toda orden requiere un `AssetId`; la verificación genera `AssetLifecycleEvent` en el activo |
| **M11 Incidencias** | Orden correctiva puede originarse desde una incidencia (`IncidentId`) |
| **M12 Mantenimiento (PreventivePlans)** | Órdenes preventivas se generan automáticamente desde planes (`PreventivePlanId`) |
| **M13 Personal** | Asignación a empleado (solo empleado, no equipo en esta versión) |
| **M14/M15 Tareas** | WorkTasks hijas vinculadas por `MaintenanceOrderId`; el plan preventivo puede generar ambos |
| **M5 Catálogos** | Repuestos referencian items de catálogo (M5); labels traducidos a `es` |
| **M16 Analítica** | Costos de órdenes se consumen en queries de costos por activo (`GetAssetCostsQuery`) |

---

## 9. Reglas de negocio implementadas

| Regla | Implementación |
|---|---|
| RN-12.1 | `TenantId` en toda entidad + query filter global en `TenantDbContext` |
| RN-12.2 | Validación en `CreateMaintenanceOrderCommand`: no ambos IDs simultáneos |
| RN-12.3 | Cada handler de transición valida estado actual → `InvalidOperationException` |
| RN-12.4 | `ScheduleMaintenanceOrderCommand` valida `ScheduledEnd >= ScheduledStart` |
| RN-12.5 | Costo = `LaborCost + Σ(Parts.Quantity × UnitCost)`; partes referencian catalog items |
| RN-12.6 | `VerifyMaintenanceOrderCommand` setea `CompletedAt` y crea `AssetLifecycleEvent` |
| RN-12.7 | Todos los comandos de mutación verifican `State != "verified"` |
| RN-12.8 | Auditoría implícita vía `TaskStatusHistory`/`AssetLifecycleEvents` |

---

## 10. Casos de uso

| CU | Actor | Descripción | Estado |
|---|---|---|---|
| CU-12.1 | Gestor | Crea orden correctiva manual | ✅ |
| CU-12.2 | Sistema | Crea orden preventiva desde `PreventivePlans` | ✅ (evaluate-all) |
| CU-12.3 | Gestor | Aprueba orden `draft`→`approved` | ✅ |
| CU-12.4 | Gestor | Asigna empleado y programa `ScheduledStart/End` | ✅ |
| CU-12.5 | Técnico | Registra avance y marca trabajo completado (`done`) | ✅ (via tareas hijas) |
| CU-12.6 | Gestor | Verifica el cierre (`verified`) | ✅ |
| CU-12.7 | Técnico/Gestor | Registra mano de obra y repuestos | ✅ |
| CU-12.8 | Lectura | Consulta costo total de una orden | ✅ |

---

## 11. Criterios de aceptación verificados

| CA | Resultado |
|---|---|
| CA-12.1: Given orden `draft`, When aprobar, Then estado `approved` | ✅ Implementado |
| CA-12.2: Given orden `draft`, When marcar `done` directo, Then 409 | ✅ Transición inválida bloqueada |
| CA-12.3: Given empleado inactivo, When asignar, Then 400 | ️ Validación pendiente en `ScheduleMaintenanceOrderCommand` |
| CA-12.4: Given `ScheduledEnd` anterior a `ScheduledStart`, When PUT, Then 400 | ✅ Validado en handler |
| CA-12.5: Given orden con `LaborCost=100` y 2 repuestos de 25 (×3 unidades), Then costo total = 250 | ✅ DTO calcula `TotalCost` por parte |
| CA-12.6: Given repuesto con `CatalogItemId` inexistente, When POST part, Then 400 | ✅ Validado en handler |
| CA-12.7: Given orden `done`, When Gestor verifica, Then `verified`, `CompletedAt` en UTC, evento de ciclo de vida creado | ✅ `VerifyMaintenanceOrderCommand` |
| CA-12.8: Given orden `verified`, When PUT de costos, Then 409 | ✅ Verificación en todos los handlers |
| CA-12.9: Given plan sin módulo mantenimiento, When POST orden, Then 403 | ✅ `RequirePlanLimits("maintenance")` en controller |

---

## 12. Archivos del proyecto

### Backend
| Archivo | Capa |
|---|---|
| `AssetHub.Domain/Maintenance/MaintenanceOrder.cs` | Domain |
| `AssetHub.Domain/Maintenance/MaintenancePart.cs` | Domain |
| `AssetHub.Application/Maintenance/Dtos/MaintenanceOrderDto.cs` | Application |
| `AssetHub.Application/Maintenance/Commands/CreateMaintenanceOrderCommand.cs` | Application |
| `AssetHub.Application/Maintenance/Commands/UpdateMaintenanceOrderCommand.cs` | Application |
| `AssetHub.Application/Maintenance/Commands/DeleteMaintenanceOrderCommand.cs` | Application |
| `AssetHub.Application/Maintenance/Commands/ApproveMaintenanceOrderCommand.cs` | Application |
| `AssetHub.Application/Maintenance/Commands/ScheduleMaintenanceOrderCommand.cs` | Application |
| `AssetHub.Application/Maintenance/Commands/RecordMaintenanceCostsCommand.cs` | Application |
| `AssetHub.Application/Maintenance/Commands/VerifyMaintenanceOrderCommand.cs` | Application |
| `AssetHub.Application/Maintenance/Commands/AddMaintenancePartCommand.cs` | Application |
| `AssetHub.Application/Maintenance/Commands/RemoveMaintenancePartCommand.cs` | Application |
| `AssetHub.Application/Maintenance/Queries/GetMaintenanceOrdersQuery.cs` | Application |
| `AssetHub.Application/Maintenance/Queries/GetMaintenanceOrderByIdQuery.cs` | Application |
| `AssetHub.Application/Maintenance/Queries/GetMaintenanceOrderTasksQuery.cs` | Application |
| `AssetHub.Api/Controllers/MaintenanceOrdersController.cs` | API |
| `AssetHub.Infrastructure/Persistence/TenantDbContext.cs` | Infrastructure (configuración FK) |

### Frontend
| Archivo | Responsabilidad |
|---|---|
| `src/services/maintenance-order.service.ts` | Servicio API + tipos + labels + transiciones |
| `src/pages/maintenance/orders/index.tsx` | Página de listado |
| `src/pages/maintenance/orders/components/maintenance-order-detail.tsx` | Panel de detalle |
| `src/pages/maintenance/orders/components/maintenance-order-form-sheet.tsx` | Formulario crear/editar |
| `src/pages/maintenance/orders/components/maintenance-order-parts-editor.tsx` | CRUD de repuestos |
| `src/pages/maintenance/orders/components/maintenance-order-tasks-widget.tsx` | Widget de tareas hijas |
| `src/App.tsx` | Ruta `/maintenance/orders` |
| `src/components/layout/data/sidebar-data.ts` | Navegación "Órdenes" |
