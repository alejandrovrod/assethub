import json
import uuid

TENANT_ID = '9443A8E1-7759-446D-9B73-AA0768BEE82B'
BUSINESS_ENTITY_TYPE_ID = '09177E41-96E5-4187-8783-34F50ED8277E'

ASSET_TEMPLATE_ID = str(uuid.uuid4()).upper()
WORKFLOW_TEMPLATE_ID = str(uuid.uuid4()).upper()

asset_schema = {
    "type": "object",
    "properties": {
        "numero_serie": {"type": "string", "title": "Número de serie"},
        "marca": {"type": "string", "title": "Marca"},
        "modelo": {"type": "string", "title": "Modelo"},
        "tipo_equipo": {"type": "string", "title": "Tipo de equipo"},
        "anio_fabricacion": {"type": "number", "title": "Año de fabricación"},
        "fecha_ingreso": {"type": "string", "format": "date", "title": "Fecha de ingreso"},
        "garantia_activa": {"type": "boolean", "title": "¿Tiene garantía activa?"},
        "prioridad": {"type": "string", "enum": ["Baja", "Media", "Alta", "Urgente"], "title": "Prioridad"},
        "ubicacion": {"type": "string", "catalogCode": "UBICACIONES", "title": "Ubicación"},
        "foto_ingreso": {"type": "string", "format": "data-url", "title": "Foto de ingreso"},
        "observaciones": {"type": "string", "title": "Observaciones"}
    },
    "required": ["marca", "modelo", "tipo_equipo", "prioridad"]
}

asset_lifecycle = {
    "initialState": "Recibido",
    "transitions": {
        "Recibido": ["EnDiagnostico", "Cancelado"],
        "EnDiagnostico": ["EnReparacion", "EnEsperaRepuesto", "Resuelto", "Cancelado"],
        "EnEsperaRepuesto": ["EnReparacion", "Cancelado"],
        "EnReparacion": ["Resuelto", "EnDiagnostico", "Cancelado"],
        "Resuelto": ["Entregado", "EnDiagnostico"],
        "Entregado": [],
        "Cancelado": []
    },
    "states": {
        "Recibido": {"color": "#f97316", "isTerminal": False, "requiresFields": ["numero_serie", "marca", "modelo", "tipo_equipo", "prioridad"], "allowedRoles": [], "onEnterAction": "", "associatedModule": "incidents", "childStateDependencies": []},
        "EnDiagnostico": {"color": "#eab308", "isTerminal": False, "requiresFields": ["observaciones"], "allowedRoles": [], "onEnterAction": "CREATE_WORK_ORDER", "associatedModule": "work_orders", "childStateDependencies": []},
        "EnEsperaRepuesto": {"color": "#a855f7", "isTerminal": False, "requiresFields": [], "allowedRoles": [], "onEnterAction": "NOTIFY_MANAGER", "associatedModule": "work_orders", "childStateDependencies": []},
        "EnReparacion": {"color": "#06b6d4", "isTerminal": False, "requiresFields": [], "allowedRoles": [], "onEnterAction": "", "associatedModule": "work_orders", "childStateDependencies": []},
        "Resuelto": {"color": "#22c55e", "isTerminal": False, "requiresFields": [], "allowedRoles": [], "onEnterAction": "NOTIFY_MANAGER", "associatedModule": "", "childStateDependencies": []},
        "Entregado": {"color": "#64748b", "isTerminal": True, "requiresFields": [], "allowedRoles": [], "onEnterAction": "", "associatedModule": "", "childStateDependencies": []},
        "Cancelado": {"color": "#ef4444", "isTerminal": True, "requiresFields": ["observaciones"], "allowedRoles": [], "onEnterAction": "", "associatedModule": "", "childStateDependencies": []}
    },
    "nodes": [
        {"id": "Recibido", "position": {"x": 100, "y": 100}, "data": {"label": "Recibido"}},
        {"id": "EnDiagnostico", "position": {"x": 300, "y": 100}, "data": {"label": "EnDiagnostico"}},
        {"id": "EnEsperaRepuesto", "position": {"x": 500, "y": 100}, "data": {"label": "EnEsperaRepuesto"}},
        {"id": "EnReparacion", "position": {"x": 100, "y": 300}, "data": {"label": "EnReparacion"}},
        {"id": "Resuelto", "position": {"x": 300, "y": 300}, "data": {"label": "Resuelto"}},
        {"id": "Entregado", "position": {"x": 500, "y": 300}, "data": {"label": "Entregado"}},
        {"id": "Cancelado", "position": {"x": 700, "y": 300}, "data": {"label": "Cancelado"}}
    ],
    "edges": [
        {"id": "e-Recibido-EnDiagnostico", "source": "Recibido", "target": "EnDiagnostico"},
        {"id": "e-Recibido-Cancelado", "source": "Recibido", "target": "Cancelado"},
        {"id": "e-EnDiagnostico-EnReparacion", "source": "EnDiagnostico", "target": "EnReparacion"},
        {"id": "e-EnDiagnostico-EnEsperaRepuesto", "source": "EnDiagnostico", "target": "EnEsperaRepuesto"},
        {"id": "e-EnDiagnostico-Resuelto", "source": "EnDiagnostico", "target": "Resuelto"},
        {"id": "e-EnDiagnostico-Cancelado", "source": "EnDiagnostico", "target": "Cancelado"},
        {"id": "e-EnEsperaRepuesto-EnReparacion", "source": "EnEsperaRepuesto", "target": "EnReparacion"},
        {"id": "e-EnEsperaRepuesto-Cancelado", "source": "EnEsperaRepuesto", "target": "Cancelado"},
        {"id": "e-EnReparacion-Resuelto", "source": "EnReparacion", "target": "Resuelto"},
        {"id": "e-EnReparacion-EnDiagnostico", "source": "EnReparacion", "target": "EnDiagnostico"},
        {"id": "e-EnReparacion-Cancelado", "source": "EnReparacion", "target": "Cancelado"},
        {"id": "e-Resuelto-Entregado", "source": "Resuelto", "target": "Entregado"},
        {"id": "e-Resuelto-EnDiagnostico", "source": "Resuelto", "target": "EnDiagnostico"}
    ]
}

