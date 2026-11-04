using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.WorkTasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Inventory.Commands;
using AssetHub.Application.Inventory.Queries;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Inventory;
using AssetHub.Domain.Tasks;
using AssetHub.Infrastructure.Persistence;
using AssetHub.Infrastructure.Services;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Monta un tenant con almacenes, ítems de catálogo, una tarea y saldos, y devuelve el
/// handler real de <see cref="ConsumeStockCommand"/> con sus dependencias reales
/// (servicio de posting incluido).
///
/// Los datos de otro tenant se siembran con un contexto de ese otro tenant sobre el
/// mismo store: es la única forma de probar aislamiento con InMemory, porque el filtro
/// global no deja escribir filas ajenas desde el contexto del tenant actual.
/// </summary>
internal static class StockConsumptionTestHelper
{
    public static readonly Guid TenantId = Guid.Parse("b0b0b0b0-0000-0000-0000-000000000001");
    public static readonly Guid OtherTenantId = Guid.Parse("b0b0b0b0-0000-0000-0000-000000000002");

    public static readonly byte[] Version1 = { 1, 1, 1, 1, 1, 1, 1, 1 };
    public static readonly byte[] Version2 = { 2, 2, 2, 2, 2, 2, 2, 2 };

    internal sealed class Fixture : IAsyncDisposable
    {
        public required TenantDbContext Db { get; init; }
        public required ConsumeStockCommandHandler Handler { get; init; }

        /// <summary>Nombre del store InMemory, para sembrar datos de otro tenant.</summary>
        public required string Store { get; init; }

        public Guid WarehouseId { get; init; }
        public Guid SecondWarehouseId { get; init; }
        public Guid CatalogItemId { get; init; }
        public Guid ParentCatalogItemId { get; init; }
        public Guid TaskId { get; init; }

        public Guid ForeignWarehouseId { get; init; }
        public Guid ForeignCatalogItemId { get; init; }
        public Guid ForeignTaskId { get; init; }

        public byte[]? RowVersion { get; init; }

        public ConsumeStockCommand NewCommand(decimal quantity = 2) => new()
        {
            WarehouseId = WarehouseId,
            CatalogItemId = CatalogItemId,
            WorkTaskId = TaskId,
            Quantity = quantity,
            Reason = "Reemplazo de filtro",
            IdempotencyKey = Guid.NewGuid().ToString(),
            ExpectedRowVersion = RowVersion,
        };

        public Task<StockBalance?> FindBalanceAsync(Guid warehouseId, Guid itemId)
            => Db.StockBalances.AsNoTracking()
                .FirstOrDefaultAsync(s => s.WarehouseId == warehouseId && s.CatalogItemId == itemId);

        /// <summary>
        /// InMemory no genera <c>rowversion</c>: se simula al otro escritor moviendo la
        /// versión a mano, que es exactamente lo que SQL Server haría al consumir.
        /// </summary>
        public async Task BumpRowVersionAsync(byte[] version)
        {
            var balance = await Db.StockBalances
                .FirstAsync(s => s.WarehouseId == WarehouseId && s.CatalogItemId == CatalogItemId);

            balance.RowVersion = version;
            await Db.SaveChangesAsync();
        }

        public async ValueTask DisposeAsync() => await Db.DisposeAsync();
    }

    public static async Task<Fixture> CreateAsync(
        decimal onHand = 10,
        bool allowNegative = false,
        bool createBalance = true,
        decimal secondWarehouseOnHand = 25,
        decimal parentOnHand = 0)
    {
        var store = "stock-tests-" + Guid.NewGuid().ToString("N");
        var db = CreateDbContext(TenantId, store);

        var warehouseId = Guid.NewGuid();
        var secondWarehouseId = Guid.NewGuid();
        var catalogItemId = Guid.NewGuid();
        var parentItemId = Guid.NewGuid();
        var taskId = Guid.NewGuid();

        var foreignWarehouseId = Guid.NewGuid();
        var foreignCatalogItemId = Guid.NewGuid();
        var foreignTaskId = Guid.NewGuid();

        db.TenantInventorySettings.Add(new TenantInventorySettings
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            Enabled = true,
            OperatingMode = InventoryOperatingMode.Internal,
            AllowNegativeStock = allowNegative,
        });

        db.Warehouses.Add(new Warehouse
        {
            Id = warehouseId, TenantId = TenantId, Name = "Almacén Central", Code = "WH-01",
            IsActive = true, CreatedAt = DateTime.UtcNow,
        });

        db.Warehouses.Add(new Warehouse
        {
            Id = secondWarehouseId, TenantId = TenantId, Name = "Almacén Norte", Code = "WH-02",
            IsActive = true, CreatedAt = DateTime.UtcNow,
        });

        db.CatalogItems.Add(new CatalogItem
        {
            Id = parentItemId, CatalogId = Guid.NewGuid(), TenantId = TenantId, Code = "FILTER",
        });

        db.CatalogItems.Add(new CatalogItem
        {
            Id = catalogItemId, CatalogId = Guid.NewGuid(), TenantId = TenantId, Code = "FILTER-BOSCH",
            ParentItemId = parentItemId,
        });

        db.WorkTasks.Add(new WorkTask
        {
            Id = taskId,
            TenantId = TenantId,
            Title = "Revisar equipo",
            State = WorkTaskStates.InProgress,
            TaskTypeCatalogItemId = Guid.NewGuid(),
            PriorityCatalogItemId = Guid.NewGuid(),
        });

