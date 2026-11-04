using System;
using System.Linq;
using System.Threading.Tasks;
using AssetHub.Application.Inventory.Queries;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Inventory;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Aislamiento por tenant del consumo (022 T044).
///
/// Un id ajeno no debe distinguirse de un id inexistente: 404 en ambos casos. Si el
/// endpoint contestara "existe pero no es tuyo", el error se vuelve un oráculo para
/// enumerar el inventario de otro cliente.
/// </summary>
public class ConsumeStockTenantScopeTests
{
    [Fact]
    public async Task ForeignCatalogItem_IsTreatedAsNonExistent()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        var command = f.NewCommand();
        command.CatalogItemId = f.ForeignCatalogItemId;

        var error = await Assert.ThrowsAsync<NotFoundException>(() =>
            f.Handler.Handle(command, default));

        Assert.Contains("CatalogItem", error.Message);
        var balance = await f.FindBalanceAsync(f.WarehouseId, f.CatalogItemId);
        Assert.Equal(10m, balance!.QuantityOnHand);
    }

    [Fact]
    public async Task ForeignWarehouse_IsTreatedAsNonExistent()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        var command = f.NewCommand();
        command.WarehouseId = f.ForeignWarehouseId;

        var error = await Assert.ThrowsAsync<NotFoundException>(() =>
            f.Handler.Handle(command, default));

        Assert.Contains("Warehouse", error.Message);
    }

    [Fact]
    public async Task ForeignWorkTask_IsTreatedAsNonExistent()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        var command = f.NewCommand();
        command.WorkTaskId = f.ForeignTaskId;

        var error = await Assert.ThrowsAsync<NotFoundException>(() =>
            f.Handler.Handle(command, default));

        Assert.Contains("WorkTask", error.Message);
    }

    [Fact]
    public async Task ForeignCatalogItem_IsNotOfferedAsAnAlternative()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 1, secondWarehouseOnHand: 0);

        var alternatives = await new GetStockAlternativesQueryHandler(f.Db).Handle(
            new GetStockAlternativesQuery
            {
                CatalogItemId = f.CatalogItemId,
                ExcludeWarehouseId = f.WarehouseId,
            },
            default);

        Assert.Empty(alternatives);
        Assert.DoesNotContain(alternatives, a => a.CatalogItemId == f.ForeignCatalogItemId);
    }

    [Fact]
    public async Task TheSameIdempotencyKeyInAnotherTenant_IsNotAReplay()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        var key = Guid.NewGuid().ToString();

        await using (var foreign = StockConsumptionTestHelper.CreateDbContext(
                         StockConsumptionTestHelper.OtherTenantId, f.Store))
        {
            foreign.InventoryTransactions.Add(new InventoryTransaction
            {
                Id = Guid.NewGuid(),
                TenantId = StockConsumptionTestHelper.OtherTenantId,
                WarehouseId = f.ForeignWarehouseId,
                CatalogItemId = f.ForeignCatalogItemId,
                Type = InventoryTransactionType.Issue,
                State = InventoryTransactionState.Posted,
                Quantity = -5,
                UnitCost = 1,
                IdempotencyKey = key,
                CreatedAt = DateTime.UtcNow,
            });

            await foreign.SaveChangesAsync();
        }

        var command = f.NewCommand(quantity: 2);
        command.IdempotencyKey = key;

        var result = await f.Handler.Handle(command, default);

        // La unicidad de la key es por tenant: la operación del otro tenant no puede
        // "absorber" el consumo de éste.
        Assert.False(result.WasReplay);
        Assert.Equal(8m, result.QuantityOnHand);

        var transactions = await f.Db.InventoryTransactions.AsNoTracking().ToListAsync();
        var own = Assert.Single(transactions);
        Assert.Equal(key, own.IdempotencyKey);
        Assert.Equal(-2m, own.Quantity);
    }
}
