# Contrato UI: Inventario y Almacenes V1

La UI sigue los patrones existentes de React/TypeScript: páginas de listado, panel de detalle, form-sheet, React Query, estados de carga/vacío/error y mensajes problem details traducidos al español.

## Configuración

Ruta sugerida: `/settings/inventory`.

- Toggle `Inventario habilitado`.
- Segmented control con exactamente `Externo`, `Interno`, `Híbrido`.
- Mostrar explicación breve del efecto sobre órdenes.
- Deshabilitar controles de stock cuando el inventario está apagado.
- Guardar con feedback de éxito/error y refresco de queries.

## Almacenes

Ruta sugerida: `/inventory/warehouses`.

- Tabla con código, nombre, ubicación sugerida, estado y cantidad de saldos bajo mínimo.
- Crear/editar mediante form-sheet.
- Baja lógica sólo con confirmación y mensaje de restricción si hay saldo positivo.
- La ubicación sugerida se presenta como texto, nunca como selector que implique bins.

## Stock

Ruta sugerida: `/inventory/stock`.

- Filtros por almacén, catálogo y `bajo mínimo`.
- Columnas: artículo, unidad base, almacén, cantidad, costo promedio, mínimo y alerta.
- La alerta `below_minimum` usa icono/estado y texto accesible; no impide operar.
- No mostrar reservas, lotes, vencimientos ni ubicaciones físicas no soportadas.

## Transacciones

Ruta sugerida: `/inventory/transactions`.

- Tabla inmutable con fecha UTC localizada, tipo, estado, dirección, cantidad, costo, usuario, orden/parte y referencia.
- Detalle de transacción con acción `Revertir` sólo para usuarios autorizados.
- Ocultar editar/eliminar en `Posted`; mostrar vínculo a compensación cuando exista.

## Ajustes

Form-sheet con almacén, artículo, cantidad positiva o negativa, razón obligatoria y referencia opcional.

- Confirmar impacto antes de publicar.
- Mostrar saldo actual y saldo resultante calculado por servidor.
- Mostrar error de saldo negativo sin limpiar el formulario.
- No mostrar paso de aprobación: V1 publica inmediatamente para usuarios autorizados.

## Materiales de orden

El editor existente de `MaintenanceOrderParts` agrega:

- Selector `Origen`: Interno/Externo cuando el modo es `hybrid`; fijo según modo en los otros casos.
- Para interno: almacén activo, cantidad y costo congelado informado por servidor; no permitir costo manual que contradiga el promedio.
- Para externo: costo real obligatorio, proveedor y referencia opcionales.
- En modo externo no mostrar selector de almacén.
- En modo interno/híbrido mostrar disponibilidad actual y alerta si queda bajo mínimo.
- Mantener visibles y editables de forma compatible las partes históricas sin `SourceType`.
- Una orden híbrida debe renderizar sus líneas internas y externas en la misma lista.

## Estados de interfaz

- Carga: skeleton o estado existente del módulo.
- Vacío: mensaje accionable sin inventar datos.
- Error: problem details con acción de reintento.
- Mutación: deshabilitar sólo el control afectado y evitar doble submit.
- Éxito: invalidar configuración, stock, transacciones y detalle de orden según la operación.

## Accesibilidad y permisos

Los controles no autorizados no se muestran o quedan deshabilitados con explicación accesible. Las alertas de mínimo no dependen sólo del color. Todos los formularios deben permitir teclado, foco visible y etiquetas asociadas.
