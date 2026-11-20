using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Api.Tests.MaintenanceOrders;
using AssetHub.Application.PredictivePlanner;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Analytics;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Inventory;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Staff;
using AssetHub.Domain.Tasks;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.PredictivePlanner;

public class PredictivePlannerEngineTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static TenantDbContext CreateDb(Guid tenantId)
    {
        var resolver = new MaintenanceOrderTestHelper.FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TenantDbContext(options, resolver);
    }

    private static Asset CreateAsset(Guid tenantId, Guid templateId, string propertiesJson, DateTime? commissionedAt = null)
    {
        return new Asset
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetTemplateId = templateId,
            Code = "TRK-01",
            Name = "Truck 01",
            State = "operational",
            PropertiesJson = propertiesJson,
            CommissionedAt = commissionedAt,
            CreatedAt = Now.AddDays(-200)
        };
    }

    private static Warehouse CreateWarehouse(Guid tenantId, bool isActive = true, bool isDeleted = false)
    {
        return new Warehouse
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Code = $"WH-{Guid.NewGuid().ToString("N")[..4]}",
            Name = "Main Warehouse",
            IsActive = isActive,
            IsDeleted = isDeleted,
            CreatedAt = Now.AddDays(-100),
            UpdatedAt = Now.AddDays(-1)
        };
    }

    private static PreventivePlan CreatePlan(
        Guid tenantId,
        Guid? assetId,
        Guid? templateId,
        string cron,
        DateTime nextRunAt)
    {
        return new PreventivePlan
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = "Weekly inspection",
            CronExpression = cron,
            NextRunAt = nextRunAt,
            DueDateOffsetDays = 7,
            IsActive = true,
            IsDeleted = false,
            AssetId = assetId,
            AssetTemplateId = templateId
        };
    }

    [Fact]
    public async Task BuildSnapshot_ExpandsCronAndProjectsMeterBurnRate()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        // 4,800 hrs after 100 operating days => 48 hrs/day. Interval 250 => next target 5,000 hrs.
        var asset = CreateAsset(
            tenantId,
            templateId,
            "{\"horometro\":4800,\"intervalo_horometro\":250}",
            commissionedAt: Now.AddDays(-100));

        db.Assets.Add(asset);
        db.PreventivePlans.Add(CreatePlan(
            tenantId,
            assetId: null,
            templateId: templateId,
            cron: "0 6 * * 1",
            nextRunAt: Now.AddDays(3).AddHours(6)));

        await db.SaveChangesAsync();

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 30),
            Now,
            CancellationToken.None);

        Assert.Contains(snapshot.ProjectedServices, s => s.Source == ServiceSource.PreventivePlan);
        Assert.True(snapshot.ProjectedServices.Count(s => s.Source == ServiceSource.PreventivePlan) >= 4);

        var meterServices = snapshot.ProjectedServices
            .Where(s => s.Source == ServiceSource.MeterBurnRate)
            .OrderBy(s => s.DaysUntilDue)
            .ToList();
        Assert.Equal(5, meterServices.Count);

        var meterService = meterServices[0];
        Assert.Equal("horometro", meterService.MeterKey);
        Assert.Equal(5, meterService.DaysUntilDue);
        Assert.Equal(5000m, meterService.TargetMeterValue);
        Assert.Equal("Medium", meterService.BurnRateConfidence);
        Assert.Equal(48m, meterService.BurnRatePerDay!.Value, 2);
        Assert.Equal(new[] { 5000m, 5250m, 5500m, 5750m, 6000m }, meterServices.Select(m => m.TargetMeterValue!.Value));

        var meterDiagnostic = Assert.Single(snapshot.MeterProjections);
        Assert.Equal("Medium", meterDiagnostic.Confidence);
    }

    [Fact]
    public async Task BuildSnapshot_CrossesInventoryChronologicallyAndFindsStockoutDay()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var asset = CreateAsset(tenantId, templateId, "{}");
        db.Assets.Add(asset);

        db.CatalogItems.Add(new CatalogItem
        {
            Id = itemId,
            TenantId = tenantId,
            CatalogId = Guid.NewGuid(),
            Code = "FLT-TRX-01"
        });

        db.AssetMaterials.Add(new AssetMaterial
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            CatalogItemId = itemId,
            Quantity = 2m,
            UnitOfMeasure = "pcs",
            IsCritical = true,
            CreatedAt = Now,
            UpdatedAt = Now
        });

        var warehouse = CreateWarehouse(tenantId);
        db.Warehouses.Add(warehouse);

        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouse.Id,
            CatalogItemId = itemId,
            QuantityOnHand = 3m,
            AverageUnitCost = 10m,
            UpdatedAt = Now
        });

        db.PreventivePlans.Add(CreatePlan(
            tenantId,
            assetId: asset.Id,
            templateId: null,
            cron: "0 6 * * *",
            nextRunAt: Now.AddDays(1).AddHours(6)));

        await db.SaveChangesAsync();

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 30),
            Now,
            CancellationToken.None);

        var stockout = Assert.Single(snapshot.StockoutForecasts);
        Assert.Equal(itemId, stockout.CatalogItemId);
        Assert.Equal(2, stockout.DaysUntilStockout);
        Assert.Equal(Now.Date.AddDays(2), stockout.StockoutDate);
        Assert.Equal(3m, stockout.AvailableQuantity);
        Assert.Equal(60m, stockout.RequiredQuantity);
        Assert.Equal(57m, stockout.ShortfallQuantity);
        Assert.Equal(570m, stockout.EstimatedRestockCost);
        Assert.Contains(asset.Id, stockout.AffectedAssetIds);
    }

    [Fact]
    public async Task BuildSnapshot_DetectsWorkshopOverloadAgainstAvailableTechnicians()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var asset = CreateAsset(tenantId, templateId, "{}");
        db.Assets.Add(asset);

        db.PreventivePlans.Add(CreatePlan(
            tenantId,
            assetId: asset.Id,
            templateId: null,
            cron: "0 6 * * *",
            nextRunAt: Now.Date.AddDays(1).AddHours(6)));

        var employee = new Employee
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FirstName = "Ana",
            LastName = "Mecánica",
            Email = "ana@example.com",
            IsActive = true,
            IsDeleted = false
        };
        db.Employees.Add(employee);

        for (var day = 1; day <= 5; day++)
        {
            db.EmployeeAvailabilities.Add(new EmployeeAvailability
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                EmployeeId = employee.Id,
                DayOfWeek = day,
                StartTime = TimeSpan.FromHours(8),
                EndTime = TimeSpan.FromHours(12),
                IsAvailable = true
            });
        }

        await db.SaveChangesAsync();

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 30),
            Now,
            CancellationToken.None);

        Assert.NotEmpty(snapshot.WeeklyWorkshopLoad);
        Assert.Contains(snapshot.WeeklyWorkshopLoad, w => w.IsOverloaded);
        Assert.All(snapshot.WeeklyWorkshopLoad, w => Assert.True(w.AvailableHours > 0m));
        Assert.Contains(snapshot.WeeklyWorkshopLoad, w => w.SaturationPercent > 100m);
    }

    [Fact]
    public async Task BuildSnapshot_ExcludesOpenOrderPartsFromAvailableStock()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var asset = CreateAsset(tenantId, templateId, "{}");
        db.Assets.Add(asset);

        db.CatalogItems.Add(new CatalogItem
        {
            Id = itemId,
            TenantId = tenantId,
            CatalogId = Guid.NewGuid(),
            Code = "FLT-OIL-01"
        });

        db.AssetMaterials.Add(new AssetMaterial
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            CatalogItemId = itemId,
            Quantity = 1m,
            UnitOfMeasure = "pcs",
            CreatedAt = Now,
            UpdatedAt = Now
        });

        var warehouse = CreateWarehouse(tenantId);
        db.Warehouses.Add(warehouse);

        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouse.Id,
            CatalogItemId = itemId,
            QuantityOnHand = 10m,
            AverageUnitCost = 25m,
            UpdatedAt = Now
        });

        db.MaintenanceOrders.Add(new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            Kind = MaintenanceOrderKinds.Corrective,
            State = MaintenanceOrderStates.InProgress,
            Title = "Open work",
            CreatedAt = Now.AddDays(-1),
            Parts = new List<MaintenancePart>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CatalogItemId = itemId,
                    Quantity = 9,
                    UnitCost = 25m,
                    SourceType = "internal"
                }
            }
        });

        db.PreventivePlans.Add(CreatePlan(
            tenantId,
            assetId: asset.Id,
            templateId: null,
            cron: "0 6 * * *",
            nextRunAt: Now.Date.AddDays(1).AddHours(6)));

        await db.SaveChangesAsync();

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 30),
            Now,
            CancellationToken.None);

        var stockout = Assert.Single(snapshot.StockoutForecasts);
        Assert.Equal(1m, stockout.AvailableQuantity);
        Assert.Equal(2, stockout.DaysUntilStockout);
    }

    [Fact]
    public async Task BuildSnapshot_WithNoData_ReturnsEmptyForecastWithoutThrowing()
    {
        var tenantId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 90),
            Now,
            CancellationToken.None);

        Assert.Empty(snapshot.ProjectedServices);
        Assert.Empty(snapshot.StockoutForecasts);
        Assert.Empty(snapshot.WeeklyWorkshopLoad);
        Assert.Equal(90, snapshot.HorizonDays);
        Assert.Equal(0m, snapshot.BudgetProjection.EstimatedTotalCost);
    }

    [Fact]
    public async Task BuildSnapshot_DoesNotDoubleCountPartsInBudgetProjection()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var asset = CreateAsset(tenantId, templateId, "{}");
        db.Assets.Add(asset);

        db.CatalogItems.Add(new CatalogItem
        {
            Id = itemId,
            TenantId = tenantId,
            CatalogId = Guid.NewGuid(),
            Code = "BRK-01"
        });

        db.AssetMaterials.Add(new AssetMaterial
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            CatalogItemId = itemId,
            Quantity = 1m,
            UnitOfMeasure = "pcs",
            CreatedAt = Now,
            UpdatedAt = Now
        });

        var warehouse = CreateWarehouse(tenantId);
        db.Warehouses.Add(warehouse);

        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouse.Id,
            CatalogItemId = itemId,
            QuantityOnHand = 0m,
            AverageUnitCost = 50m,
            UpdatedAt = Now
        });

        db.MaintenanceOrders.Add(new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            Kind = MaintenanceOrderKinds.Preventive,
            State = MaintenanceOrderStates.Done,
            Title = "Prior service",
            LaborCost = 100m,
            CreatedAt = Now.AddDays(-10),
            Parts = new List<MaintenancePart>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CatalogItemId = itemId,
                    Quantity = 2,
                    UnitCost = 50m,
                    SourceType = "internal"
                }
            }
        });

        db.AssetHealthPredictions.Add(new AssetHealthPrediction
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            RiskLevel = "Critical",
            RiskProbability = 0.9m,
            PredictedFailureDays = 5,
            CreatedAt = Now
        });

        await db.SaveChangesAsync();

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 30),
            Now,
            CancellationToken.None);

        Assert.Equal(200m, snapshot.BudgetProjection.AverageCostPerService);
        Assert.Equal(0m, snapshot.BudgetProjection.CoveredPartsCost);
        Assert.Equal(50m, snapshot.BudgetProjection.UrgentPurchaseCost);
        Assert.Equal(100m, snapshot.BudgetProjection.EstimatedLaborCost);
        Assert.Equal(150m, snapshot.BudgetProjection.EstimatedTotalCost);
    }

    [Fact]
    public async Task BuildSnapshot_DoesNotDoubleDeductPostedOrExternalOpenOrderParts()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var asset = CreateAsset(tenantId, templateId, "{}");
        db.Assets.Add(asset);

        db.CatalogItems.Add(new CatalogItem
        {
            Id = itemId,
            TenantId = tenantId,
            CatalogId = Guid.NewGuid(),
            Code = "SEAL-01"
        });

        db.AssetMaterials.Add(new AssetMaterial
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            CatalogItemId = itemId,
            Quantity = 4m,
            UnitOfMeasure = "pcs",
            CreatedAt = Now,
            UpdatedAt = Now
        });

        var warehouse = CreateWarehouse(tenantId);
        db.Warehouses.Add(warehouse);

        db.StockBalances.Add(new StockBalance
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            WarehouseId = warehouse.Id,
            CatalogItemId = itemId,
            QuantityOnHand = 5m,
            AverageUnitCost = 10m,
            UpdatedAt = Now
        });

        db.MaintenanceOrders.Add(new MaintenanceOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            Kind = MaintenanceOrderKinds.Corrective,
            State = MaintenanceOrderStates.InProgress,
            Title = "Mixed parts order",
            CreatedAt = Now.AddDays(-1),
            Parts = new List<MaintenancePart>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CatalogItemId = itemId,
                    Quantity = 3,
                    UnitCost = 10m,
                    SourceType = "internal",
                    InventoryTransactionId = Guid.NewGuid()
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CatalogItemId = itemId,
                    Quantity = 4,
                    UnitCost = 10m,
                    SourceType = "external",
                    InventoryTransactionId = null
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CatalogItemId = itemId,
                    Quantity = 2,
                    UnitCost = 10m,
                    SourceType = "internal",
                    InventoryTransactionId = null
                }
            }
        });

        db.AssetHealthPredictions.Add(new AssetHealthPrediction
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            RiskLevel = "Critical",
            RiskProbability = 0.9m,
            PredictedFailureDays = 5,
            CreatedAt = Now
        });

        await db.SaveChangesAsync();

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 30),
            Now,
            CancellationToken.None);

        var stockout = Assert.Single(snapshot.StockoutForecasts);
        Assert.Equal(3m, stockout.AvailableQuantity);
        Assert.Equal(4m, stockout.RequiredQuantity);
        Assert.Equal(1m, stockout.ShortfallQuantity);
    }

    [Fact]
    public async Task BuildSnapshot_ExcludesInactiveAndDeletedWarehouseStock()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var asset = CreateAsset(tenantId, templateId, "{}");
        db.Assets.Add(asset);

        db.CatalogItems.Add(new CatalogItem
        {
            Id = itemId,
            TenantId = tenantId,
            CatalogId = Guid.NewGuid(),
            Code = "BELT-01"
        });

        db.AssetMaterials.Add(new AssetMaterial
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            CatalogItemId = itemId,
            Quantity = 5m,
            UnitOfMeasure = "pcs",
            CreatedAt = Now,
            UpdatedAt = Now
        });

        var activeWarehouse = CreateWarehouse(tenantId, isActive: true, isDeleted: false);
        var inactiveWarehouse = CreateWarehouse(tenantId, isActive: false, isDeleted: false);
        var deletedWarehouse = CreateWarehouse(tenantId, isActive: true, isDeleted: true);
        db.Warehouses.AddRange(activeWarehouse, inactiveWarehouse, deletedWarehouse);

        db.StockBalances.AddRange(
            new StockBalance
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                WarehouseId = activeWarehouse.Id,
                CatalogItemId = itemId,
                QuantityOnHand = 2m,
                AverageUnitCost = 10m,
                UpdatedAt = Now
            },
            new StockBalance
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                WarehouseId = inactiveWarehouse.Id,
                CatalogItemId = itemId,
                QuantityOnHand = 10m,
                AverageUnitCost = 10m,
                UpdatedAt = Now
            },
            new StockBalance
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                WarehouseId = deletedWarehouse.Id,
                CatalogItemId = itemId,
                QuantityOnHand = 20m,
                AverageUnitCost = 10m,
                UpdatedAt = Now
            });

        db.AssetHealthPredictions.Add(new AssetHealthPrediction
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            RiskLevel = "Critical",
            RiskProbability = 0.95m,
            PredictedFailureDays = 4,
            CreatedAt = Now
        });

        await db.SaveChangesAsync();

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 30),
            Now,
            CancellationToken.None);

        var stockout = Assert.Single(snapshot.StockoutForecasts);
        Assert.Equal(2m, stockout.AvailableQuantity);
        Assert.Equal(3m, stockout.ShortfallQuantity);
    }

    [Fact]
    public async Task BuildSnapshot_ExcludesInactiveEmployeesFromWorkshopCapacity()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var asset = CreateAsset(tenantId, templateId, "{}");
        db.Assets.Add(asset);

        db.AssetHealthPredictions.Add(new AssetHealthPrediction
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            RiskLevel = "Critical",
            RiskProbability = 0.95m,
            PredictedFailureDays = 4,
            CreatedAt = Now
        });

        db.Employees.AddRange(
            new Employee
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                FirstName = "Active",
                LastName = "Tech",
                Email = "active@example.com",
                IsActive = true,
                IsDeleted = false
            },
            new Employee
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                FirstName = "Inactive",
                LastName = "Tech",
                Email = "inactive@example.com",
                IsActive = false,
                IsDeleted = false
            },
            new Employee
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                FirstName = "Deleted",
                LastName = "Tech",
                Email = "deleted@example.com",
                IsActive = true,
                IsDeleted = true
            });

        await db.SaveChangesAsync();

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 30),
            Now,
            CancellationToken.None);

        var week = Assert.Single(snapshot.WeeklyWorkshopLoad);
        Assert.Equal(40m, week.AvailableHours);
    }

    [Fact]
    public async Task BuildSnapshot_IgnoresNonPositiveMeterIntervalAndParsesThousandsSeparators()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var asset = CreateAsset(
            tenantId,
            templateId,
            "{\"horometro\":\"4,800\",\"intervalo_horometro\":250}",
            commissionedAt: Now.AddDays(-100));
        db.Assets.Add(asset);

        await db.SaveChangesAsync();

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 30, MeterIntervalOverride: 0m),
            Now,
            CancellationToken.None);

        var projection = Assert.Single(snapshot.MeterProjections);
        Assert.Equal(4800m, projection.CurrentValue);
        Assert.Equal(250m, projection.Interval);
        Assert.Equal(5000m, projection.TargetValue);
        Assert.Equal(Now.Date.AddDays(5), projection.ProjectedServiceDate);
    }

    [Fact]
    public async Task BuildSnapshot_FiltersCronServicesByConditionRuleAndDetectsTemplatePlanInterval()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var asset = CreateAsset(
            tenantId,
            templateId,
            "{\"horometro\":4800}",
            commissionedAt: Now.AddDays(-100));
        asset.State = "operational";
        db.Assets.Add(asset);

        var cronPlanWithStateRule = CreatePlan(
            tenantId,
            assetId: null,
            templateId: templateId,
            cron: "0 6 * * *",
            nextRunAt: Now.AddDays(1).AddHours(6));
        cronPlanWithStateRule.ConditionRuleJson = "{\"allowedStates\":[\"maintenance\"]}";

        var intervalTemplatePlan = CreatePlan(
            tenantId,
            assetId: null,
            templateId: templateId,
            cron: string.Empty,
            nextRunAt: Now.AddDays(1));
        intervalTemplatePlan.ConditionRuleJson = "{\"intervalHours\":250}";

        db.PreventivePlans.AddRange(cronPlanWithStateRule, intervalTemplatePlan);
        await db.SaveChangesAsync();

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 30),
            Now,
            CancellationToken.None);

        Assert.DoesNotContain(snapshot.ProjectedServices, s => s.Source == ServiceSource.PreventivePlan);
        var meterDiagnostic = Assert.Single(snapshot.MeterProjections);
        Assert.Equal(250m, meterDiagnostic.Interval);
        Assert.Equal(5000m, meterDiagnostic.TargetValue);
    }

    [Fact]
    public async Task BuildSnapshot_HandlesNegativeStockUnitCostAndDayZeroStockout()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var asset = CreateAsset(tenantId, templateId, "{}");
        db.Assets.Add(asset);

        db.CatalogItems.Add(new CatalogItem
        {
            Id = itemId,
            TenantId = tenantId,
            CatalogId = Guid.NewGuid(),
            Code = "PUMP-01"
        });

        db.AssetMaterials.Add(new AssetMaterial
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            CatalogItemId = itemId,
            Quantity = 3m,
            UnitOfMeasure = "pcs",
            CreatedAt = Now,
            UpdatedAt = Now
        });

        var warehouseA = CreateWarehouse(tenantId);
        var warehouseB = CreateWarehouse(tenantId);
        db.Warehouses.AddRange(warehouseA, warehouseB);

        db.StockBalances.AddRange(
            new StockBalance
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                WarehouseId = warehouseA.Id,
                CatalogItemId = itemId,
                QuantityOnHand = 10m,
                AverageUnitCost = 50m,
                UpdatedAt = Now
            },
            new StockBalance
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                WarehouseId = warehouseB.Id,
                CatalogItemId = itemId,
                QuantityOnHand = -12m,
                AverageUnitCost = 100m,
                UpdatedAt = Now
            });

        db.AssetHealthPredictions.Add(new AssetHealthPrediction
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            RiskLevel = "Critical",
            RiskProbability = 0.9m,
            PredictedFailureDays = 10,
            CreatedAt = Now
        });

        await db.SaveChangesAsync();

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 30),
            Now,
            CancellationToken.None);

        var stockout = Assert.Single(snapshot.StockoutForecasts);
        Assert.Equal(-2m, stockout.AvailableQuantity);
        Assert.Equal(5m, stockout.ShortfallQuantity);
        Assert.Equal(0, stockout.DaysUntilStockout);
        Assert.Equal(Now.Date, stockout.StockoutDate);
        Assert.Equal(250m, stockout.EstimatedRestockCost);
    }

    [Fact]
    public async Task BuildSnapshot_AnchorsHealthRiskRulToPredictionCreatedAt()
    {
        var tenantId = Guid.NewGuid();
        var templateId = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var asset = CreateAsset(tenantId, templateId, "{}");
        db.Assets.Add(asset);

        db.AssetHealthPredictions.Add(new AssetHealthPrediction
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssetId = asset.Id,
            RiskLevel = "Critical",
            RiskProbability = 0.92m,
            PredictedFailureDays = 20,
            CreatedAt = Now.AddDays(-15)
        });

        await db.SaveChangesAsync();

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 30),
            Now,
            CancellationToken.None);

        var riskService = Assert.Single(snapshot.ProjectedServices);
        Assert.Equal(ServiceSource.HealthRisk, riskService.Source);
        Assert.Equal(5, riskService.DaysUntilDue);
        Assert.Equal(Now.Date.AddDays(5), riskService.DueDate);
    }

    [Fact]
    public async Task BuildSnapshot_FiltersCostEntriesByTemplateAndSingleCurrency()
    {
        var tenantId = Guid.NewGuid();
        var templateA = Guid.NewGuid();
        var templateB = Guid.NewGuid();
        await using var db = CreateDb(tenantId);

        var assetA = CreateAsset(tenantId, templateA, "{}");
        assetA.Code = "TRK-A";
        var assetB = CreateAsset(tenantId, templateB, "{}");
        assetB.Code = "TRK-B";
        db.Assets.AddRange(assetA, assetB);

        db.CostEntries.AddRange(
            new CostEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                AssetId = assetA.Id,
                Amount = 90m,
                Currency = "USD",
                OccurredAt = Now.AddDays(-10),
                CreatedAt = Now.AddDays(-10)
            },
            new CostEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                AssetId = assetB.Id,
                Amount = 900m,
                Currency = "MXN",
                OccurredAt = Now.AddDays(-5),
                CreatedAt = Now.AddDays(-5)
            },
            new CostEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                AssetId = assetA.Id,
                Amount = 500m,
                Currency = "EUR",
                OccurredAt = Now.AddDays(-20),
                CreatedAt = Now.AddDays(-20)
            });

        await db.SaveChangesAsync();

        var engine = new PredictivePlannerEngine(db);
        var snapshot = await engine.BuildSnapshotAsync(
            new PredictiveForecastRequest(HorizonDays: 30, AssetTemplateId: templateA),
            Now,
            CancellationToken.None);

        Assert.Equal("USD", snapshot.Currency);
        Assert.Equal("USD", snapshot.BudgetProjection.Currency);
        Assert.Equal(1m, snapshot.BudgetProjection.HistoricalDailyCost);
        Assert.Equal(30m, snapshot.BudgetProjection.HistoricalRunRateCost);
    }
}
