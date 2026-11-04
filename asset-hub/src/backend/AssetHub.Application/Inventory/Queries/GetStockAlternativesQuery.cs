using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Inventory.Queries;

/// <summary>
/// Dónde más se puede conseguir el material que falta.
///
/// Sólo se ofrecen filas con stock positivo: una alternativa con 0 unidades no resuelve
/// el problema del técnico y sólo agrega ruido a la lista.
/// </summary>
public class StockAlternativeDto
{
    public Guid WarehouseId { get; set; }
    public string WarehouseName { get; set; } = string.Empty;
    public Guid CatalogItemId { get; set; }
    public decimal QuantityOnHand { get; set; }
}

/// <summary>
/// Busca el mismo ítem —o su padre en la jerarquía de catálogo— en otros almacenes.
///
/// El ítem padre entra en la búsqueda porque en la práctica los SKU hijos son variantes
/// comerciales del mismo insumo ("Filtro de aceite Bosch" / "Filtro de aceite"): si el
/// técnico se quedó sin la variante exacta, el padre suele ser lo que hay en el depósito.
/// </summary>
public class GetStockAlternativesQuery : IRequest<List<StockAlternativeDto>>
{
    public Guid CatalogItemId { get; set; }

    /// <summary>Almacén del intento fallido, para no repetir en la lista su propio saldo.</summary>
    public Guid? ExcludeWarehouseId { get; set; }

    public int Limit { get; set; } = 5;
}

public class GetStockAlternativesQueryHandler : IRequestHandler<GetStockAlternativesQuery, List<StockAlternativeDto>>
{
    private readonly ITenantDbContext _db;

    public GetStockAlternativesQueryHandler(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task<List<StockAlternativeDto>> Handle(
        GetStockAlternativesQuery request,
        CancellationToken cancellationToken)
    {
        var limit = Math.Clamp(request.Limit, 1, 5);

        var item = await _db.CatalogItems
            .AsNoTracking()
            .Where(c => c.Id == request.CatalogItemId)
            .Select(c => new { c.Id, c.ParentItemId })
            .FirstOrDefaultAsync(cancellationToken);

        if (item is null)
        {
            return new List<StockAlternativeDto>();
        }

        var itemIds = new List<Guid> { item.Id };
        if (item.ParentItemId.HasValue && item.ParentItemId.Value != item.Id)
        {
            itemIds.Add(item.ParentItemId.Value);
        }

        var query = _db.StockBalances
            .AsNoTracking()
            .Where(s => itemIds.Contains(s.CatalogItemId) && s.QuantityOnHand > 0)
            .Where(s => s.Warehouse != null && s.Warehouse.IsActive && !s.Warehouse.IsDeleted);

        if (request.ExcludeWarehouseId.HasValue)
        {
            // El saldo del almacén donde falló el intento ya viaja como `available`;
            // repetirlo como alternativa sería ofrecer lo que el técnico acaba de pedir.
            var excludeWarehouseId = request.ExcludeWarehouseId.Value;
            var requestedItemId = request.CatalogItemId;
            query = query.Where(s => !(s.WarehouseId == excludeWarehouseId && s.CatalogItemId == requestedItemId));
        }

        return await query
            .OrderByDescending(s => s.QuantityOnHand)
            .ThenBy(s => s.Warehouse!.Name)
            .Take(limit)
            .Select(s => new StockAlternativeDto
            {
                WarehouseId = s.WarehouseId,
                WarehouseName = s.Warehouse!.Name,
                CatalogItemId = s.CatalogItemId,
                QuantityOnHand = s.QuantityOnHand,
            })
            .ToListAsync(cancellationToken);
    }
}
