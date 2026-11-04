using System;
using System.Linq;
using System.Threading.Tasks;
using AssetHub.Api.Configuration;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Application.Inventory.Queries;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Inventory;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Contrato del consumo de materiales (022 T041).
///
/// Lo que se prueba no es "descuenta stock": es que un consumo desde la tablet es
/// **trazable** (ligado a la tarea), **idempotente** (key obligatoria, sin invención
/// server-side) y **accionable cuando falla** (409 con alternativas, no un "no hay
/// stock" mudo).
/// </summary>
public class ConsumeStockTests
{
    [Fact]
    public async Task HappyPath_DiscountsStockAndLinksTheTask()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        var command = f.NewCommand(quantity: 2);
        var result = await f.Handler.Handle(command, default);

        Assert.False(result.WasReplay);
        Assert.Equal(8m, result.QuantityOnHand);
        Assert.False(result.NegativeStockWarning);
        Assert.NotEmpty(result.ETag);

        var balance = await f.FindBalanceAsync(f.WarehouseId, f.CatalogItemId);
        Assert.Equal(8m, balance!.QuantityOnHand);

        var transaction = await f.Db.InventoryTransactions.AsNoTracking().SingleAsync();
        Assert.Equal(InventoryTransactionType.Issue, transaction.Type);
        Assert.Equal(InventoryTransactionState.Posted, transaction.State);
        // El signo lo pone el servidor: el cliente manda la cantidad consumida, positiva.
        Assert.Equal(-2m, transaction.Quantity);
        Assert.Equal(f.TaskId, transaction.WorkTaskId);
        Assert.Equal(command.IdempotencyKey, transaction.IdempotencyKey);
        Assert.Equal("Reemplazo de filtro", transaction.Reason);
    }

    [Fact]
    public async Task MissingIdempotencyKey_IsRejectedBeforeTouchingStock()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        var command = f.NewCommand();
        command.IdempotencyKey = " ";

        var error = await Assert.ThrowsAsync<DomainException>(() => f.Handler.Handle(command, default));

        Assert.Equal("idempotency_key_required", error.Code);

        var balance = await f.FindBalanceAsync(f.WarehouseId, f.CatalogItemId);
        Assert.Equal(10m, balance!.QuantityOnHand);
        Assert.Empty(await f.Db.InventoryTransactions.AsNoTracking().ToListAsync());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-3)]
    public async Task NonPositiveQuantity_IsRejected(decimal quantity)
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        var error = await Assert.ThrowsAsync<DomainException>(() =>
            f.Handler.Handle(f.NewCommand(quantity), default));

        Assert.Equal("validation_error", error.Code);
    }

    [Fact]
    public async Task InsufficientStock_ReportsAvailableRequestedAndAlternatives()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 1, secondWarehouseOnHand: 25);

        var error = await Assert.ThrowsAsync<InsufficientStockException>(() =>
            f.Handler.Handle(f.NewCommand(quantity: 2), default));

        Assert.Equal(1m, error.Available);
        Assert.Equal(2m, error.Requested);

        var alternative = Assert.Single(error.Alternatives);
        Assert.Equal(f.SecondWarehouseId, alternative.WarehouseId);
        Assert.Equal("Almacén Norte", alternative.WarehouseName);
        Assert.Equal(25m, alternative.QuantityOnHand);

        // Nada se descontó: el 409 no es un "consumo parcial".
        var balance = await f.FindBalanceAsync(f.WarehouseId, f.CatalogItemId);
        Assert.Equal(1m, balance!.QuantityOnHand);
        Assert.Empty(await f.Db.InventoryTransactions.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task Alternatives_IncludeTheParentItemAndSkipTheFailedWarehouseRow()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(
            onHand: 0,
            secondWarehouseOnHand: 4,
            parentOnHand: 12);

        var alternatives = await new GetStockAlternativesQueryHandler(f.Db).Handle(
            new GetStockAlternativesQuery
            {
                CatalogItemId = f.CatalogItemId,
                ExcludeWarehouseId = f.WarehouseId,
            },
            default);

        Assert.Equal(2, alternatives.Count);
        // Ordenadas por cantidad: el padre en el almacén norte primero.
        Assert.Equal(f.ParentCatalogItemId, alternatives[0].CatalogItemId);
        Assert.Equal(12m, alternatives[0].QuantityOnHand);
        Assert.Equal(f.CatalogItemId, alternatives[1].CatalogItemId);
        Assert.Equal(4m, alternatives[1].QuantityOnHand);

        // El almacén del intento fallido no se ofrece a sí mismo como alternativa.
        Assert.DoesNotContain(alternatives, a => a.WarehouseId == f.WarehouseId && a.CatalogItemId == f.CatalogItemId);
    }

    [Fact]
    public async Task Alternatives_AreEmptyWhenNoOtherWarehouseHasStock()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(
            onHand: 1,
            secondWarehouseOnHand: 0,
            parentOnHand: 0);

        var alternatives = await new GetStockAlternativesQueryHandler(f.Db).Handle(
            new GetStockAlternativesQuery
            {
                CatalogItemId = f.CatalogItemId,
                ExcludeWarehouseId = f.WarehouseId,
            },
            default);

        Assert.Empty(alternatives);
    }

    [Fact]
    public async Task InsufficientStock_OnAStockRowThatDoesNotExistYet()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(createBalance: false);

        var error = await Assert.ThrowsAsync<InsufficientStockException>(() =>
            f.Handler.Handle(f.NewCommand(quantity: 1), default));

        Assert.Equal(0m, error.Available);
        Assert.Equal(1m, error.Requested);
    }

    [Fact]
    public async Task AllowNegativeStock_ConsumesAndWarns()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 1, allowNegative: true);

        var result = await f.Handler.Handle(f.NewCommand(quantity: 3), default);

        Assert.Equal(-2m, result.QuantityOnHand);
        Assert.True(result.NegativeStockWarning);

        var transaction = await f.Db.InventoryTransactions.AsNoTracking().SingleAsync();
        Assert.Equal(-3m, transaction.Quantity);
    }

    [Fact]
    public async Task AllowNegativeStock_WithNoBalanceRow_CreatesANegativeBalance()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(createBalance: false, allowNegative: true);

        // El cliente no puede mandar un If-Match concreto si la fila no existe; `*` sí.
        var command = f.NewCommand(quantity: 2);
        command.ExpectedRowVersion = null;

        var result = await f.Handler.Handle(command, default);

        Assert.Equal(-2m, result.QuantityOnHand);
        Assert.True(result.NegativeStockWarning);
    }

    [Fact]
    public async Task UnknownWorkTask_Is404()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        var command = f.NewCommand();
        command.WorkTaskId = Guid.NewGuid();

        await Assert.ThrowsAsync<NotFoundException>(() => f.Handler.Handle(command, default));
    }

    [Fact]
    public async Task StockList_ExposesTheVersionTheClientNeedsForIfMatch()
    {
        await using var f = await StockConsumptionTestHelper.CreateAsync(onHand: 10);

        var balances = await new GetStockBalancesQueryHandler(f.Db).Handle(
            new GetStockBalancesQuery { WarehouseId = f.WarehouseId, CatalogItemId = f.CatalogItemId },
            default);

        var balance = Assert.Single(balances);
        // Sin `etag` en el listado, el cliente no tiene con qué armar el If-Match y el
        // endpoint de consumos sería inalcanzable (428 en todos los intentos).
        Assert.Equal(
            AssetHub.Domain.Concurrency.RowVersionToken.ToToken(StockConsumptionTestHelper.Version1),
            balance.ETag);
    }

    // ------------------------------------------------------------------
    // Mapeo HTTP
    // ------------------------------------------------------------------
    [Fact]
    public async Task InsufficientStock_MapsTo409WithActionablePayload()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddRouting();
        builder.Services.AddAssetHubLocalization();

        var app = builder.Build();
        app.UseRequestLocalization();
        app.UseMiddleware<AssetHub.Api.Middleware.ExceptionHandlingMiddleware>();
        app.MapPost("/consume", _ => throw new InsufficientStockException(
            1m,
            3m,
            new[]
            {
                new StockAlternativeDto
                {
                    WarehouseId = Guid.Parse("c0c0c0c0-0000-0000-0000-000000000001"),
                    WarehouseName = "Almacén Norte",
                    CatalogItemId = Guid.Parse("c0c0c0c0-0000-0000-0000-000000000002"),
                    QuantityOnHand = 24m,
                },
            }));
        await app.StartAsync();

        await using var _app = app;
        var server = (TestServer)app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.Server.IServer>();
        using var client = server.CreateClient();

        var response = await client.PostAsync("/consume", null);
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(409, (int)response.StatusCode);
        Assert.Contains("insufficient_stock", body);
        Assert.Contains("\"available\":1", body);
        Assert.Contains("\"requested\":3", body);
        Assert.Contains("Almacén Norte", body);
        Assert.Contains("\"quantityOnHand\":24", body);
    }
}
