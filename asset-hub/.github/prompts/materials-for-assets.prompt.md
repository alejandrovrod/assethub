---
description: "Refina y especifica un módulo de materiales asociados a activos, integrando catálogos, inventario, mantenimiento y jerarquía de activos sin aplicar cambios automáticamente."
name: "Especificar materiales para activos"
argument-hint: "Describe qué materiales querés asociar a los activos y qué problema operativo debe resolver"
---

Actuá como arquitecto de producto y especificaciones para AssetHub. Necesito definir un módulo de **materiales para activos** que sea preciso, verificable e implementable.

## Contexto existente

El sistema ya tiene estas capacidades y restricciones:

- Los activos pertenecen a un tenant y forman un árbol mediante `ParentId`, `Path` materializado y `AssetHierarchy`.
- Los activos tienen template, estado de ciclo de vida, código único por tenant, adjuntos, auditoría y soft-delete.
- M5 Catálogos administra catálogos e ítems globales o propios del tenant, con traducciones, override, soft-delete y validación de uso.
- M12 Mantenimiento usa `MaintenancePart` para asociar un `CatalogItemId`, cantidad y costo unitario a una orden de mantenimiento.
- No asumir que un `MaintenancePart` representa el inventario permanente o la composición actual de un activo: esa diferencia debe quedar explícitamente definida.
- Las reglas multi-tenant, permisos, auditoría, UTC, problem+json y soft-delete existentes deben conservarse.

## Objetivo

Definir el módulo que permita gestionar los materiales relacionados con un activo. Antes de diseñar, determiná cuál de estos conceptos necesita el producto, sin elegirlo arbitrariamente:

1. **Composición técnica**: materiales instalados o que forman parte del activo.
2. **Inventario en sitio**: materiales disponibles físicamente para ese activo, con cantidades y ubicación.
3. **Consumo histórico**: materiales usados o retirados durante mantenimiento.
4. **Requerimientos**: materiales necesarios para una tarea, plan u orden futura.
5. Una combinación de los anteriores, con límites y relaciones explícitas.

## Trabajo requerido

Analizá la solicitud y generá una especificación completa. Si faltan decisiones de negocio, no las inventes: registralas como preguntas priorizadas y proponé una opción recomendada con sus consecuencias.

Cubrir como mínimo:

- problema de negocio, usuarios y casos de uso
- alcance y no-alcance de la primera versión
- definición de material, unidad de medida, presentación, lote, serie, proveedor y costo, sólo si aplican
- relación entre `Asset`, `CatalogItem`, material instalado, stock y `MaintenancePart`
- si los materiales se heredan, duplican o sólo se consultan desde activos padre/hijo
- cantidades, unidades, conversiones, mínimos/máximos y precisión decimal
- altas, edición, reemplazo, transferencia, consumo, devolución y retiro
- fechas de vigencia y trazabilidad histórica
- estados y transiciones válidas
- reglas para activos eliminados o movidos dentro del árbol
- permisos por operación y alcance tenant
- concurrencia, idempotencia y prevención de cantidades negativas
- integración con órdenes, tareas, planes preventivos, costos y notificaciones
- auditoría y observabilidad
- migración o compatibilidad con los repuestos existentes
- modelo de datos y restricciones únicas/índices
- endpoints, comandos, consultas, DTOs y errores HTTP
- pantallas, filtros, formularios y estados vacíos en frontend
- escenarios Given/When/Then, incluyendo errores y casos límite
- criterios de aceptación y riesgos

## Evidencia que debés inspeccionar

Si la tarea se ejecuta dentro del repositorio, revisá antes de concluir:

- `docs/sdd/modules/m05-catalogos.md`
- `docs/sdd/modules/m08-activos-arbol.md`
- `docs/sdd/modules/m12-mantenimiento.md`
- `docs/sdd/data-model.md`
- implementaciones y tests actuales de `Asset`, `CatalogItem`, `MaintenancePart` y órdenes de mantenimiento

No modifiques archivos. Este prompt funciona en modo propuesta: sólo debe producir análisis y especificación para revisión humana.

## Formato de salida obligatorio

### 1. Resumen ejecutivo
Explicá qué problema resuelve el módulo y cuál es la decisión central sobre el significado de "material para un activo".

### 2. Decisiones bloqueantes
Tabla con `ID`, `Pregunta`, `Recomendación`, `Alternativas`, `Impacto` y `Responsable`. Marcá qué respuestas son necesarias antes de implementar.

### 3. Alcance
Separá `Incluido`, `No incluido` y `Dependencias existentes`.

### 4. Actores y permisos
Definí actor, permiso, operación y alcance del recurso.

### 5. Modelo de dominio
Incluí entidades, campos, tipos, relaciones, invariantes, índices, soft-delete y auditoría. Diferenciá claramente catálogo, material asociado al activo, stock, consumo y repuesto de mantenimiento.

### 6. Reglas de negocio
Usá identificadores estables `RN-MAT-001`, `RN-MAT-002`, etc.

### 7. Flujos y estados
Describí transiciones válidas, actor, precondiciones, efectos y comportamiento ante fallas o reintentos.

### 8. Contratos API
Para cada endpoint indicá método, ruta, permisos, request, response, códigos HTTP, validaciones, paginación, filtros e idempotencia.

### 9. Experiencia de usuario
Describí vistas, formularios, filtros, acciones, confirmaciones, errores, estados vacíos y comportamiento en móvil.

### 10. Escenarios de aceptación
Usá identificadores `CA-MAT-001` y formato Given/When/Then. Incluí casos exitosos, permisos, tenant isolation, concurrencia, soft-delete, movimiento de activos, cantidades inválidas y compatibilidad con mantenimiento.

### 11. Riesgos y decisiones pendientes
Sólo riesgos que puedan afectar datos, costos, seguridad, operación o evolución del sistema.

### 12. Prompt recursivo siguiente
Generá exactamente un prompt para la siguiente ronda, con un máximo total de 3 rondas. Debe incluir la especificación actual, las decisiones aún abiertas, la evidencia a inspeccionar y una condición explícita de finalización.

La especificación se considera lista para aprobación sólo cuando un implementador puede saber qué construir, un tester puede verificarlo y ningún lector necesita adivinar si un material es composición, stock, consumo o repuesto de mantenimiento.
