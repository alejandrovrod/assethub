"""
Explainability module: calculates top feature contributions for individual predictions.
"""

import json

FEATURE_DESCRIPTIONS = {
    "CurrentConditionIndex": "Índice de condición actual degradado",
    "AssetAgeDays": "Antigüedad elevada del activo",
    "AvgConditionLast30Days": "Tendencia negativa de condición en los últimos 30 días",
    "AvgConditionLast90Days": "Deterioro acumulado en los últimos 90 días",
    "TotalIncidentsCount": "Historial acumulado de incidencias",
    "IncidentsLast30Days": "Alta recurrencia de incidencias recientes (30d)",
    "IncidentsLast90Days": "Frecuencia sostenida de incidencias (90d)",
    "TotalMaintenanceOrdersCount": "Volumen de órdenes de mantenimiento",
    "CompletedMaintenanceOrdersCount": "Baja tasa de órdenes completadas",
    "DaysSinceLastCompletedMaintenance": "Tiempo prolongado sin mantenimiento preventivo",
    "PendingWorkTasksCount": "Tareas operativas pendientes acumuladas"
}

def extract_top_contributions(row_dict, top_n=3):
    """
    Heuristic feature importance extractor based on normalized risk factors.
    """
    scores = {}

    if row_dict.get("CurrentConditionIndex", 100) < 60:
        scores["CurrentConditionIndex"] = (100 - row_dict["CurrentConditionIndex"]) / 100.0

    if row_dict.get("IncidentsLast30Days", 0) > 0:
        scores["IncidentsLast30Days"] = min(row_dict["IncidentsLast30Days"] * 0.35, 1.0)

    if row_dict.get("DaysSinceLastCompletedMaintenance", 0) > 180 and row_dict.get("AssetAgeDays", 0) > 180:
        scores["DaysSinceLastCompletedMaintenance"] = min((row_dict["DaysSinceLastCompletedMaintenance"] - 180) / 365.0, 1.0)

    if row_dict.get("PendingWorkTasksCount", 0) > 2:
        scores["PendingWorkTasksCount"] = min(row_dict["PendingWorkTasksCount"] * 0.2, 1.0)

    # Sort descending
    sorted_features = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_n]

    contributions = [
        {
            "feature": f,
            "description": FEATURE_DESCRIPTIONS.get(f, f),
            "weight": round(w, 2)
        }
        for f, w in sorted_features
    ]

    return json.dumps(contributions, ensure_ascii=False)
