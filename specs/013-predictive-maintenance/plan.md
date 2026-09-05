# Plan: 013 - Mantenimiento Predictivo

## Arquitectura y Stack
- **Microservicio (Python)**:
  - Frameworks: FastAPI/Flask, Scikit-learn/XGBoost para entrenamiento de modelos.
  - Orquestación de entrenamiento, recolección de telemetría y emisión de resultados en formato JSON (días de falla, factores principales).
- **Backend (.NET 10, Clean Architecture)**:
  - `AssetHealthPrediction`: Nueva tabla/entidad conectada a los Activos.
  - Endpoints internos o webhooks para recibir los datos procesados del microservicio en Python.
  - Inyección de estas predicciones en los resultados de `SearchAssetsQuery` a través de DTOs.
- **Frontend (React 19, TS, Vite)**:
  - `AssetHealthPredictionWidget.tsx`: Módulo visual que interpreta la información predictiva de un activo.
  - Integración en Leaflet/react-leaflet (archivos de `AssetGlobalMapModal.tsx`) para usar SVGs dinámicos filtrables por `stateColor` o riesgo.

## Fases
1. **Infraestructura Python**: Configuración básica del microservicio, API y lógica mock de entrenamiento.
2. **Backend de Datos**: Migraciones EF Core para soportar el almacenamiento de `AssetHealthPrediction`.
3. **Flujo de Integración**: Conexión entre la ingesta de telemetría y los reportes finales al perfil del activo.
4. **UI Mapas**: Modificaciones de `MapLegend` y filtros dinámicos en frontend.