        if (createBalance)
        {
            db.StockBalances.Add(new StockBalance
            {
                Id = Guid.NewGuid(),
                TenantId = TenantId,
                WarehouseId = warehouseId,
                CatalogItemId = catalogItemId,
                QuantityOnHand = onHand,
                AverageUnitCost = 15m,
                UpdatedAt = DateTime.UtcNow,
                RowVersion = Version1,
            });
        }

        if (secondWarehouseOnHand > 0)
        {
            db.StockBalances.Add(new StockBalance
            {
                Id = Guid.NewGuid(),
                TenantId = TenantId,
                WarehouseId = secondWarehouseId,
                CatalogItemId = catalogItemId,
                QuantityOnHand = secondWarehouseOnHand,
                AverageUnitCost = 15m,
                UpdatedAt = DateTime.UtcNow,
                RowVersion = Version1,
            });
        }

        if (parentOnHand > 0)
        {
            db.StockBalances.Add(new StockBalance
            {
                Id = Guid.NewGuid(),
                TenantId = TenantId,
                WarehouseId = secondWarehouseId,
                CatalogItemId = parentItemId,
                QuantityOnHand = parentOnHand,
                AverageUnitCost = 12m,
                UpdatedAt = DateTime.UtcNow,
                RowVersion = Version1,
            });
        }

        await db.SaveChangesAsync();

        // Otro tenant: mismo store, otro contexto. Nunca debe ser alcanzable desde el
        // handler del tenant A.
        await using (var foreign = CreateDbContext(OtherTenantId, store))
        {
            foreign.Warehouses.Add(new Warehouse
            {
                Id = foreignWarehouseId, TenantId = OtherTenantId, Name = "Depósito ajeno", Code = "WH-X",
                IsActive = true, CreatedAt = DateTime.UtcNow,
            });

            foreign.CatalogItems.Add(new CatalogItem
            {
                Id = foreignCatalogItemId, CatalogId = Guid.NewGuid(), TenantId = OtherTenantId, Code = "FILTER-OTRO",
            });

            foreign.WorkTasks.Add(new WorkTask
            {
                Id = foreignTaskId,
                TenantId = OtherTenantId,
                Title = "Tarea ajena",
                State = WorkTaskStates.Todo,
                TaskTypeCatalogItemId = Guid.NewGuid(),
                PriorityCatalogItemId = Guid.NewGuid(),
            });

            foreign.StockBalances.Add(new StockBalance
            {
                Id = Guid.NewGuid(),
                TenantId = OtherTenantId,
                WarehouseId = foreignWarehouseId,
                CatalogItemId = foreignCatalogItemId,
                QuantityOnHand = 99,
                AverageUnitCost = 10m,
                UpdatedAt = DateTime.UtcNow,
                RowVersion = Version1,
            });

            await foreign.SaveChangesAsync();
        }

        var resolver = new WorkTaskTestHelper.FakeTenantResolver(TenantId);
        var currentUser = new WorkTaskTestHelper.FakeCurrentUser(Guid.NewGuid());
        var posting = new InventoryPostingService(db, resolver, currentUser);

        return new Fixture
        {
            Db = db,
            Store = store,
            Handler = new ConsumeStockCommandHandler(
                db,
                posting,
                resolver,
                new AlternativesMediator(db),
                WorkTaskTestHelper.CreateTaskAccess(db, currentUser)),
            WarehouseId = warehouseId,
            SecondWarehouseId = secondWarehouseId,
            CatalogItemId = catalogItemId,
            ParentCatalogItemId = parentItemId,
            TaskId = taskId,
            ForeignWarehouseId = foreignWarehouseId,
            ForeignCatalogItemId = foreignCatalogItemId,
            ForeignTaskId = foreignTaskId,
            RowVersion = createBalance ? Version1 : null,
        };
    }

    internal static TenantDbContext CreateDbContext(Guid tenantId, string store)
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(store)
            .Options;

        return new TenantDbContext(options, new WorkTaskTestHelper.FakeTenantResolver(tenantId));
    }

    /// <summary>
    /// Mediador mínimo que ejecuta la única query que el handler despacha
    /// (<see cref="GetStockAlternativesQuery"/>) contra el handler real.
    /// </summary>
    private sealed class AlternativesMediator : IMediator
    {
        private readonly ITenantDbContext _db;

        public AlternativesMediator(ITenantDbContext db) => _db = db;

        public Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = default)
        {
            if (request is GetStockAlternativesQuery query)
            {
                var result = new GetStockAlternativesQueryHandler(_db)
                    .Handle(query, cancellationToken)
                    .GetAwaiter()
                    .GetResult();

                return Task.FromResult((TResponse)(object)result);
            }

            throw new NotSupportedException($"Unexpected request: {request.GetType().Name}");
        }

        public Task Send<TRequest>(TRequest request, CancellationToken cancellationToken = default)
            where TRequest : IRequest
            => throw new NotSupportedException($"Unexpected request: {typeof(TRequest).Name}");

        public Task<object?> Send(object request, CancellationToken cancellationToken = default)
            => throw new NotSupportedException($"Unexpected request: {request.GetType().Name}");

        public Task Publish(object notification, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task Publish<TNotification>(TNotification notification, CancellationToken cancellationToken = default)
            where TNotification : INotification
            => Task.CompletedTask;

        public IAsyncEnumerable<TResponse> CreateStream<TResponse>(
            IStreamRequest<TResponse> request,
            CancellationToken cancellationToken = default)
            => AsyncEnumerable.Empty<TResponse>();

        public IAsyncEnumerable<object?> CreateStream(object request, CancellationToken cancellationToken = default)
            => AsyncEnumerable.Empty<object?>();
    }
}
