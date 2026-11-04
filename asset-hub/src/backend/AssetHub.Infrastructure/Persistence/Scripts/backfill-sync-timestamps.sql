-- =============================================================================
-- 022 T081 - Backfill de UpdatedAt/RowVersion para sync incremental
--
-- Por qué existe: las filas que existían antes de la migración AddSyncTimestamps
-- tienen UpdatedAt = CreatedAt (o el default de la columna). Esto hace que el
-- primer pull del cliente (since=0) traiga todo, pero las filas nunca modificadas
-- quedan con un UpdatedAt que no refleja su "última modificación real".
--
-- Qué hace: actualiza UpdatedAt = CreatedAt para WorkTasks e Incidents que todavía
-- no tienen un valor coherente, en lotes de 5000 con WAITFOR DELAY para no
-- saturar el log de transacciones.
--
-- Propiedades:
--   * Idempotente  -> sólo toca filas donde UpdatedAt IS NULL o UpdatedAt < CreatedAt
--   * Por lotes    -> TOP 5000 por iteración
--   * Reversible   -> no cambia datos de negocio, sólo stamps de sync
-- =============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- ---------------------------------------------------------------------------
-- WorkTasks: UpdatedAt = CreatedAt (si falta o es incoherente)
-- ---------------------------------------------------------------------------
IF COL_LENGTH('tenant.WorkTasks', 'UpdatedAt') IS NOT NULL
BEGIN
    DECLARE @InsertedW int = 1;
    WHILE @InsertedW > 0
    BEGIN
        UPDATE TOP (5000) tenant.WorkTasks
        SET UpdatedAt = CreatedAt
        WHERE UpdatedAt IS NULL
           OR UpdatedAt < CreatedAt;

        SET @InsertedW = @@ROWCOUNT;

        IF @InsertedW > 0
            WAITFOR DELAY '00:00:00.100';
    END;
END;

-- ---------------------------------------------------------------------------
-- Incidents: CreatedAt = ReportedAt, UpdatedAt = ReportedAt (si falta)
-- ---------------------------------------------------------------------------
IF COL_LENGTH('tenant.Incidents', 'CreatedAt') IS NOT NULL
BEGIN
    DECLARE @InsertedI int = 1;
    WHILE @InsertedI > 0
    BEGIN
        UPDATE TOP (5000) tenant.Incidents
        SET CreatedAt = COALESCE(CreatedAt, ReportedAt),
            UpdatedAt = COALESCE(UpdatedAt, ReportedAt, CreatedAt)
        WHERE CreatedAt IS NULL
           OR UpdatedAt IS NULL
           OR UpdatedAt < CreatedAt;

        SET @InsertedI = @@ROWCOUNT;

        IF @InsertedI > 0
            WAITFOR DELAY '00:00:00.100';
    END;
END;

-- ---------------------------------------------------------------------------
-- Assets: normalizar filas preexistentes (ya tienen UpdatedAt, pero asegurar)
-- ---------------------------------------------------------------------------
IF COL_LENGTH('tenant.Assets', 'UpdatedAt') IS NOT NULL
BEGIN
    DECLARE @InsertedA int = 1;
    WHILE @InsertedA > 0
    BEGIN
        UPDATE TOP (5000) tenant.Assets
        SET UpdatedAt = COALESCE(UpdatedAt, CreatedAt, SYSUTCDATETIME())
        WHERE UpdatedAt IS NULL;

        SET @InsertedA = @@ROWCOUNT;

        IF @InsertedA > 0
            WAITFOR DELAY '00:00:00.100';
    END;
END;

-- ---------------------------------------------------------------------------
-- StockBalances: asegurar UpdatedAt (ya tienen, pero normalizar nulls)
-- ---------------------------------------------------------------------------
IF COL_LENGTH('tenant.StockBalances', 'UpdatedAt') IS NOT NULL
BEGIN
    DECLARE @InsertedS int = 1;
    WHILE @InsertedS > 0
    BEGIN
        UPDATE TOP (5000) tenant.StockBalances
        SET UpdatedAt = COALESCE(UpdatedAt, SYSUTCDATETIME())
        WHERE UpdatedAt IS NULL;

        SET @InsertedS = @@ROWCOUNT;

        IF @InsertedS > 0
            WAITFOR DELAY '00:00:00.100';
    END;
END;

SELECT
    (SELECT COUNT(*) FROM tenant.WorkTasks WHERE UpdatedAt IS NULL) AS WorkTasksNull,
    (SELECT COUNT(*) FROM tenant.Incidents WHERE UpdatedAt IS NULL) AS IncidentsNull,
    (SELECT COUNT(*) FROM tenant.Assets WHERE UpdatedAt IS NULL) AS AssetsNull,
    (SELECT COUNT(*) FROM tenant.StockBalances WHERE UpdatedAt IS NULL) AS StockBalancesNull;
