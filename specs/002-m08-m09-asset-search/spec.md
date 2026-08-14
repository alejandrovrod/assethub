# Feature: M08/M09 - Asset Search & Dynamic Filtering

## Overview
Búsqueda dinámica de activos que combina el filtrado jerárquico (M08) y el filtrado por atributos dinámicos EAV (M09). Permite a los distintos negocios (ej. gestión de carreteras vs gestión de edificios) realizar búsquedas personalizadas usando sus propios catálogos, intersectando valores y navegando la jerarquía padre/hijo.

## Functional Requirements
- **FR-8.1**: Usuario busca activos ingresando términos de texto (código o nombre).
- **FR-8.2**: Usuario filtra activos por su ubicación jerárquica (proporcionando un `AncestorId`).
- **FR-8.3**: Usuario filtra activos utilizando atributos dinámicos configurados en catálogos (`ValueCatalogItemId`), que varían según el template del activo.
- **FR-8.4**: El sistema expone un endpoint para obtener los filtros disponibles basados en los catálogos y atributos en uso.
- **FR-8.5**: La vista de resultados presenta los activos filtrados, pudiendo navegar o visualizar su dependencia jerárquica (padres e hijos).

## Edge Cases & Business Rules
- **RN-8.1**: El filtrado dinámico cruza contra la tabla de `AssetAttributeValue` usando el `ValueCatalogItemId`.
- **RN-8.2**: La jerarquía se consulta usando la tabla `AssetHierarchy` para traer de forma performante todos los descendientes de un `AncestorId`.
- **RN-8.3**: La búsqueda por texto debe buscar coincidencias parciales (`Contains`) en `Code` y `Name`.
- **RN-8.4**: Si no se envían filtros, se retornan activos paginados/limitados según los permisos de acceso del tenant.

## Success Criteria
- **SC-8.1**: Búsqueda por `AncestorId` retorna el subárbol correcto y ningún activo externo a la rama.
- **SC-8.2**: Filtrar por múltiples catálogos (ej. "Estado=Operativo" AND "Material=Hormigón") retorna solo activos que cumplan la intersección.
- **SC-8.3**: La interfaz de usuario ajusta los selects de filtros de acuerdo a los templates y atributos dinámicos definidos en el tenant.
