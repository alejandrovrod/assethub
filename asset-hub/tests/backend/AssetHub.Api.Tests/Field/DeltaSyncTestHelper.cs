using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Sync.Queries;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Incidents;
using AssetHub.Domain.Inventory;
using AssetHub.Domain.Tasks;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Base común de los tests de delta sync (022 Fase 6).
///
/// El reloj está congelado y es parte del fixture: el orden del stream es
/// <c>(UpdatedAt, Id)</c>, y sin poder fijar el tiempo no se puede sembrar "tres filas con
/// el mismo timestamp" —que es justo el caso donde una paginación mal hecha duplica o
/// saltea— sin dormir el test y esperar que el reloj avance.
/// </summary>
internal static class DeltaSyncTestHelper
{
    public static readonly Guid TenantId = Guid.Parse("d0000000-0000-0000-0000-000000000001");
    public static readonly Guid OtherTenantId = Guid.Parse("d0000000-0000-0000-0000-000000000002");

    public static readonly DateTime Base = new(2026, 1, 1, 8, 0, 0, DateTimeKind.Utc);

    internal sealed class ClockedDbContext : TenantDbContext
    {
        public ClockedDbContext(DbContextOptions<TenantDbContext> options, ITenantResolver resolver)
            : base(options, resolver)
        {
        }

        /// <summary>Reloj manipulado por el test. El interceptor lo lee en cada SaveChanges.</summary>
        public DateTime Now { get; set; } = Base;

        protected override DateTime UtcNow => Now;
    }

    internal sealed class Fixture : IAsyncDisposable
    {
        public required ClockedDbContext Db { get; init; }
        public required InMemoryDatabaseRoot Root { get; init; }
        public required string Store { get; init; }

        public DateTime Now
        {
            get => Db.Now;
            set => Db.Now = value;
        }

        public GetWorkTaskChangesQueryHandler TaskChanges(Guid? userId = null)
            => new(Db, new WorkTaskTestHelper.FakeTenantResolver(TenantId), new WorkTaskTestHelper.FakeCurrentUser(userId));

        public GetIncidentChangesQueryHandler IncidentChanges(Guid? userId = null)
            => new(Db, new WorkTaskTestHelper.FakeTenantResolver(TenantId), new WorkTaskTestHelper.FakeCurrentUser(userId));

        public GetAssetChangesQueryHandler AssetChanges()
            => new(Db, new WorkTaskTestHelper.FakeTenantResolver(TenantId));

        public GetStockChangesQueryHandler StockChanges()
            => new(Db, new WorkTaskTestHelper.FakeTenantResolver(TenantId));

        /// <summary>
        /// Contexto del otro tenant sobre el mismo store. Es la única forma de sembrar filas
        /// ajenas: el filtro global no deja escribirlas desde el contexto del tenant actual.
        /// </summary>
        public ClockedDbContext OpenOtherTenant(string? store = null)
            => new(
                new DbContextOptionsBuilder<TenantDbContext>()
                    .UseInMemoryDatabase(store ?? Store, Root)
                    .Options,
                new WorkTaskTestHelper.FakeTenantResolver(OtherTenantId));

        public Task<int> SaveAsync() => Db.SaveChangesAsync();

        public async ValueTask DisposeAsync() => await Db.DisposeAsync();
    }

    public static Fixture Create()
    {
        var store = "delta-sync-" + Guid.NewGuid().ToString("N");
        var root = new InMemoryDatabaseRoot();

        var db = new ClockedDbContext(
            new DbContextOptionsBuilder<TenantDbContext>()
                .UseInMemoryDatabase(store, root)
                .Options,
            new WorkTaskTestHelper.FakeTenantResolver(TenantId));

        return new Fixture { Db = db, Root = root, Store = store };
    }

    public static WorkTask NewTask(
        string title,
        Guid? employeeId = null,
        Guid? teamId = null,
        bool deleted = false,
        DateTime? deletedAt = null)
        => new()
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            Title = title,
            State = WorkTaskStates.Todo,
            TaskTypeCatalogItemId = Guid.NewGuid(),
            PriorityCatalogItemId = Guid.NewGuid(),
            AssignedEmployeeId = employeeId,
            AssignedTeamId = teamId,
            IsDeleted = deleted,
            DeletedAt = deletedAt,
        };

    public static Incident NewIncident(string title, bool deleted = false)
        => new()
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            Title = title,
            AssetId = Guid.NewGuid(),
            TypeId = Guid.NewGuid(),
            State = IncidentStates.Reported,
            ReportedAt = Base,
            IsDeleted = deleted,
            DeletedAt = deleted ? Base : null,
        };

    public static Asset NewAsset(string code, bool deleted = false, DateTime? deletedAt = null)
        => new()
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            AssetTemplateId = Guid.NewGuid(),
            Path = "/" + code,
            Code = code,
            Name = "Activo " + code,
            State = "operational",
            IsDeleted = deleted,
            DeletedAt = deletedAt,
        };

    public static StockBalance NewBalance(Guid warehouseId, decimal quantity = 10)
        => new()
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            WarehouseId = warehouseId,
            CatalogItemId = Guid.NewGuid(),
            QuantityOnHand = quantity,
            AverageUnitCost = 5,
        };
}
