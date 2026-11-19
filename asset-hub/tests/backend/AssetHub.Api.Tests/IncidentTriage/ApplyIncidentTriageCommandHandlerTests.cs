using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Application.Incidents.Events;
using AssetHub.Application.IncidentTriage.Commands;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Maintenance.Events;
using AssetHub.Application.Tasks.Commands;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Incidents;
using AssetHub.Domain.Inventory;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Staff;
using AssetHub.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace AssetHub.Api.Tests.IncidentTriage;

public class ApplyIncidentTriageCommandHandlerTests
{
    private sealed class FakeTenantResolver : ITenantResolver
    {
        private readonly Guid _tenantId;
        public FakeTenantResolver(Guid tenantId) => _tenantId = tenantId;
        public Domain.Tenancy.Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => _tenantId;
        public Guid? GetCurrentUserId() => null;
    }

    private static TenantDbContext CreateDbContext(Guid tenantId)
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TenantDbContext(options, new FakeTenantResolver(tenantId));
    }

    private static (Guid IncidentId, Guid AssetId, Guid PriorityId, Guid EmployeeId, Guid PartId, Guid WarehouseId) SeedScenario(
        TenantDbContext db,
        Guid tenantId,
        byte[]? rowVersion = null)
    {
        var assetId = Guid.NewGuid();
        var priorityId = Guid.NewGuid();
        var employeeId = Guid.NewGuid();
        var partId = Guid.NewGuid();
        var warehouseId = Guid.NewGuid();
        var incidentId = Guid.NewGuid();

        db.Assets.Add(new Asset
        {
            Id = assetId,
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "TRK-04",
            Name = "Mining Truck 04",
            Path = "/",
            State = "OPERATIONAL"
        });

        var catalogId = Guid.NewGuid();
        db.Catalogs.Add(new Catalog { Id = catalogId, TenantId = tenantId, Code = "priority" });
        db.CatalogItems.AddRange(
            new CatalogItem { Id = priorityId, TenantId = tenantId, CatalogId = catalogId, Code = "high" },
            new CatalogItem { Id = partId, TenantId = tenantId, CatalogId = catalogId, Code = "FILTER-HYD" });

        db.Employees.Add(new Employee
        {
            Id = employeeId,
            TenantId = tenantId,
            FirstName = "Ana",
            LastName = "Lopez",
            Email = "ana@example.com",
            RoleCatalogItemId = priorityId,
            IsActive = true
        });

        db.Warehouses.Add(new Warehouse
        {
            Id = warehouseId,
            TenantId = tenantId,
            Code = "WH-01",
            Name = "Central Depot",
            IsActive = true
        });

        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = partId,
            QuantityOnHand = 10m,
            AverageUnitCost = 42.5m,
            UpdatedAt = DateTime.UtcNow
        });

        db.Incidents.Add(new Incident
        {
            Id = incidentId,
            TenantId = tenantId,
            AssetId = assetId,
            TypeId = Guid.NewGuid(),
            Title = "Oil pressure warning",
            Description = "Dash alert illuminated on ramp climb",
            State = IncidentStates.Reported,
            PropertiesJson = JsonSerializer.Serialize(new { existing_note = "sensor triggered" }),
            RowVersion = rowVersion ?? new byte[] { 1, 0, 0, 0, 0, 0, 0, 1 }
        });

        db.SaveChanges();
        return (incidentId, assetId, priorityId, employeeId, partId, warehouseId);
    }

    [Fact]
    public async Task Handle_ValidCommand_UpdatesIncidentWritesAuditCreatesOrderTaskAndPlannedParts()
    {
        var tenantId = Guid.NewGuid();
        using var db = CreateDbContext(tenantId);
        var (incidentId, _, priorityId, employeeId, partId, warehouseId) = SeedScenario(db, tenantId);

        var currentUserId = Guid.NewGuid();
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(u => u.Id).Returns(currentUserId);

        var mediator = new Mock<IMediator>();
        mediator
            .Setup(m => m.Send(It.IsAny<CreateWorkTaskCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Guid.NewGuid());

        var handler = new ApplyIncidentTriageCommandHandler(db, mediator.Object, currentUser.Object);

        var command = new ApplyIncidentTriageCommand
        {
            IncidentId = incidentId,
            PriorityId = priorityId,
            AssignedEmployeeId = employeeId,
            TargetState = IncidentStates.Assigned,
            DiagnosisSummary = "Replace clogged hydraulic return filter.",
            CreateOrUpdateWorkOrder = true,
            SuggestedParts = new List<ApplyTriagePartInput>
            {
                new(partId, Quantity: 2, WarehouseId: warehouseId)
            },
            ExpectedRowVersion = new byte[] { 1, 0, 0, 0, 0, 0, 0, 1 }
        };

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.Equal(IncidentStates.Assigned, result.State);
        Assert.Equal(priorityId, result.PriorityId);
        Assert.Equal(employeeId, result.AssignedEmployeeId);
        Assert.NotNull(result.MaintenanceOrderId);
        Assert.Equal(1, result.AddedPartsCount);

        var incident = await db.Incidents.FirstAsync(i => i.Id == incidentId);
        using (var doc = JsonDocument.Parse(incident.PropertiesJson))
        {
            Assert.Equal("sensor triggered", doc.RootElement.GetProperty("existing_note").GetString());
            Assert.Equal(employeeId.ToString(), doc.RootElement.GetProperty("asignar_a").GetString());
        }

        var audit = await db.IncidentLifecycleEvents.SingleAsync(e => e.IncidentId == incidentId);
        Assert.Equal("triaje_ia", audit.EventType);
        Assert.Equal(IncidentStates.Reported, audit.FromState);
        Assert.Equal(IncidentStates.Assigned, audit.ToState);
        Assert.Equal(currentUserId, audit.UserId);

        var order = await db.MaintenanceOrders.SingleAsync(o => o.Id == result.MaintenanceOrderId!.Value);
        Assert.Equal(employeeId, order.AssignedEmployeeId);
        Assert.Contains("Replace clogged hydraulic return filter.", order.Description);

        var part = await db.MaintenanceParts.SingleAsync(p => p.MaintenanceOrderId == order.Id);
        Assert.Equal(partId, part.CatalogItemId);
        Assert.Equal(2, part.Quantity);
        Assert.Equal(42.5m, part.UnitCost);
        Assert.Equal("None", part.SourceType);

        mediator.Verify(m => m.Send(It.Is<CreateWorkTaskCommand>(c =>
            c.MaintenanceOrderId == order.Id &&
            c.AssignedEmployeeId == employeeId), It.IsAny<CancellationToken>()), Times.Once);
        mediator.Verify(m => m.Publish(It.IsAny<MaintenanceOrderCreatedEvent>(), It.IsAny<CancellationToken>()), Times.Once);
        mediator.Verify(m => m.Publish(It.Is<IncidentStateChangedEvent>(e =>
            e.IncidentId == incidentId &&
            e.FromState == IncidentStates.Reported &&
            e.ToState == IncidentStates.Assigned), It.IsAny<CancellationToken>()), Times.Once);

        // Re-applying with same parts skips duplicate parts
        var secondResult = await handler.Handle(new ApplyIncidentTriageCommand
        {
            IncidentId = incidentId,
            PriorityId = priorityId,
            AssignedEmployeeId = employeeId,
            CreateOrUpdateWorkOrder = true,
            SuggestedParts = new List<ApplyTriagePartInput>
            {
                new(partId, Quantity: 2, WarehouseId: warehouseId)
            }
        }, CancellationToken.None);

        Assert.Equal(0, secondResult.AddedPartsCount);
        Assert.Single(await db.MaintenanceParts.Where(p => p.MaintenanceOrderId == order.Id).ToListAsync());
    }

    [Fact]
    public async Task Handle_StaleRowVersion_ThrowsConcurrencyException()
    {
        var tenantId = Guid.NewGuid();
        using var db = CreateDbContext(tenantId);
        var (incidentId, _, priorityId, _, _, _) = SeedScenario(db, tenantId, new byte[] { 1, 0, 0, 0, 0, 0, 0, 9 });

        var handler = new ApplyIncidentTriageCommandHandler(db, new Mock<IMediator>().Object, new Mock<ICurrentUser>().Object);

        await Assert.ThrowsAsync<ConcurrencyException>(() => handler.Handle(new ApplyIncidentTriageCommand
        {
            IncidentId = incidentId,
            PriorityId = priorityId,
            ExpectedRowVersion = new byte[] { 1, 0, 0, 0, 0, 0, 0, 1 }
        }, CancellationToken.None));
    }

    [Fact]
    public async Task Handle_UnreachableTargetState_ThrowsInvalidOperationException()
    {
        var tenantId = Guid.NewGuid();
        using var db = CreateDbContext(tenantId);
        var (incidentId, _, priorityId, _, _, _) = SeedScenario(db, tenantId);

        var handler = new ApplyIncidentTriageCommandHandler(db, new Mock<IMediator>().Object, new Mock<ICurrentUser>().Object);

        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(new ApplyIncidentTriageCommand
        {
            IncidentId = incidentId,
            PriorityId = priorityId,
            TargetState = IncidentStates.Closed
        }, CancellationToken.None));
    }
}
