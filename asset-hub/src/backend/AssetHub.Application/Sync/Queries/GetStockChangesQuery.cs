using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Sync.Dtos;
using AssetHub.Domain.Concurrency;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Sync.Queries;

/// <summary>
/// Pull incremental de saldos de inventario (022 §8.2).
///
/// Los saldos no se borran: cuando un almacén deja de tener un ítem la fila queda en cero.
/// Por eso este stream no expone <c>includeDeleted</c> ni devuelve filas borradas — todas
/// las que viajan son válidas y el cliente las usa para decidir si puede consumir sin red.
/// </summary>
public class GetStockChangesQuery : IRequest<ChangePageDto>
{
    public string? Since { get; set; }

    public int? Limit { get; set; }

    /// <summary>Acota el pull al almacén del técnico. Sin valor, devuelve todos los del tenant.</summary>
    public Guid? WarehouseId { get; set; }
}

public class GetStockChangesQueryHandler : IRequestHandler<GetStockChangesQuery, ChangePageDto>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;

    public GetStockChangesQueryHandler(ITenantDbContext db, ITenantResolver tenantResolver)
    {
        _db = db;
        _tenantResolver = tenantResolver;
    }

    public async Task<ChangePageDto> Handle(GetStockChangesQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId()
            ?? throw new UnauthorizedAccessException("A tenant is required to pull changes.");

        var limit = DeltaSync.NormalizeLimit(request.Limit);
        var cursor = DeltaSync.ParseSince(request.Since);

        // Este DbSet sólo filtra por tenant (los saldos no tienen borrado lógico), así que
        // IgnoreQueryFilters no es imprescindible; se usa igual para que las cuatro
        // queries compartan la misma forma y el aislamiento no dependa de qué filtro tenga
        // cada entidad hoy.
        var query = _db.StockBalances
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(s => s.TenantId == tenantId);

        if (request.WarehouseId.HasValue)
        {
            var warehouseId = request.WarehouseId.Value;
            query = query.Where(s => s.WarehouseId == warehouseId);
        }

        if (cursor is { } position)
        {
            var after = position.UpdatedAt;
            var afterId = position.Id;

            query = query.Where(s =>
                s.UpdatedAt > after || (s.UpdatedAt == after && s.Id.CompareTo(afterId) > 0));
        }

        var rows = await query
            .OrderBy(s => s.UpdatedAt)
            .ThenBy(s => s.Id)
            .Take(limit + 1)
            .Select(s => new
            {
                s.Id,
                s.UpdatedAt,
                s.RowVersion,
            })
            .ToListAsync(cancellationToken);

        var items = rows
            .Select(s => new ChangeItemDto
            {
                Id = s.Id,
                UpdatedAt = s.UpdatedAt,
                Deleted = false,
                DeletedAt = null,
                ETag = RowVersionToken.ToToken(s.RowVersion),
            })
            .ToList();

        return DeltaSync.BuildPage(items, limit);
    }
}
