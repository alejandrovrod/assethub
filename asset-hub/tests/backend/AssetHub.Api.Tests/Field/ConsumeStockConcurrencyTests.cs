using System;
using System.Linq;
using System.Threading.Tasks;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Domain.Concurrency;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Concurrencia del consumo (022 T043).
///
/// El saldo no se "pisa": se compara contra la versión que el cliente declaró. El
/// escenario que importa es el de dos técnicos consumiendo el mismo repuesto desde dos
/// tablets; el segundo tiene que enterarse antes de escribir, no después.
///
/// InMemory no genera <c>rowversion</c>, así que el "otro escritor" se simula moviendo
/// la versión a mano — exactamente el efecto observable que produce SQL Server.
/// </summary>
public class ConsumeStockConcurrencyTests
{
    [Fact]
    public async Task StaleETag_Is412AndWritesNothing()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        await f.BumpRowVersionAsync(StockConsumptionTestHelper.Version2);

        var command = f.NewCommand(quantity: 1);

        var error = await Assert.ThrowsAsync<ConcurrencyException>(() =>
            f.Handler.Handle(command, default));

        Assert.Equal(ConcurrencyException.ErrorCode, error.Code);
        // El cliente puede reintentar sin releer: la versión vigente viaja en el error.
        Assert.Equal(RowVersionToken.ToToken(StockConsumptionTestHelper.Version2), error.CurrentETag);

        var balance = await f.FindBalanceAsync(f.WarehouseId, f.CatalogItemId);
        Assert.Equal(10m, balance!.QuantityOnHand);
        Assert.Empty(await f.Db.InventoryTransactions.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task RetryWithTheCurrentETag_Succeeds()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        var command = f.NewCommand(quantity: 1);
        await f.BumpRowVersionAsync(StockConsumptionTestHelper.Version2);

        var conflict = await Assert.ThrowsAsync<ConcurrencyException>(() =>
            f.Handler.Handle(command, default));

        command.ExpectedRowVersion = RowVersionToken.FromToken(conflict.CurrentETag);
        command.IdempotencyKey = Guid.NewGuid().ToString();

        var result = await f.Handler.Handle(command, default);

        Assert.Equal(9m, result.QuantityOnHand);
    }

    [Fact]
    public async Task SecondConsumerWithTheVersionItReadFirst_Is412OnceTheFirstOneWrites()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        // Ambos técnicos leyeron la versión 1 del saldo.
        var tabletA = f.NewCommand(quantity: 4);
        var tabletB = f.NewCommand(quantity: 4);

        var first = await f.Handler.Handle(tabletA, default);
        Assert.Equal(6m, first.QuantityOnHand);

        // En SQL Server el primer consumo ya cambió el rowversion. Se simula ese efecto
        // porque InMemory deja la columna en el valor que se le puso.
        await f.BumpRowVersionAsync(StockConsumptionTestHelper.Version2);

        var conflict = await Assert.ThrowsAsync<ConcurrencyException>(() =>
            f.Handler.Handle(tabletB, default));

        Assert.Equal(6m, (await f.FindBalanceAsync(f.WarehouseId, f.CatalogItemId))!.QuantityOnHand);
        Assert.Equal(1, await f.Db.InventoryTransactions.AsNoTracking().CountAsync());

        tabletB.ExpectedRowVersion = RowVersionToken.FromToken(conflict.CurrentETag);
        tabletB.IdempotencyKey = Guid.NewGuid().ToString();

        var retried = await f.Handler.Handle(tabletB, default);
        Assert.Equal(2m, retried.QuantityOnHand);
    }

    [Fact]
    public async Task IfMatchAny_SkipsTheVersionComparison()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        await f.BumpRowVersionAsync(StockConsumptionTestHelper.Version2);

        var command = f.NewCommand(quantity: 1);
        command.ExpectedRowVersion = null; // If-Match: *

        var result = await f.Handler.Handle(command, default);

        Assert.Equal(9m, result.QuantityOnHand);
    }

    [Fact]
    public async Task MissingBalanceRowWithAnExplicitETag_ReportsInsufficientStock()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        // El cliente leyó un saldo que ya no existe (fila borrada o nunca creada).
        var gone = await f.Db.StockBalances
            .FirstAsync(s => s.WarehouseId == f.WarehouseId && s.CatalogItemId == f.CatalogItemId);

        f.Db.StockBalances.Remove(gone);
        await f.Db.SaveChangesAsync();

        var command = f.NewCommand(quantity: 1);
        command.ExpectedRowVersion = StockConsumptionTestHelper.Version1;

        // Sin fila el saldo es 0, y la política no permite negativos: 409 con
        // alternativas es más accionable que un 412 sobre una fila que no volverá.
        var error = await Assert.ThrowsAsync<InsufficientStockException>(() =>
            f.Handler.Handle(command, default));

        Assert.Equal(0m, error.Available);
    }

    [Fact]
    public async Task MissingBalanceRowWithAnExplicitETag_Is412WhenNegativesAreAllowed()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10, allowNegative: true);

        var gone = await f.Db.StockBalances
            .FirstAsync(s => s.WarehouseId == f.WarehouseId && s.CatalogItemId == f.CatalogItemId);

        f.Db.StockBalances.Remove(gone);
        await f.Db.SaveChangesAsync();

        var command = f.NewCommand(quantity: 1);
        command.ExpectedRowVersion = StockConsumptionTestHelper.Version1;

        await Assert.ThrowsAsync<ConcurrencyException>(() => f.Handler.Handle(command, default));
    }
}
