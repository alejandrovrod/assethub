# UI Contract: Preventive Maintenance Plans

## Navigation

Add a new menu item under **Mantenimiento**:

```text
Mantenimiento
├── Incidencias
├── Plantillas de Incidencias
├── Tareas
└── Planes de Mantenimiento   <-- new
```

Clicking it navigates to `/maintenance/preventive-plans`.

## Screen 1 — Preventive Plans List

**Route**: `/maintenance/preventive-plans`

**Layout**:

- Header with title "Planes de Mantenimiento" and a primary button "Nuevo Plan".
- Filters: active/paused toggle, search by name, filter by asset/template.
- Data table with columns:
  - Nombre
  - Objetivo (asset or template name)
  - Tipo generado (Tarea, Orden, Ambas)
  - Frecuencia (cron expression as human-readable label)
  - Próxima ejecución
  - Estado (Activo / Pausado)
  - Acciones: editar, pausar/reanudar, eliminar, ejecutar ahora

**Interactions**:

- Row click opens detail/edit drawer.
- "Ejecutar ahora" calls `POST /api/preventive-plans/{id}/evaluate` and refreshes the list + logs.

---

## Screen 2 — Create/Edit Plan

**Component**: `preventive-plan-form-sheet.tsx`

**Sections**:

1. **General**
   - Nombre (required)
   - Descripción
2. **Objetivo**
   - Radio: "Un activo" / "Todos los activos de una plantilla"
   - Searchable selector for asset or template
3. **Recurrencia**
   - Cron expression input with helper examples
   - Human-readable preview ("Una vez al mes")
4. **Entregable**
   - Radio: "Tarea de trabajo" / "Orden de mantenimiento" / "Ambas"
5. **Asignación**
   - Checkbox "Asignar automáticamente"
   - If checked, selectors for default employee and default team
6. **Condiciones**
   - Multi-select "Estados permitidos"
   - Multi-select "Estados excluidos"
   - Helper text: "Solo se generarán tareas para activos que cumplan estas condiciones."
7. **Vencimiento**
   - Number input "Días hasta vencimiento" relative to execution date
8. **Fin del plan** (optional)
   - Date picker "Finaliza el"

**Validation**:

- Target required (asset or template, not both)
- Cron expression must parse
- Due days >= 0

---

## Screen 3 — Plan Detail / Calendar / Logs

**Component**: drawer or dedicated page reachable from list.

**Tabs**:

1. **Detalle** — read-only plan info, edit button.
2. **Calendario** — calendar component showing next 12 scheduled occurrences.
3. **Bitácora** — execution log table with filters by status and asset.
4. **Tareas generadas** — list of linked `WorkTask` and `MaintenanceOrder` items.

---

## Screen 4 — Asset Detail Widget

**Location**: `assets/detail.tsx` right column.

**Widget**: "Planes de Mantenimiento Asociados"

- List of plans targeting this asset directly or via its template.
- Each row: plan name, next run, status.
- Click opens plan detail drawer.

---

## Notifications

When a plan generates a work item, a toast or badge update appears for the assigned user. A notification bell (if present) shows unread count incremented.
