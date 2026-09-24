---
description: "Define y genera las especificaciones técnicas, modelo de datos y endpoints para el módulo de Gestión Financiera, Depreciación, Revaluación y Bajas de Activos de AssetHub."
name: "Especificar finanzas y depreciación de activos"
argument-hint: "Indica reglas financieras específicas o ejecutá la generación de la especificación"
---

Actuá como Arquitecto de Producto y Senior Technical Lead para AssetHub. Necesito generar y refinar una especificación técnica de nivel enterprise para el módulo de **Gestión Financiera, Depreciación y Disposición de Activos (Fixed Assets V1)**, tomando como referencia las capacidades de clase mundial de ERPNext adaptadas a nuestra arquitectura (Clean Architecture, .NET 9, EF Core, Multi-Tenant, React + TypeScript).

Trabajá en modo propuesta: analizá el repositorio, generá las especificaciones y contratos formales sin aplicar cambios destructivos automáticamente.

## Objetivo de Negocio

Dotar a AssetHub de trazabilidad y gestión contable/financiera del ciclo de vida de los activos de capital:
1. Control de adquisición y costos base.
2. Cálculo periódico y automatizado de depreciaciones contables.
3. Tratamiento de mejoras y reparaciones capitalizables (CAPEX vs OPEX).
4. Revaluación o deterioro contable (Impairment).
5. Desincorporación, venta o chatarrización (Disposal/Scrapping).
6. Asignación y traspaso formal de custodias operativas.

## Decisiones de Arquitectura y Negocio

- **Opcional por Tenant**: Un tenant puramente operativo o técnico puede no activar el módulo financiero sin afectar el funcionamiento del árbol de activos o de mantenimiento.
- **Métodos de Depreciación**:
  - `StraightLine` (Línea Recta): Amortización fija por período.
  - `DoubleDeclining` (Doble Saldo Decreciente): Amortización acelerada.
  - `WrittenDownValue` (Porcentaje sobre valor en libros).
  - `Manual` (Tablas personalizadas).
- **Tratamiento Prospectivo de Cambios**: Cualquier mejora capitalizada, revaluación o deterioro recalcula únicamente las cuotas futuras no devengadas; las cuotas históricas permanecen inmutables.
- **Integración con Mantenimiento (M12)**: Posibilidad de marcar una orden de mantenimiento completada como "Capitalizable", transfiriendo su costo al valor neto del activo.
- **Aislamiento e Inmutabilidad**: Tablas tenant-scoped, eventos con timestamps UTC, auditoría completa e idempotencia en el devengo de cuotas.

## Entregables Esperados

1. **Especificación Funcional**: en `specs/019-asset-finance-and-depreciation/spec.md`.
2. **Definición Modular SDD**: en `docs/sdd/modules/m21-gestion-financiera-depreciacion.md`.
3. **Contratos de Dominio y DTOs**: Estructuras en C# (.NET) para entidades `AssetFinanceBook`, `AssetDepreciationSchedule`, `AssetDepreciationEntry`, `AssetValueAdjustment`, `AssetDisposal` y `AssetCustodyTransfer`.
4. **Endpoints REST**: Definición OpenAPI / endpoints bajo `/api/v1/assets/{id}/...`.
5. **Criterios de Aceptación y Casos de Prueba**: Escenarios BDD/Gherkin listos para testing automatizado.
