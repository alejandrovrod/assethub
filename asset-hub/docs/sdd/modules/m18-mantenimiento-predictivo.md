# M18 — Mantenimiento Predictivo

Sistema integral de mantenimiento predictivo compuesto por un microservicio de machine learning (en Python) y la integración en Asset Hub para visualizar el pronóstico de salud de los activos y sus factores de riesgo.

## Casos de uso

| CU | Actor | Descripción |
|---|---|---|
| CU-18.1 | Sistema (Worker) | Ingesta de históricos y recolección de telemetría para enviar al microservicio Python de ML. |
| CU-18.2 | Sistema (ML) | Retorna pronósticos de salud (`predictedFailureDays`, `riskLevel`, `topFeatureContributionsJson`). |
| CU-18.3 | API / Backend | Guarda el `AssetHealthPrediction` asociado a la entidad del Activo y lo expone en `SearchAssetsQuery`. |
| CU-18.4 | Usuario | Observa el pronóstico de salud en el perfil del activo (días de falla, factores de riesgo). |
| CU-18.5 | Usuario | Visualiza los mapas (Global e Individual) filtrando por niveles de riesgo y estado, observando tooltips predictivos. |

## Reglas de negocio

- RN-18.1: Los activos sin datos suficientes no generarán predicciones; la UI debe manejar este estado como "Estable" o "Sin Datos" y ocultar los factores de riesgo si vienen vacíos.
- RN-18.2: La comunicación entre Asset Hub (.NET) y el microservicio (Python) es asíncrona/batch para no afectar la latencia de transacciones (órdenes o incidencias).
- RN-18.3: Si el servicio de Python falla, el activo mantiene la última predicción conocida o pasa a estado de incertidumbre de datos si ha expirado (TBD por política temporal).
- RN-18.4: Las variables predictivas (factores de riesgo) deben presentarse en lenguaje natural y con colores semánticos (Rojo/Naranja/Verde) según la severidad.

## Criterios de aceptación

- CA-18.1: Given un activo con telemetría, When el worker ejecuta el ciclo predictivo, Then la tabla `AssetHealthPredictions` se actualiza con los días estimados.
- CA-18.2: Given un usuario en el perfil del activo, When el activo tiene `predictedFailureDays = 15`, Then el `AssetHealthPredictionWidget` muestra "Alto Riesgo".
- CA-18.3: Given un activo sin modelo entrenado, When se carga el mapa, Then el marcador se pinta basado en el estado por defecto del activo y el nivel de riesgo en el tooltip aparece como N/A.
- CA-18.4: Given el mapa global, When se filtran riesgos "Altos", Then los marcadores de activos estables se ocultan dinámicamente de la vista del mapa.
