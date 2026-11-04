using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AssetHub.Application.Sync.Queries;
using AssetHub.Domain.Concurrency;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Borrados dentro del delta sync (022 T056).
///
/// El borrado del dominio es lógico, así que la fila sigue existiendo y el delta la puede
/// reportar. Si no la reportara, el cliente no tendría forma de saber que la tarea
/// desapareció: seguiría mostrándola en la tablet y el técnico viajaría a un sitio por un
/// trabajo cancelado.
///
/// No hace falta una tabla de tombstones: <c>IsDeleted</c> + <c>DeletedAt</c> ya son el
/// tombstone, y <c>UpdatedAt</c> los pone en el stream. Escribir una segunda tabla sería
/// mantener dos verdades sobre el mismo hecho.
/// </summary>
public class DeltaTombstoneTests
{
    [Fact]
    public async Task DeletedTask_IsReportedAsATombstone()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var live = DeltaSyncTestHelper.NewTask("Viva");
        // InMemory no genera rowversion: se asigna uno para comprobar que el token viaja
        // en las filas vivas y no en las borradas.
        live.RowVersion = new byte[] { 7, 7, 7, 7 };
        var deleted = DeltaSyncTestHelper.NewTask("Borrada", deleted: true, deletedAt: DeltaSyncTestHelper.Base);

        f.Db.WorkTasks.AddRange(live, deleted);
        await f.SaveAsync();

        var page = await f.TaskChanges().Handle(new GetWorkTaskChangesQuery(), default);

        var tombstone = Assert.Single(page.Items, i => i.Id == deleted.Id);
        Assert.True(tombstone.Deleted);
        Assert.Equal(DeltaSyncTestHelper.Base, tombstone.DeletedAt);
        // Ya no hay nada que actualizar en una fila borrada: mandar un ETag invitaría a
        // escribir sobre ella y a recibir un 404.
        Assert.Null(tombstone.ETag);

        var alive = Assert.Single(page.Items, i => i.Id == live.Id);
        Assert.False(alive.Deleted);
        Assert.Equal(RowVersionToken.ToToken(live.RowVersion), alive.ETag);
    }

    [Fact]
    public async Task IncludeDeletedFalse_HidesTombstones()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var live = DeltaSyncTestHelper.NewTask("Viva");
        var deleted = DeltaSyncTestHelper.NewTask("Borrada", deleted: true, deletedAt: DeltaSyncTestHelper.Base);

        f.Db.WorkTasks.AddRange(live, deleted);
        await f.SaveAsync();

        var page = await f.TaskChanges().Handle(
            new GetWorkTaskChangesQuery { IncludeDeleted = false },
            default);

        var item = Assert.Single(page.Items);
        Assert.Equal(live.Id, item.Id);
    }

    [Fact]
    public async Task SoftDeletedAsset_IsReportedAsATombstone()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var asset = DeltaSyncTestHelper.NewAsset("A-300", deleted: true, deletedAt: DeltaSyncTestHelper.Base);

        f.Db.Assets.Add(asset);
        await f.SaveAsync();

        var page = await f.AssetChanges().Handle(new GetAssetChangesQuery(), default);

        var item = Assert.Single(page.Items);
        Assert.True(item.Deleted);
        Assert.Equal(DeltaSyncTestHelper.Base, item.DeletedAt);
        Assert.Null(item.ETag);
    }

    [Fact]
    public async Task SoftDeletedIncident_IsReportedAsATombstone()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var incident = DeltaSyncTestHelper.NewIncident("Cerrada por duplicado", deleted: true);

        f.Db.Incidents.Add(incident);
        await f.SaveAsync();

        var page = await f.IncidentChanges().Handle(new GetIncidentChangesQuery(), default);

        var item = Assert.Single(page.Items);
        Assert.True(item.Deleted);
        Assert.Equal(DeltaSyncTestHelper.Base, item.DeletedAt);
    }

    [Fact]
    public async Task RowsFromAnotherTenant_NeverAppear()
    {
        await using var f = DeltaSyncTestHelper.Create();

        f.Db.WorkTasks.Add(DeltaSyncTestHelper.NewTask("Propia"));
        await f.SaveAsync();

        await using (var other = f.OpenOtherTenant())
        {
            other.WorkTasks.Add(new Domain.Tasks.WorkTask
            {
                Id = Guid.NewGuid(),
                TenantId = DeltaSyncTestHelper.OtherTenantId,
                Title = "Ajena",
                State = Domain.Tasks.WorkTaskStates.Todo,
                TaskTypeCatalogItemId = Guid.NewGuid(),
                PriorityCatalogItemId = Guid.NewGuid(),
                IsDeleted = true,
                DeletedAt = DeltaSyncTestHelper.Base,
            });

            await other.SaveChangesAsync();
        }

        // El includeDeleted obliga a IgnoreQueryFilters, que también apaga el filtro de
        // tenant. Si la query no repone el TenantId a mano, esta fila ajena aparece en el
        // pull de este cliente.
        var page = await f.TaskChanges().Handle(new GetWorkTaskChangesQuery(), default);

        Assert.Single(page.Items);
        Assert.Equal("Propia", (await f.Db.WorkTasks.IgnoreQueryFilters()
            .FirstAsync(t => t.Id == page.Items[0].Id)).Title);
    }

    [Fact]
    public async Task StockChanges_AlwaysCarryETagAndAreNeverDeleted()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var warehouseId = Guid.NewGuid();
        f.Db.StockBalances.Add(DeltaSyncTestHelper.NewBalance(warehouseId, quantity: 7));
        await f.SaveAsync();

        // InMemory no genera rowversion; el token se simula para comprobar que viaja.
        var balance = await f.Db.StockBalances.FirstAsync();
        balance.RowVersion = new byte[] { 1, 2, 3, 4 };
        await f.SaveAsync();

        var page = await f.StockChanges().Handle(new GetStockChangesQuery(), default);

        var item = Assert.Single(page.Items);
        Assert.False(item.Deleted);
        Assert.Null(item.DeletedAt);
        Assert.Equal(RowVersionToken.ToToken(balance.RowVersion), item.ETag);
    }

    [Fact]
    public async Task StockChanges_CanBeScopedToAWarehouse()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var warehouseId = Guid.NewGuid();
        var otherWarehouseId = Guid.NewGuid();

        f.Db.StockBalances.AddRange(
            DeltaSyncTestHelper.NewBalance(warehouseId, 7),
            DeltaSyncTestHelper.NewBalance(otherWarehouseId, 3));

        await f.SaveAsync();

        var page = await f.StockChanges().Handle(
            new GetStockChangesQuery { WarehouseId = warehouseId },
            default);

        Assert.Single(page.Items);
    }

    [Fact]
    public async Task ResumingFromACursor_DoesNotRedeliverAlreadySyncedRows()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var first = DeltaSyncTestHelper.NewTask("Primera");
        f.Db.WorkTasks.Add(first);
        await f.SaveAsync();

        var page1 = await f.TaskChanges().Handle(new GetWorkTaskChangesQuery(), default);
        Assert.Single(page1.Items);

        var second = DeltaSyncTestHelper.NewTask("Segunda");
        f.Db.WorkTasks.Add(second);
        f.Now = DeltaSyncTestHelper.Base.AddMinutes(10);
        await f.SaveAsync();

        var page2 = await f.TaskChanges().Handle(
            new GetWorkTaskChangesQuery { Since = page1.NextCursor },
            default);

        var item = Assert.Single(page2.Items);
        Assert.Equal(second.Id, item.Id);
    }
}
