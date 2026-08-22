# 008 - UI Fixes & Dynamic Properties Propagation

## Context & Motivation

Over the past few days, focus shifted towards the user experience (UX) inside the Maintenance Orders and Work Tasks modules, as well as fixing data integrity issues and ensuring that dynamic properties (JSON Schemas) configured at the Asset level flow seamlessly down to individual Work Tasks.

The following issues were addressed:
1. **Dynamic Property Propagation:** When creating a task linked to an asset (either directly or via a maintenance order), the task must inherit and display the dynamic attributes of the asset (e.g. `reportado_a`, `asignado_a`), allowing them to be updated.
2. **Task Linking Integrity (500 Error):** The system threw an internal server error when creating a task because it attempted to link the task to both a `MaintenanceOrder` and an `Asset` simultaneously, violating the database constraints (a task can only have one parent entity).
3. **UI/UX Polishing:** The bottom action buttons ("Guardar" / "Cancelar") inside right-side panels (Sheets) were getting pushed out of the viewport on smaller screens or long forms.
4. **Dashboard / Widget Clutter:** The Asset detail page displayed all historical records for orders, incidents, and tasks, causing the UI to overlap. 
5. **Missing Asset Name in Tasks:** The tasks list only displayed the Asset ID instead of the human-readable Asset Name.

## Architectural & Code Changes

### 1. Dynamic Properties Propagation
- **`WorkTaskFormSheet.tsx` & `MaintenanceOrderFormSheet.tsx`:** Updated the initialization logic to pull the asset's schema (`propertiesJson`) if no local properties exist on the task. Prioritized order data, falling back to asset defaults.
- **Removed Hardcoded Assignments:** The legacy "Asignación" section (fixed team/employee fields) was completely removed from the `WorkTaskDetail` and `WorkTaskFormSheet` components, as these are now handled dynamically via the asset's JSON schema properties.

### 2. Task Linking Integrity (Fixing the 500 Error)
- **Frontend Payload Construction:** Modified the `onSubmit` handler in `WorkTaskFormSheet.tsx` to conditionally omit the `assetId` in the API payload if a parent entity (like `MaintenanceOrder` or `PreventivePlan`) is already present. This ensures the backend `CreateWorkTaskCommand` strict 1-to-1 relationship validation passes.

### 3. UI/UX: Sticky Form Buttons
- **Flexbox Adjustments:** Modified the structure of the shadcn/ui `SheetContent` in the form sheets to use `flex flex-col h-full min-h-0`. 
- **ScrollArea Constraint:** Ensured the form scrollable area has `flex-1 min-h-0` while the header and footer (buttons) have `shrink-0`. This mathematically forces the scrollbar to appear only on the form content, keeping the "Save" buttons perpetually visible at the bottom of the viewport regardless of screen resolution.

### 4. Widget Pagination (Backend Enforced)
- **API Adjustments:** Added a `pageSize` parameter to `SearchIncidentsQuery.cs` and the `IncidentsController`, enforcing a database-level `Take(pageSize)` limit.
- **Frontend Widgets:** Updated the widgets inside the Asset Detail page (`AssetIncidentsWidget`, `AssetMaintenanceOrdersWidget`, `PreventivePlanAssetWidget`, `AssetTasksWidget`) to specifically request `pageSize: 4`, preventing the lists from overlapping and improving initial load performance.

### 5. Task List Asset Name Resolution
- **Backend Query Update:** Modified `GetWorkTaskByIdQuery.cs` to include a `.ThenInclude(x => x.Asset)` relation when fetching tasks linked to Incidents, MaintenanceOrders, or PreventivePlans, ensuring the `AssetName` property is correctly populated and rendered on the frontend instead of the raw UUID.