asset_checklist = {
    "tasks": [
        {"title": "Inspección visual externa", "description": "Revisar golpes, rayones y conectores.", "frequency": "Al ingreso"},
        {"title": "Verificar encendido básico", "description": "Comprobar que el equipo encienda y reconozca pantalla.", "frequency": "Al ingreso"},
        {"title": "Respaldar información del cliente", "description": "Realizar backup previo si es posible.", "frequency": "Antes de reparación"},
        {"title": "Revisar componentes internos", "description": "Limpiar polvo y verificar temperaturas.", "frequency": "Cada 6 meses"},
        {"title": "Actualizar firmware y drivers", "description": "Aplicar actualizaciones oficiales.", "frequency": "Cada reparación"},
        {"title": "Pruebas finales de funcionamiento", "description": "Ejecutar pruebas de estrés básicas.", "frequency": "Antes de entrega"}
    ]
}

workflow_schema = {
    "type": "object",
    "properties": {
        "sintoma_reportado": {"type": "string", "title": "Síntoma reportado"},
        "diagnostico_tecnico": {"type": "string", "title": "Diagnóstico técnico"},
        "repuesto_utilizado": {"type": "string", "title": "Repuesto utilizado"},
        "costo_estimado": {"type": "number", "title": "Costo estimado"},
        "fecha_prometida": {"type": "string", "format": "date", "title": "Fecha prometida"},
        "urgente": {"type": "boolean", "title": "¿Es urgente?"},
        "estado_entrega": {"type": "string", "enum": ["Pendiente", "Parcial", "Completa"], "title": "Estado de entrega"}
    },
    "required": ["sintoma_reportado"]
}

