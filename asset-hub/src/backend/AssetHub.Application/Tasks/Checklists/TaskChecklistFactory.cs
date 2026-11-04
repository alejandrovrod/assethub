using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Tasks.Checklists;

/// <summary>
/// Crea el snapshot de checklist de una tarea recién creada.
///
/// Sólo se crea fila si la plantilla del activo trae ítems: una tarea sin formulario
/// no tiene por qué pagar una fila con esquema vacío, y el endpoint distingue
/// "sin checklist" (204) de "checklist" (200).
/// </summary>
public static class TaskChecklistFactory
{
    public static TaskChecklist? TryBuild(Guid tenantId, Guid workTaskId, string? legacyChecklistJson)
    {
        var schema = ChecklistSchemaFactory.FromLegacyChecklist(legacyChecklistJson);
        if (schema is null)
        {
            return null;
        }

        return new TaskChecklist
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WorkTaskId = workTaskId,
            SchemaJson = schema.SchemaJson,
            UiSchemaJson = schema.UiSchemaJson,
            ResponseJson = "{}",
            State = TaskChecklistStates.Pending,
            Version = 1,
            CreatedAt = DateTime.UtcNow,
        };
    }

    /// <summary>
    /// Busca el <c>MaintenanceChecklist</c> legado de la plantilla del activo al que
    /// pertenece la tarea. La tarea puede colgar de un activo, de una orden o de un
    /// incidente; los tres llevan a un activo, así que los tres sirven de fuente.
    /// </summary>
    public static async Task<string?> ResolveLegacyChecklistJsonAsync(
        ITenantDbContext db,
        Guid? assetId,
        Guid? maintenanceOrderId,
        Guid? incidentId,
        CancellationToken cancellationToken = default)
    {
        if (assetId.HasValue)
        {
            return await db.Assets
                .AsNoTracking()
                .Where(a => a.Id == assetId.Value)
                .Select(a => a.AssetTemplate.MaintenanceChecklist)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (maintenanceOrderId.HasValue)
        {
            return await db.MaintenanceOrders
                .AsNoTracking()
                .Where(o => o.Id == maintenanceOrderId.Value)
                .Select(o => o.Asset != null ? o.Asset.AssetTemplate.MaintenanceChecklist : null)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (incidentId.HasValue)
        {
            return await db.Incidents
                .AsNoTracking()
                .Where(i => i.Id == incidentId.Value)
                .Select(i => i.Asset != null ? i.Asset.AssetTemplate.MaintenanceChecklist : null)
                .FirstOrDefaultAsync(cancellationToken);
        }

        return null;
    }
}
