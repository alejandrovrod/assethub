# Correcciones de Interfaz de Usuario y Propagación de Estados

Este documento detalla las últimas correcciones realizadas en la interfaz de usuario (frontend) y las resoluciones de propagación de datos (backend).

## 1. Backend: Propagación de Atributos Dinámicos
Se corrigieron las consultas para obtener de manera adecuada el `WorkflowTemplateId` y permitir el renderizado de atributos dinámicos (`PropertiesJson`) en la interfaz:
- **`GetMaintenanceOrderByIdQuery` y `GetMaintenanceOrdersQuery`**: Se añadió una validación en cascada que asigna el `WorkflowTemplateId` desde el `Incident` o `PreventivePlan` originario, si la orden de mantenimiento actual no lo tiene configurado explícitamente.
- **`GetWorkTaskByIdQuery` y `GetWorkTasksQuery`**: Se amplió la misma lógica para escalar desde la `MaintenanceOrder`, luego al `Incident` o finalmente al `PreventivePlan` para resolver la plantilla aplicable a la tarea.
- **Resolución de Errores de Linq**: Se ajustó la sintaxis en las consultas LINQ (`GetMaintenanceOrdersQuery` y `GetWorkTasksQuery`) para usar expresiones ternarias explícitas en vez de operadores de propagación de null (`?.`), asegurando la compilación exitosa y ejecución sobre Entity Framework.
- **Ejecución de Planes Preventivos**: Se solucionó un error de restricción de índice único (`IX_PreventivePlanExecutionLogs_TenantId_PreventivePlanId_AssetId_Occurrence`) que provocaba fallos internos 500 al guardar los logs de ejecución.

## 2. Frontend: Mejoras y Alineación de Interfaz de Usuario (UI)

### Alineación en la Vista de Detalle de Activos (`assets/detail.tsx`)
- **Cabecera**: Se agruparon las tarjetas de "ID Interno" y "Cambiar estado a:" dentro de un contenedor flexible. Ambos se configuraron con altura fija (`h-12`) y alineación centrada para corregir su presentación visual.
- **Acordeón y Pestañas**: Se añadió un margen superior responsivo (`md:mt-[56px]`) a la columna derecha para asegurar que el acordeón de relaciones ("Incidencias activas", "Órdenes de mantenimiento", etc.) quede alineado perfectamente con el contenido de los paneles de pestañas (`TabsContent`).

### Consistencia de Botones con Iconos
Se limpió la separación ("espacios") residual en los botones principales ("Nueva plantilla", "Reportar incidencia", etc.) a lo largo de las vistas de gestión tras la eliminación de sus etiquetas de texto:
- Se removió la clase `mr-2` de los iconos `<Plus />`.
- Se aplicó la propiedad `size="icon"` a los componentes `<Button>` para asegurar proporciones cuadradas y exactas.
- Vistas actualizadas:
  - `templates.tsx` (Plantillas de activos)
  - `workflow-templates/index.tsx` (Plantillas de workflow)
  - `incidents.tsx` (Incidencias)
  - `tasks.tsx` (Tareas)
  - `orders/index.tsx` (Órdenes)
  - `preventive-plans/index.tsx` (Planes preventivos)
  - `employees.tsx` (Personal/Empleados)
  - `teams.tsx` (Equipos)
