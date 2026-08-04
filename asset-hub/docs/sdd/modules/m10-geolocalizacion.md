# M10 — Geolocalización

Capa geoespacial: GeoJSON en la API ↔ `geography` en SQL Server (Point, LineString, Polygon), endpoints de búsqueda espacial (bbox, radio) y mapa frontend con MapLibre GL + OpenStreetMap, capas por template y clustering.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-10.1 | Gestor | Asigna geometría a un activo (Point/LineString/Polygon) vía GeoJSON |
| CU-10.2 | Gestor | Edita geometría dibujando en el mapa |
| CU-10.3 | Lectura | Visualiza activos en mapa con capas por template y colores por estado |
| CU-10.4 | Lectura | Activa clustering cuando hay muchos puntos en pantalla |
| CU-10.5 | Lectura | Busca activos dentro de un bbox (viewport del mapa) |
| CU-10.6 | Gestor | Busca activos en un radio (metros) alrededor de un punto |
| CU-10.7 | Técnico | Registra incidencia/evidencia con coordenadas capturadas del dispositivo (M11/M15) |

## Reglas de negocio

- RN-10.1: API habla GeoJSON (RFC 7946, WGS84/SRID 4326); DB persiste `geography` en `Assets.Geo`/`Incidents.Geo`/`TaskEvidences.Geo`; la conversión ocurre en Infrastructure.
- RN-10.2: `GeoType` ∈ {`Point`,`LineString`,`Polygon`}; GeoJSON de otro tipo → 400.
- RN-10.3: Índices espaciales en `Assets.Geo` e `Incidents.Geo`; bbox/radio usan predicados espaciales (`STIntersects`, `STDistance`), siempre con filtro de tenant (R1, R2).
- RN-10.4: Bbox acotado (área máxima configurable) y radio máximo (p.ej. 50 km) para evitar scans; violación → 400.
- RN-10.5: El mapa usa MapLibre GL + tiles OSM respetando su política de uso; capas por template configurables por tenant.
- RN-10.6: Clustering en cliente (supercluster) a partir de N features; el endpoint devuelve GeoJSON FeatureCollection paginado.
- RN-10.7: Módulo sujeto a `EnabledModules` del plan (R4): sin módulo geo → 403.

## Criterios de aceptación

- CA-10.1: Given GeoJSON Point válido, When PUT geo de activo, Then `Assets.Geo` contiene geography SRID 4326 y `GeoType=Point`.
- CA-10.2: Given GeoJSON tipo `MultiPolygon`, When PUT, Then 400 indicando tipo no soportado.
- CA-10.3: Given 3 activos dentro del bbox y 2 fuera, When GET `/assets/geo?bbox=...`, Then FeatureCollection con exactamente 3.
- CA-10.4: Given punto y radio 500 m, When GET `/assets/geo/nearby`, Then solo activos a ≤ 500 m, ordenados por distancia.
- CA-10.5: Given bbox que excede el área máxima, When GET, Then 400 problem+json.
- CA-10.6: Given tenant A y B con activos cercanos, When A consulta radio, Then nunca aparecen activos de B (RLS).
- CA-10.7: Given 5000 puntos en viewport, When el mapa carga, Then el cliente agrupa en clusters y al hacer zoom se expanden.
- CA-10.8: Given plan sin módulo geo, When GET endpoints geo, Then 403.
