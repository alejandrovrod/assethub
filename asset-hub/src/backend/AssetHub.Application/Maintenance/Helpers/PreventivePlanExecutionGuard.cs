using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Incidents;
using AssetHub.Domain.Maintenance;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Maintenance.Helpers;

public static class PreventivePlanExecutionGuard
{
    public static async Task<(bool CanExecute, string? Reason)> CanExecuteForAssetAsync(
        ITenantDbContext db,
        Asset asset,
        Guid tenantId,
        CancellationToken cancellationToken = default)
    {
        var activeIncident = await db.Incidents
            .AsNoTracking()
            .AnyAsync(i =>
                i.AssetId == asset.Id &&
                i.TenantId == tenantId &&
                !i.IsDeleted &&
                IncidentStates.ActiveStates.Contains(i.State),
                cancellationToken);

        if (activeIncident)
        {
            return (false, $"Asset '{asset.Name}' has an active incident.");
        }

        var blockingOrder = await db.MaintenanceOrders
            .AsNoTracking()
            .AnyAsync(o =>
                o.AssetId == asset.Id &&
                o.TenantId == tenantId &&
                !o.IsDeleted &&
                o.State != MaintenanceOrderStates.Verified &&
                o.State != MaintenanceOrderStates.Cancelled,
                cancellationToken);

        if (blockingOrder)
        {
            return (false, $"Asset '{asset.Name}' has an open or unverified maintenance order.");
        }

        return (true, null);
    }
}
