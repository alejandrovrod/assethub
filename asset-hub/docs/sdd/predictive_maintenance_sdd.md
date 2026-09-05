# Mantenimiento Predictivo

## 1. Contexto y Problema
Actualmente, el mantenimiento de los activos es reactivo o basado en reglas fijas, lo que ocasiona tiempos de inactividad inesperados. Necesitamos anticiparnos a las fallas de los activos analizando el histórico de incidencias y datos operativos para evitar paros costosos.

## 2. Objetivos
- Integrar pronósticos de salud (Health Forecasting) en los perfiles de los activos.
- Proveer una interfaz visual (UI) para el monitoreo del estado de salud predictiva, incluyendo factores de riesgo, probabilidad de falla, e indicadores de tiempo estimado para la falla.
- Desarrollar servicios de entrenamiento de modelos para mantener predicciones vigentes.

## 3. Arquitectura y Componentes
- **Servicio de Machine Learning (Python)**:
  - Microservicio independiente desarrollado en Python encargado de entrenar los modelos de predicción de salud y calcular pronósticos (Health Forecasting).
  - Integración mediante un worker que procesa el historial de incidencias y telemetría (factores de riesgo) para generar los outputs de predicción.
- **Backend (.NET Core)**:
  - `AssetHealthPrediction`: Entidad de dominio que almacena el nivel de riesgo, probabilidad y factores determinantes (`topFeatureContributionsJson`).
  - Servicios de ingesta de predicciones generadas por el microservicio de Python.
  - Modificación a `SearchAssetsQuery` y detalles del activo para devolver datos predictivos.
- **Frontend (UI)**:
  - Widget `AssetHealthPredictionWidget` para visualizar los resultados del modelo predictivo (Días estimados de falla, nivel de riesgo, probabilidad).
  - Integración en mapas de ubicación de activos (`AssetGlobalMapModal`, `AssetMap`) para filtrar y visualizar colores según niveles de riesgo y estado.
  - Tooltips interactivos mostrando el detalle de la salud predictiva.

## 4. Tareas (Work Breakdown)
- [x] Crear tabla `AssetHealthPredictions` en la base de datos.
- [x] Implementar DTOs y lógica de consulta en el backend (`SearchAssetsQuery`).
- [x] Implementar Widgets UI (`asset-incidents-widget`).
- [x] Configurar los colores y el filtro en el mapa.

## 5. Fuera de Alcance (Out of Scope)
- Retransmisión en tiempo real de telemetría IoT (se evalúa a través de batch de incidencias/órdenes).