workflow_lifecycle = {
    "initialState": "Reportado",
    "transitions": {
        "Reportado": ["Asignado", "Cancelado"],
        "Asignado": ["EnDiagnostico", "Cancelado"],
        "EnDiagnostico": ["EnReparacion", "EnEsperaRepuesto", "Resuelto", "Cancelado"],
        "EnEsperaRepuesto": ["EnReparacion", "Cancelado"],
        "EnReparacion": ["Resuelto", "Cancelado"],
        "Resuelto": ["Cerrado", "EnReparacion"],
        "Cerrado": [],
        "Cancelado": []
    },
    "states": {
        "Reportado": {"color": "#f97316", "isTerminal": False, "requiresFields": ["sintoma_reportado"], "allowedRoles": [], "onEnterAction": "", "associatedModule": "incidents", "childStateDependencies": []},
        "Asignado": {"color": "#3b82f6", "isTerminal": False, "requiresFields": [], "allowedRoles": [], "onEnterAction": "NOTIFY_MANAGER", "associatedModule": "work_orders", "childStateDependencies": []},
        "EnDiagnostico": {"color": "#eab308", "isTerminal": False, "requiresFields": ["diagnostico_tecnico"], "allowedRoles": [], "onEnterAction": "CREATE_WORK_ORDER", "associatedModule": "work_orders", "childStateDependencies": []},
        "EnEsperaRepuesto": {"color": "#a855f7", "isTerminal": False, "requiresFields": ["repuesto_utilizado"], "allowedRoles": [], "onEnterAction": "", "associatedModule": "work_orders", "childStateDependencies": []},
        "EnReparacion": {"color": "#06b6d4", "isTerminal": False, "requiresFields": [], "allowedRoles": [], "onEnterAction": "", "associatedModule": "work_orders", "childStateDependencies": []},
        "Resuelto": {"color": "#22c55e", "isTerminal": False, "requiresFields": ["costo_estimado"], "allowedRoles": [], "onEnterAction": "NOTIFY_MANAGER", "associatedModule": "", "childStateDependencies": []},
        "Cerrado": {"color": "#64748b", "isTerminal": True, "requiresFields": [], "allowedRoles": [], "onEnterAction": "", "associatedModule": "", "childStateDependencies": []},
        "Cancelado": {"color": "#ef4444", "isTerminal": True, "requiresFields": ["diagnostico_tecnico"], "allowedRoles": [], "onEnterAction": "", "associatedModule": "", "childStateDependencies": []}
    },
    "nodes": [
        {"id": "Reportado", "position": {"x": 100, "y": 100}, "data": {"label": "Reportado"}},
        {"id": "Asignado", "position": {"x": 300, "y": 100}, "data": {"label": "Asignado"}},
        {"id": "EnDiagnostico", "position": {"x": 500, "y": 100}, "data": {"label": "EnDiagnostico"}},
        {"id": "EnEsperaRepuesto", "position": {"x": 700, "y": 100}, "data": {"label": "EnEsperaRepuesto"}},
        {"id": "EnReparacion", "position": {"x": 100, "y": 300}, "data": {"label": "EnReparacion"}},
        {"id": "Resuelto", "position": {"x": 300, "y": 300}, "data": {"label": "Resuelto"}},
        {"id": "Cerrado", "position": {"x": 500, "y": 300}, "data": {"label": "Cerrado"}},
        {"id": "Cancelado", "position": {"x": 700, "y": 300}, "data": {"label": "Cancelado"}}
    ],
    "edges": [
        {"id": "e-Reportado-Asignado", "source": "Reportado", "target": "Asignado"},
        {"id": "e-Reportado-Cancelado", "source": "Reportado", "target": "Cancelado"},
        {"id": "e-Asignado-EnDiagnostico", "source": "Asignado", "target": "EnDiagnostico"},
        {"id": "e-Asignado-Cancelado", "source": "Asignado", "target": "Cancelado"},
        {"id": "e-EnDiagnostico-EnReparacion", "source": "EnDiagnostico", "target": "EnReparacion"},
        {"id": "e-EnDiagnostico-EnEsperaRepuesto", "source": "EnDiagnostico", "target": "EnEsperaRepuesto"},
        {"id": "e-EnDiagnostico-Resuelto", "source": "EnDiagnostico", "target": "Resuelto"},
        {"id": "e-EnDiagnostico-Cancelado", "source": "EnDiagnostico", "target": "Cancelado"},
        {"id": "e-EnEsperaRepuesto-EnReparacion", "source": "EnEsperaRepuesto", "target": "EnReparacion"},
        {"id": "e-EnEsperaRepuesto-Cancelado", "source": "EnEsperaRepuesto", "target": "Cancelado"},
        {"id": "e-EnReparacion-Resuelto", "source": "EnReparacion", "target": "Resuelto"},
        {"id": "e-EnReparacion-Cancelado", "source": "EnReparacion", "target": "Cancelado"},
        {"id": "e-Resuelto-Cerrado", "source": "Resuelto", "target": "Cerrado"},
        {"id": "e-Resuelto-EnReparacion", "source": "Resuelto", "target": "EnReparacion"}
    ]
}

def sql_escape(s):
    return s.replace("'", "''")

inserts = f"""
INSERT INTO tenant.AssetTemplates (Id, TenantId, BusinessEntityTypeId, Code, Name, Description, SchemaJson, AllowedChildTemplateIds, LifecycleStates, MaintenanceChecklist, Version, IsActive)
VALUES (
    '{ASSET_TEMPLATE_ID}',
    '{TENANT_ID}',
    '{BUSINESS_ENTITY_TYPE_ID}',
    'SoporteTecnico',
    'Equipo de Soporte Técnico',
    'Plantilla para equipos ingresados al departamento de soporte técnico. Incluye diagnóstico, reparación y seguimiento de repuestos.',
    '{sql_escape(json.dumps(asset_schema, ensure_ascii=False))}',
    '[]',
    '{sql_escape(json.dumps(asset_lifecycle, ensure_ascii=False))}',
    '{sql_escape(json.dumps(asset_checklist, ensure_ascii=False))}',
    1,
    1
);

INSERT INTO tenant.WorkflowTemplates (Id, TenantId, Code, Name, Description, SchemaJson, Type, LifecycleStates, Version, IsActive)
VALUES (
    '{WORKFLOW_TEMPLATE_ID}',
    '{TENANT_ID}',
    'INCIDENCIA_SOPORTE',
    'Incidencia de Soporte Técnico',
    'Flujo de trabajo para incidencias reportadas sobre equipos de soporte técnico.',
    '{sql_escape(json.dumps(workflow_schema, ensure_ascii=False))}',
    'incident',
    '{sql_escape(json.dumps(workflow_lifecycle, ensure_ascii=False))}',
    1,
    1
);
"""

with open('seed-soporte-tecnico.sql', 'w', encoding='utf-8') as f:
    f.write(inserts)
print(inserts)
