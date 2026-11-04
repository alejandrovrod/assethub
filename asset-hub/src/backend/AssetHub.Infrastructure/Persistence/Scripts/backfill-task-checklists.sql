-- =============================================================================
-- 022 T035 - Backfill de TaskChecklists para tareas ya existentes
--
-- Por qué existe: el snapshot del checklist se crea al crear la tarea. Las tareas
-- que ya estaban en la base no tienen fila, así que GET /work-tasks/{id}/checklist
-- devolvería 204 para todas y el técnico no vería el formulario que la plantilla
-- sí define.
--
-- Qué hace: para cada tarea viva sin checklist, resuelve el activo (directo, o vía
-- orden de mantenimiento / incidente), lee AssetTemplates.MaintenanceChecklist y
-- genera el mismo JSON Schema draft-07 + UiSchema que produce
-- ChecklistSchemaFactory, con claves item_<índice>.
--
-- Propiedades:
--   * Idempotente  -> WHERE NOT EXISTS (TaskChecklists.WorkTaskId). Re-ejecutarlo no
--                     duplica ni pisa lo que el técnico ya respondió.
--   * Por lotes    -> @BatchSize por iteración, para no bloquear la tabla en un
--                     tenant grande.
--   * Tolerante    -> plantillas con JSON inválido o sin ítems quedan sin checklist
--                     (igual que el factory, que devuelve null en ese caso).
--
-- No toca Version, State ni ResponseJson de filas existentes.
-- =============================================================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'tenant.TaskChecklists', N'U') IS NULL
BEGIN
    THROW 50000, N'Falta la tabla tenant.TaskChecklists: aplicá la migración AddTaskChecklists antes de correr este script.', 1;
END;

DECLARE @BatchSize int = 500;
DECLARE @TotalInserted int = 0;
DECLARE @Inserted int = 1;

WHILE @Inserted > 0
BEGIN
    ;WITH Candidates AS (
        SELECT
            t.Id       AS WorkTaskId,
            t.TenantId AS TenantId,
            at.MaintenanceChecklist
        FROM tenant.WorkTasks t
        LEFT JOIN tenant.MaintenanceOrders mo ON mo.Id = t.MaintenanceOrderId
        LEFT JOIN tenant.Incidents i         ON i.Id  = t.IncidentId
        JOIN tenant.Assets a
            ON a.Id = COALESCE(t.AssetId, mo.AssetId, i.AssetId)
           AND a.IsDeleted = 0
        JOIN tenant.AssetTemplates at ON at.Id = a.AssetTemplateId
        WHERE t.IsDeleted = 0
          AND at.MaintenanceChecklist IS NOT NULL
          AND LEN(LTRIM(RTRIM(at.MaintenanceChecklist))) > 2
          AND ISJSON(at.MaintenanceChecklist) = 1
          AND NOT EXISTS (
                SELECT 1
                FROM tenant.TaskChecklists c
                WHERE c.WorkTaskId = t.Id
              )
    ),
    Items AS (
        -- El índice es la posición entre los ítems que son objeto, no la posición
        -- cruda del array: es lo que hace ChecklistSchemaFactory al ignorar basura.
        SELECT
            c.WorkTaskId,
            c.TenantId,
            ROW_NUMBER() OVER (PARTITION BY c.WorkTaskId ORDER BY CAST(j.[key] AS int)) - 1 AS Idx,
            NULLIF(LTRIM(RTRIM(JSON_VALUE(j.value, '$.title'))), N'')       AS Title,
            NULLIF(LTRIM(RTRIM(JSON_VALUE(j.value, '$.description'))), N'') AS Description,
            NULLIF(LTRIM(RTRIM(JSON_VALUE(j.value, '$.frequency'))), N'')   AS Frequency
        FROM Candidates c
        CROSS APPLY OPENJSON(c.MaintenanceChecklist, '$.tasks') j
        WHERE j.[type] = 5   -- 5 = objeto; 2 es número, no "objeto" (OPENJSON: 0..5)
    ),
    Built AS (
        SELECT
            i.WorkTaskId,
            MAX(i.TenantId) AS TenantId,
            STRING_AGG(
                CAST(
                    N'"item_' + CAST(i.Idx AS nvarchar(10)) + N'":{"type":"boolean","title":"'
                    + STRING_ESCAPE(COALESCE(i.Title, N'Ítem ' + CAST(i.Idx + 1 AS nvarchar(10))), 'json')
                    + N'"'
                    + CASE
                        WHEN i.Description IS NOT NULL
                            THEN N',"description":"' + STRING_ESCAPE(i.Description, 'json') + N'"'
                        ELSE N''
                      END
                    + N'}'
                    AS nvarchar(max)
                ),
                N','
            ) WITHIN GROUP (ORDER BY i.Idx) AS PropertiesJson,
            STRING_AGG(
                CAST(N'"item_' + CAST(i.Idx AS nvarchar(10)) + N'"' AS nvarchar(max)),
                N','
            ) WITHIN GROUP (ORDER BY i.Idx) AS KeyListJson,
            STRING_AGG(
                CAST(
                    N'"item_' + CAST(i.Idx AS nvarchar(10)) + N'":{"ui:widget":"checkbox"'
                    + CASE
                        WHEN i.Frequency IS NOT NULL
                            THEN N',"ui:help":"' + STRING_ESCAPE(i.Frequency, 'json') + N'"'
                        ELSE N''
                      END
                    + N'}'
                    AS nvarchar(max)
                ),
                N','
            ) WITHIN GROUP (ORDER BY i.Idx) AS UiFieldsJson
        FROM Items i
        GROUP BY i.WorkTaskId
    )
    INSERT INTO tenant.TaskChecklists
    (
        Id, TenantId, WorkTaskId,
        SchemaJson, UiSchemaJson, ResponseJson,
        State, Version, SubmittedAt, SubmittedByUserId,
        CreatedAt, UpdatedAt
    )
    SELECT TOP (@BatchSize)
        NEWID(),
        b.TenantId,
        b.WorkTaskId,
        N'{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{'
            + b.PropertiesJson
            + N'},"required":[' + b.KeyListJson + N'],"additionalProperties":false}',
        N'{"ui:order":[' + b.KeyListJson + N'],' + b.UiFieldsJson + N'}',
        N'{}',
        N'pending',
        1,
        NULL,
        NULL,
        SYSUTCDATETIME(),
        NULL
    FROM Built b
    ORDER BY b.WorkTaskId;   -- determinista: mismo lote en dos corridas del script

    SET @Inserted = @@ROWCOUNT;
    SET @TotalInserted = @TotalInserted + @Inserted;
END;

SELECT
    @TotalInserted AS ChecklistsInserted,
    (SELECT COUNT(*) FROM tenant.TaskChecklists) AS TotalChecklists,
    (SELECT COUNT(*) FROM tenant.WorkTasks WHERE IsDeleted = 0) AS TotalLiveTasks;
