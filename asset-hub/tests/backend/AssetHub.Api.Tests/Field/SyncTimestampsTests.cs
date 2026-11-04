using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Timestamps que sostienen el delta sync (022 T045–T048).
///
/// Lo que se prueba no es "hay una columna UpdatedAt": es que se mueve exactamente cuando
/// la fila cambia. Si se mueve de más, cada pull trae medio tenant; si se mueve de menos,
/// el cambio no llega nunca al dispositivo y el técnico trabaja sobre datos viejos sin
/// enterarse.
/// </summary>
public class SyncTimestampsTests
{
    [Fact]
    public async Task AddedTask_GetsBothTimestampsFromTheContextClock()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var task = DeltaSyncTestHelper.NewTask("Cambiar filtro");
        task.CreatedAt = default; // simula una entidad construida sin fecha

        f.Db.WorkTasks.Add(task);
        await f.SaveAsync();

        Assert.Equal(DeltaSyncTestHelper.Base, task.CreatedAt);
        Assert.Equal(DeltaSyncTestHelper.Base, task.UpdatedAt);
    }

    [Fact]
    public async Task AddedTask_KeepsAnExplicitCreatedAt()
    {
        await using var f = DeltaSyncTestHelper.Create();

        // Los importadores preservan la fecha real del archivo; pisarla con "ahora"
        // destruiría el dato de origen.
        var original = new DateTime(2023, 5, 5, 10, 0, 0, DateTimeKind.Utc);
        var task = DeltaSyncTestHelper.NewTask("Tarea importada");
        task.CreatedAt = original;

        f.Db.WorkTasks.Add(task);
        await f.SaveAsync();

        Assert.Equal(original, task.CreatedAt);
        Assert.Equal(DeltaSyncTestHelper.Base, task.UpdatedAt);
    }

    [Fact]
    public async Task ModifiedTask_BumpsUpdatedAtWithoutTouchingCreatedAt()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var task = DeltaSyncTestHelper.NewTask("Revisar tablero");
        f.Db.WorkTasks.Add(task);
        await f.SaveAsync();

        var createdAt = task.CreatedAt;

        f.Now = DeltaSyncTestHelper.Base.AddHours(3);
        task.Title = "Revisar tablero eléctrico";
        await f.SaveAsync();

        Assert.Equal(DeltaSyncTestHelper.Base.AddHours(3), task.UpdatedAt);
        Assert.Equal(createdAt, task.CreatedAt);
    }

    [Fact]
    public async Task ReadingDoesNotTouchTimestamps()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var task = DeltaSyncTestHelper.NewTask("Inspección");
        f.Db.WorkTasks.Add(task);
        await f.SaveAsync();

        var updatedAt = task.UpdatedAt;

        f.Now = DeltaSyncTestHelper.Base.AddDays(1);
        var reloaded = await f.Db.WorkTasks.SingleAsync(t => t.Id == task.Id);

        // Nada se modificó: el entry sigue en Unchanged y no debe pasar por el interceptor.
        await f.SaveAsync();

        Assert.Equal(updatedAt, reloaded.UpdatedAt);
    }

    [Fact]
    public async Task SaveChanges_WithoutAsync_AlsoAppliesTheTimestamps()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var task = DeltaSyncTestHelper.NewTask("Sincrónico");
        task.CreatedAt = default;

        f.Db.WorkTasks.Add(task);
        f.Db.SaveChanges();

        Assert.Equal(DeltaSyncTestHelper.Base, task.CreatedAt);
        Assert.Equal(DeltaSyncTestHelper.Base, task.UpdatedAt);
    }

    [Fact]
    public async Task AddedIncident_GetsBothTimestamps()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var incident = DeltaSyncTestHelper.NewIncident("Fuga de aceite");
        incident.CreatedAt = default;

        f.Db.Incidents.Add(incident);
        await f.SaveAsync();

        Assert.Equal(DeltaSyncTestHelper.Base, incident.CreatedAt);
        Assert.Equal(DeltaSyncTestHelper.Base, incident.UpdatedAt);
    }

    [Fact]
    public async Task AddedAsset_GetsBothTimestamps()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var asset = DeltaSyncTestHelper.NewAsset("A-100");

        f.Db.Assets.Add(asset);
        await f.SaveAsync();

        Assert.Equal(DeltaSyncTestHelper.Base, asset.CreatedAt);
        Assert.Equal(DeltaSyncTestHelper.Base, asset.UpdatedAt);
    }

    [Fact]
    public async Task ModifyingAnAsset_MovesItInTheStream()
    {
        await using var f = DeltaSyncTestHelper.Create();

        var asset = DeltaSyncTestHelper.NewAsset("A-200");
        f.Db.Assets.Add(asset);
        await f.SaveAsync();

        f.Now = DeltaSyncTestHelper.Base.AddMinutes(5);
        asset.Name = "Activo renombrado";
        await f.SaveAsync();

        Assert.Equal(DeltaSyncTestHelper.Base.AddMinutes(5), asset.UpdatedAt);
    }
}
