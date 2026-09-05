# Feature: 013 - Mantenimiento Predictivo

## Resumen (Overview)
Implementación de un sistema integral de mantenimiento predictivo compuesto por un microservicio de machine learning (en Python) y la integración correspondiente en Asset Hub para visualizar el pronóstico de salud de los activos, ayudando a anticipar fallas.

## Requerimientos Funcionales
- **FR-13.1**: El servicio Python debe poder ingerir históricos y emitir predicciones de falla (`predictedFailureDays`, `riskLevel`).
- **FR-13.2**: La API de Asset Hub debe recibir, almacenar y servir los pronósticos de salud (`AssetHealthPrediction`) integrados a la entidad del Activo.
- **FR-13.3**: La UI debe desplegar el pronóstico de salud en el perfil del activo (Widget `AssetHealthPredictionWidget`).
- **FR-13.4**: Los mapas de visualización (Globales e Individuales) deben reflejar el nivel de riesgo predictivo mediante marcadores de colores dinámicos y tooltips detallados.

## Casos Extremos y Reglas de Negocio
- **RN-13.1**: Los activos sin datos suficientes no generarán predicciones; la UI debe manejar este estado como "Sin Datos/Estable" de forma grácil.
- **RN-13.2**: La comunicación entre Asset Hub (.NET) y el microservicio (Python) es asíncrona/batch para no afectar la latencia transaccional.

## Casos de Uso
- **UC-13.1**: El sistema nocturnamente procesa y actualiza las predicciones de salud de todos los activos críticos.
- **UC-13.2**: Un operador abre el perfil de una máquina y observa una advertencia de "Alta probabilidad de falla en 15 días" por "Falta de lubricación".
- **UC-13.3**: Un técnico de confiabilidad visualiza el Mapa Global filtrando únicamente activos con nivel de riesgo predictivo Alto/Crítico.
