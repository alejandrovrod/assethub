using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Reintento del consumo (022 T042).
///
/// El caso real: el técnico toca "Consumir", la tablet pierde señal antes de recibir la
/// respuesta, la app reintenta. Sin replay, el almacén descuenta dos veces y el
/// inventario queda descuadrado sin que nadie lo note. El replay tiene que devolver el
/// movimiento original y **no** volver a tocar el saldo.
/// </summary>
public class ConsumeStockIdempotencyTests
{
    [Fact]
    public async Task SameKeyTwice_DiscountsOnlyOnce()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        var command = f.NewCommand(quantity: 3);

        var first = await f.Handler.Handle(command, default);
        var second = await f.Handler.Handle(command, default);

        Assert.False(first.WasReplay);
        Assert.True(second.WasReplay);
        Assert.Equal(first.Id, second.Id);

        // El segundo resultado reporta el saldo actual, no el de antes del consumo.
        Assert.Equal(7m, second.QuantityOnHand);

        var balance = await f.FindBalanceAsync(f.WarehouseId, f.CatalogItemId);
        Assert.Equal(7m, balance!.QuantityOnHand);

        Assert.Equal(1, await f.Db.InventoryTransactions.AsNoTracking().CountAsync());
    }

    [Fact]
    public async Task ReplayWinsOverAStaleETag()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        var command = f.NewCommand(quantity: 1);
        var first = await f.Handler.Handle(command, default);

        // Otro dispositivo consumió después: la versión que trae el reintento ya no vale.
        await f.BumpRowVersionAsync(StockConsumptionTestHelper.Version2);

        // Aun así el reintento NO es un 412: la key demuestra que este movimiento ya
        // se aplicó y volver a exigir la precondición dejaría al cliente en un bucle.
        var second = await f.Handler.Handle(command, default);

        Assert.True(second.WasReplay);
        Assert.Equal(first.Id, second.Id);
        Assert.Equal(9m, second.QuantityOnHand);
    }

    [Fact]
    public async Task DifferentKeys_ConsumeTwice()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        await f.Handler.Handle(f.NewCommand(quantity: 2), default);
        await f.Handler.Handle(f.NewCommand(quantity: 2), default);

        var balance = await f.FindBalanceAsync(f.WarehouseId, f.CatalogItemId);
        Assert.Equal(6m, balance!.QuantityOnHand);
        Assert.Equal(2, await f.Db.InventoryTransactions.AsNoTracking().CountAsync());
    }

    [Fact]
    public async Task ReplayOfAKeyUsedForAnotherItem_ReturnsTheOriginalMovement()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10, secondWarehouseOnHand: 5);

        var command = f.NewCommand(quantity: 2);
        var first = await f.Handler.Handle(command, default);

        // Misma key, otro almacén: el middleware rechazaría este caso por fingerprint
        // distinto (`409 idempotency_key_reuse`). A nivel handler, la key sigue mandando:
        // es la misma operación ya aplicada y no se descuenta nada del segundo almacén.
        var altered = f.NewCommand(quantity: 2);
        altered.IdempotencyKey = command.IdempotencyKey;
        altered.WarehouseId = f.SecondWarehouseId;

        var replay = await f.Handler.Handle(altered, default);

        Assert.True(replay.WasReplay);
        Assert.Equal(first.Id, replay.Id);

        var untouched = await f.FindBalanceAsync(f.SecondWarehouseId, f.CatalogItemId);
        Assert.Equal(5m, untouched!.QuantityOnHand);
    }
}
