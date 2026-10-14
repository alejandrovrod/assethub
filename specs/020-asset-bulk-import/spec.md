# Especificación: Módulo de Importación Masiva e Histórica de Activos V1

**Feature Branch**: `020-asset-bulk-import`  
**Fecha**: 2026-10-14  
**Estado**: Especificado V1  

---

## 1. Propósito

Proveer una solución robusta, transaccional y validada para la ingesta e importación masiva de activos (nuevos e históricos) en AssetHub. El módulo permite cargar archivos Excel (`.xlsx`) y CSV, resolver la plantilla dinámica (`AssetTemplate`) y su categoría (`BusinessEntityType`), mapear campos fijos y propiedades dinámicas (`SchemaJson`), realizar validaciones exhaustivas en memoria (*Dry-Run*) y ejecutar la creación en lote preservando integridad referencial, jerárquica y de ciclo de vida.

---

## 2. Alcance

- Descarga de plantilla oficial de importación en formato Excel/CSV dinámica basada en el `SchemaJson` de la plantilla seleccionada.
- Asistente de importación en frontend (Wizard de 4 pasos):
  1. Selección de Plantilla (`AssetTemplate`) / Carga de archivo.
  2. Mapeo de columnas (fijas y dinámicas).
  3. Pre-validación / Simulación (*Dry-Run*) con reporte visual de advertencias y errores celda por celda.
  4. Ejecución en lote con barra de progreso y resumen de resultados.
- Ingesta de campos fijos del activo (`Code`, `Name`, `State`, `ParentCode`, `InstalledAt`, `CommissionedAt`, `ConditionIndex`, `Latitude`, `Longitude`).
- Ingesta de campos dinámicos serializados a `PropertiesJson` validados contra el `SchemaJson` del template vía `NJsonSchema`.
- Creación retroactiva de eventos de ciclo de vida inicial (`AssetLifecycleEvent`) con tipo `migracion_historica` respetando fechas históricas de puesta en marcha.
- Resolución y validación de jerarquías de activos mediante el árbol jerárquico (`AllowedChildTemplateIds` y cálculo de `Path`).

---

## 3. Modelo de Campos: Fijos vs Dinámicos

### 3.1 Campos Fijos (Core del Dominio)

| Campo | Tipo | Requerido | Regla de Negocio / Validación |
| :--- | :--- | :---: | :--- |
| `Code` | `string` | **Sí** | Identificador único en el Tenant (case-insensitive trim). |
| `Name` | `string` | **Sí** | Nombre descriptivo del activo. |
| `ParentCode` | `string` | No | Código del activo padre. Valida existencia y que el template padre permita al template actual en `AllowedChildTemplateIds`. |
| `State` | `string` | No | Estado inicial. Si se omite, se asigna `LifecycleStates.InitialState`. Si se indica, debe existir dentro del diccionario `LifecycleStates.States`. |
| `InstalledAt` | `DateTime?` | No | Fecha ISO o formato estándar de instalación. Debe ser `<= UtcNow`. |
| `CommissionedAt` | `DateTime?` | No | Fecha de puesta en marcha. Debe ser `>= InstalledAt`. |
| `ConditionIndex` | `decimal?` | No | Rango de `0.00` a `100.00`. |
| `Latitude` | `double?` | No | Rango `-90` a `90` (WGS84). Requiere `Longitude`. |
| `Longitude` | `double?` | No | Rango `-180` a `180` (WGS84). Requiere `Latitude`. |

### 3.2 Campos Dinámicos (EAV / SchemaJson)

- Las columnas no correspondientes a campos fijos se cotejan contra las propiedades definidas en `AssetTemplate.SchemaJson`.
- Cada valor de fila se convierte a su tipo de datos según el esquema JSON (`string`, `number`, `integer`, `boolean`, `array`, `enum`).
- El payload resultante se valida usando `NJsonSchema.Validate(propertiesJson)`.

---

## 4. Endpoints y Contratos de API

### 4.1 Descargar Plantilla Dinámica
- **Endpoint**: `GET /api/v1/assets/import/template/{assetTemplateId}`
- **Parámetros**: `format=xlsx|csv`
- **Respuesta**: Archivo binario con encabezados predefinidos:
  - Encabezados fijos: `Code*`, `Name*`, `ParentCode`, `State`, `InstalledAt`, `CommissionedAt`, `ConditionIndex`, `Latitude`, `Longitude`.
  - Encabezados dinámicos: Cada clave de `properties` en `SchemaJson` con indicador de requerida si aplica.
  - Hoja secundaria o validación de celdas con catálogos y formatos admitidos.

### 4.2 Simulación y Validación Previa (*Dry-Run*)
- **Endpoint**: `POST /api/v1/assets/import/validate`
- **Content-Type**: `multipart/form-data`
- **Body**:
  - `file`: Archivo binario Excel/CSV.
  - `assetTemplateId`: `Guid` de la plantilla.
  - `columnMappings`: JSON opcional para sobreescribir asociación columna -> propiedad.
- **Respuesta (`200 OK`)**:
```json
{
  "totalRows": 150,
  "validRows": 142,
  "invalidRows": 8,
  "errors": [
    {
      "rowNumber": 12,
      "code": "VAL-001",
      "field": "Code",
      "message": "El código 'EQ-0012' ya existe en la base de datos."
    },
    {
      "rowNumber": 35,
      "code": "SCHEMA-ERR",
      "field": "serial_number",
      "message": "El campo 'serial_number' es requerido según la plantilla."
    }
  ],
  "preview": [
    {
      "rowNumber": 1,
      "code": "EQ-0100",
      "name": "Bomba Centrífuga A1",
      "state": "Operativo",
      "properties": { "potencia_hp": 25, "voltaje": 440 }
    }
  ]
}
```

### 4.3 Ejecución de Importación
- **Endpoint**: `POST /api/v1/assets/import/execute`
- **Content-Type**: `multipart/form-data`
- **Body**: Mismos parámetros que la validación, agregando flags:
  - `continueOnError`: `boolean` (default `false`). Si es `false`, ante cualquier error aborta la transacción completa.
- **Respuesta (`200 OK` o `207 Multi-Status`)**:
```json
{
  "success": true,
  "totalProcessed": 150,
  "importedCount": 150,
  "failedCount": 0,
  "importedAssetIds": ["..."]
}
```

---

## 5. Criterios de Aceptación y Reglas de Negocio

1. **Aislamiento Multi-Tenant**: No se permite crear ni vincular activos ni padres fuera del `TenantId` del usuario autenticado.
2. **Atomicidad**: En modo estándar (`continueOnError: false`), si una sola fila falla validación de negocio, ningún registro es insertado en la base de datos.
3. **Validación Jerárquica**: Si una fila tiene `ParentCode`, se resuelve el ID del padre buscando dentro de la base de datos o en las filas previas del mismo archivo. No se admiten referencias circulares.
4. **Ciclo de Vida Histórico**: Al persistir cada activo histórico:
   - Se crea la tupla en `Assets`.
   - Se inserta el nodo jerárquico en `AssetHierarchies`.
   - Se genera un evento `AssetLifecycleEvent` con `EventType = "migracion_historica"`, `ToState = asset.State`, y `At = asset.CommissionedAt ?? asset.CreatedAt`.
