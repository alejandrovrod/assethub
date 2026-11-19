using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.IncidentTriage;
using AssetHub.Application.IncidentTriage.Queries;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using AssetHub.Domain.AssetTemplates;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.EntityTypes;
using AssetHub.Domain.Incidents;
using AssetHub.Domain.Inventory;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Staff;
using AssetHub.Domain.Tasks;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace AssetHub.Api.Tests.IncidentTriage;

public class AnalyzeIncidentTriageQueryHandlerTests
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

    [Fact]
    public async Task Handle_WhenIncidentNotFound_ThrowsArgumentException()
    {
        using var db = CreateDbContext(Guid.NewGuid());
        var agent = new Mock<IIncidentTriageAgent>();
        var media = new Mock<IIncidentMediaLoader>();
        var handler = new AnalyzeIncidentTriageQueryHandler(db, agent.Object, media.Object);

        await Assert.ThrowsAsync<ArgumentException>(() =>
            handler.Handle(new AnalyzeIncidentTriageQuery(Guid.NewGuid()), CancellationToken.None));
    }

    [Fact]
    public async Task Handle_WhenIncidentIsTerminal_ThrowsInvalidOperationException()
    {
        var tenantId = Guid.NewGuid();
        using var db = CreateDbContext(tenantId);

        var assetId = Guid.NewGuid();
        var incidentId = Guid.NewGuid();

        db.Assets.Add(new Asset
        {
            Id = assetId,
            TenantId = tenantId,
            AssetTemplateId = Guid.NewGuid(),
            Code = "COMP-01",
            Name = "Compressor 01",
            Path = "/",
            State = "OPERATIONAL"
        });
        db.Incidents.Add(new Incident
        {
            Id = incidentId,
            TenantId = tenantId,
            AssetId = assetId,
            TypeId = Guid.NewGuid(),
            Title = "Closed motor noise",
            State = IncidentStates.Closed
        });
        await db.SaveChangesAsync();

        var agent = new Mock<IIncidentTriageAgent>();
        var media = new Mock<IIncidentMediaLoader>();
        var handler = new AnalyzeIncidentTriageQueryHandler(db, agent.Object, media.Object);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new AnalyzeIncidentTriageQuery(incidentId), CancellationToken.None));
    }

    [Fact]
    public async Task Handle_ValidIncident_GathersGroundedContextSanitizesBase64AndReturnsValidatedProposal()
    {
        var tenantId = Guid.NewGuid();
        using var db = CreateDbContext(tenantId);

        var entityTypeId = Guid.NewGuid();
        db.BusinessEntityTypes.Add(new BusinessEntityType { Id = entityTypeId, TenantId = tenantId, Code = "MACH", Name = "Machinery", IsActive = true });

        var assetTemplateId = Guid.NewGuid();
        db.AssetTemplates.Add(new AssetTemplate { Id = assetTemplateId, TenantId = tenantId, BusinessEntityTypeId = entityTypeId, Code = "PUMP", Name = "Slurry Pump" });

        var assetId = Guid.NewGuid();
        db.Assets.Add(new Asset
        {
            Id = assetId,
            TenantId = tenantId,
            AssetTemplateId = assetTemplateId,
            Code = "PMP-10",
            Name = "Slurry Pump 10",
            Path = "/",
            State = "OPERATIONAL",
            ConditionIndex = 62m
        });

        db.AssetHealthPredictions.Add(new AssetHealthPrediction
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = assetId,
            RiskLevel = "High",
            RiskProbability = 0.78m,
            CreatedAt = DateTime.UtcNow
        });

        var priorityCatalogId = Guid.NewGuid();
        var priorityHighId = Guid.NewGuid();
        db.Catalogs.Add(new Catalog { Id = priorityCatalogId, TenantId = tenantId, Code = "priority", Label = "Priorities" });
        db.CatalogItems.Add(new CatalogItem
        {
            Id = priorityHighId,
            TenantId = tenantId,
            CatalogId = priorityCatalogId,
            Code = "high",
            Order = 3,
            Translations = new List<CatalogItemTranslation>
            {
                new() { Id = Guid.NewGuid(), CatalogItemId = priorityHighId, Locale = "es", Label = "Alta" },
                new() { Id = Guid.NewGuid(), CatalogItemId = priorityHighId, Locale = "en", Label = "High" }
            }
        });

        var techCatalogId = Guid.NewGuid();
        var roleId = Guid.NewGuid();
        var skillId = Guid.NewGuid();
        var partId = Guid.NewGuid();
        db.Catalogs.Add(new Catalog { Id = techCatalogId, TenantId = tenantId, Code = "parts", Label = "Parts" });
        db.CatalogItems.AddRange(
            new CatalogItem
            {
                Id = roleId,
                TenantId = tenantId,
                CatalogId = techCatalogId,
                Code = "mec",
                Translations = new List<CatalogItemTranslation> { new() { Id = Guid.NewGuid(), CatalogItemId = roleId, Locale = "es", Label = "Mecánico" } }
            },
            new CatalogItem
            {
                Id = skillId,
                TenantId = tenantId,
                CatalogId = techCatalogId,
                Code = "hyd",
                Translations = new List<CatalogItemTranslation> { new() { Id = Guid.NewGuid(), CatalogItemId = skillId, Locale = "es", Label = "Hidráulica" } }
            },
            new CatalogItem
            {
                Id = partId,
                TenantId = tenantId,
                CatalogId = techCatalogId,
                Code = "BRG-220",
                Translations = new List<CatalogItemTranslation> { new() { Id = Guid.NewGuid(), CatalogItemId = partId, Locale = "es", Label = "Rodamiento SKF 220" } }
            });

        var techId = Guid.NewGuid();
        db.Employees.Add(new Employee
        {
            Id = techId,
            TenantId = tenantId,
            FirstName = "Carlos",
            LastName = "Mendez",
            Email = "carlos@example.com",
            RoleCatalogItemId = roleId,
            SkillsJson = JsonSerializer.Serialize(new[] { skillId }),
            IsActive = true
        });

        var warehouseId = Guid.NewGuid();
        db.Warehouses.Add(new Warehouse { Id = warehouseId, TenantId = tenantId, Code = "MAIN", Name = "Bodega Norte", IsActive = true });
        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouseId,
            CatalogItemId = partId,
            QuantityOnHand = 7m,
            AverageUnitCost = 85m,
            UpdatedAt = DateTime.UtcNow
        });
        db.AssetMaterials.Add(new AssetMaterial
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = assetId,
            CatalogItemId = partId,
            Quantity = 2m,
            UnitOfMeasure = "UN",
            IsCritical = true
        });

        var incidentId = Guid.NewGuid();
        db.Incidents.Add(new Incident
        {
            Id = incidentId,
            TenantId = tenantId,
            AssetId = assetId,
            TypeId = Guid.NewGuid(),
            Title = "Vibración excesiva en bomba",
            Description = "Se escucha golpeteo metálico en rodamiento",
            State = IncidentStates.Reported,
            PropertiesJson = JsonSerializer.Serialize(new
            {
                vibration_mm_s = 14.2,
                photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE="
            }),
            ReportedAt = DateTime.UtcNow
        });

        db.Incidents.Add(new Incident
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = assetId,
            TypeId = Guid.NewGuid(),
            Title = "Fuga previa en sello",
            State = IncidentStates.Resolved,
            ReportedAt = DateTime.UtcNow.AddDays(-20)
        });

        db.WorkTasks.Add(new WorkTask
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Title = "Inspección pendiente",
            State = WorkTaskStates.Todo,
            AssignedEmployeeId = techId,
            TaskTypeCatalogItemId = roleId,
            PriorityCatalogItemId = priorityHighId
        });

        await db.SaveChangesAsync();

        IncidentTriageRequest? capturedRequest = null;
        var mockAgent = new Mock<IIncidentTriageAgent>();
        mockAgent
            .Setup(a => a.AnalyzeAsync(It.IsAny<IncidentTriageRequest>(), It.IsAny<CancellationToken>()))
            .Callback<IncidentTriageRequest, CancellationToken>((req, _) => capturedRequest = req)
            .ReturnsAsync(new IncidentTriageDraft
            {
                Summary = "Desgaste severo de rodamiento principal confirmado por historial.",
                RecommendedSeverity = "High",
                SeverityRationale = "Vibración por encima de umbral seguro.",
                ConfidenceScore = 0.88,
                SuggestedPriorityId = priorityHighId.ToString(),
                SuggestedTechnicianId = techId.ToString(),
                TechnicianRationale = "Especialista en hidráulica disponible.",
                SuggestedTargetState = "assigned",
                RecommendWorkOrder = true,
                ProbableRootCauses = new List<string> { "Fatiga de rodamiento" },
                DiagnosticSteps = new List<string> { "Medir temperatura en chumacera" },
                SafetyPrecautions = new List<string> { "Aplicar bloqueo LOTO antes de intervenir" },
                SuggestedParts = new List<SuggestedPartDraft>
                {
                    new() { CatalogItemId = partId.ToString(), Code = "BRG-220", Quantity = 1, Reason = "Reemplazo preventivo de eje" }
                },
                VisualFindings = "Residuo metálico visible en base."
            });

        var mockMedia = new Mock<IIncidentMediaLoader>();
        mockMedia
            .Setup(m => m.LoadImagesAsync(It.IsAny<IEnumerable<(string, string?, string)>>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<LoadedIncidentImage> { new("photo.png", "image/png", new byte[] { 1, 2, 3 }) });

        var handler = new AnalyzeIncidentTriageQueryHandler(db, mockAgent.Object, mockMedia.Object);

        var response = await handler.Handle(new AnalyzeIncidentTriageQuery(incidentId, "Turno noche"), CancellationToken.None);

        Assert.NotNull(capturedRequest);
        Assert.DoesNotContain("iVBORw0KGgoAAAANSUhEUgAAAAE=", capturedRequest!.Incident.SanitizedPropertiesJson);
        Assert.Contains("[inline media omitted]", capturedRequest.Incident.SanitizedPropertiesJson);
        Assert.Equal("Turno noche", capturedRequest.Incident.AdditionalSupervisorNotes);
        Assert.Single(capturedRequest.Technicians);
        Assert.Equal(1, capturedRequest.Technicians[0].ActiveTasksCount);
        Assert.Contains("Hidráulica", capturedRequest.Technicians[0].Skills);

        Assert.Equal(incidentId, response.IncidentId);
        Assert.Equal(1, response.ImagesAnalyzedCount);
        Assert.Equal(1, response.RecentAssetIncidentsCount);
        Assert.Equal(priorityHighId, response.SuggestedPriorityId);
        Assert.Equal(techId, response.SuggestedTechnicianId);
        Assert.Equal("assigned", response.SuggestedTargetState);
        Assert.Single(response.SuggestedParts);
        Assert.Equal(7m, response.SuggestedParts[0].AvailableStock);
        Assert.Equal(warehouseId, response.SuggestedParts[0].PrimaryWarehouseId);
    }
}
