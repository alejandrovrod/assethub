using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Common.Time;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Analytics;
using AssetHub.Domain.Assets;
using AssetHub.Domain.Catalogs;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Staff;
using AssetHub.Domain.Tasks;
using Cronos;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.PredictivePlanner;

/// <summary>
/// Deterministic predictive planner. Every number returned by this engine is computed in
/// C# from existing tenant entities; the LLM never performs arithmetic.
///
/// Zero migrations: only reads Assets, PreventivePlans, AssetHealthPredictions,
/// AssetMaterials, MaintenanceOrders/Parts, StockBalances, Employees/Availabilities,
/// WorkTasks and CostEntries.
/// </summary>
public sealed class PredictivePlannerEngine : IPredictivePlannerEngine
{
    private const decimal DefaultServiceHours = 4m;
    private const decimal DefaultBacklogHoursPerTask = 2m;
    private const decimal DefaultWeeklyHoursPerTechnician = 40m;
    private const int MaxCronOccurrencesPerPlan = 120;
    private const int MaxMeterOccurrencesPerAsset = 120;
    private const int MaxBurnRatePoints = 200;
    private const decimal MaxProjectedBurnDays = 36500m;
    private static readonly TimeSpan RegexTimeout = TimeSpan.FromMilliseconds(200);
    private static readonly Regex ThousandsCommaRegex = new(@"^-?\d{1,3}(,\d{3})+$", RegexOptions.CultureInvariant, RegexTimeout);
    private static readonly Regex MultiDotThousandsRegex = new(@"^-?\d{1,3}(\.\d{3}){2,}$", RegexOptions.CultureInvariant, RegexTimeout);

    private static readonly string[] MeterKeys =
    {
        "horometro", "horómetro", "horas_uso", "horas", "hours", "hour_meter", "hourmeter",
        "kilometraje", "kilómetros", "kilometros", "km", "odometro", "odómetro", "odometer",
        "mileage", "usage_hours", "operating_hours", "operatinghours"
    };

    private static readonly string[] IntervalKeys =
    {
        "intervalo_horometro", "intervalo_horómetro", "intervalo_horas", "horas_intervalo",
        "interval_hours", "intervalhours", "maintenance_interval_hours", "maintenance_interval",
        "service_interval", "intervalo_km", "interval_km", "intervalo_mantenimiento"
    };

    private static readonly string[] TargetKeys =
    {
        "proximo_servicio", "proximo_servicio_horas", "próximo_servicio", "next_service_hours",
        "horometro_objetivo", "horómetro_objetivo", "target_hours", "service_target", "target"
    };

    private readonly ITenantDbContext _db;

    public PredictivePlannerEngine(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task<PredictiveForecastSnapshot> BuildSnapshotAsync(
        PredictiveForecastRequest request,
        DateTime utcNow,
        CancellationToken cancellationToken = default)
    {
        var now = EnsureUtc(utcNow);
        var horizonDays = NormalizeHorizon(request.HorizonDays);
        var horizonStart = now.Date;
        var horizonEnd = horizonStart.AddDays(horizonDays);

        // ---------------------------------------------------------------- assets
        var assetsQuery = _db.Assets.AsNoTracking().Where(a => !a.IsDeleted);
        if (request.AssetTemplateId.HasValue)
            assetsQuery = assetsQuery.Where(a => a.AssetTemplateId == request.AssetTemplateId.Value);

        var assets = await assetsQuery.ToListAsync(cancellationToken);
        var assetsById = assets.ToDictionary(a => a.Id);
        var assetIdSet = assetsById.Keys.ToHashSet();
        var templateIdSet = assets.Select(a => a.AssetTemplateId).ToHashSet();

        // ---------------------------------------------------------------- plans
        var plans = assetIdSet.Count == 0
            ? new List<PreventivePlan>()
            : await _db.PreventivePlans.AsNoTracking()
                .Where(p => p.IsActive && !p.IsDeleted)
                .Where(p =>
                    (p.AssetId != null && assetIdSet.Contains(p.AssetId.Value)) ||
                    (p.AssetTemplateId != null && templateIdSet.Contains(p.AssetTemplateId.Value)))
                .ToListAsync(cancellationToken);

        // ---------------------------------------------------------------- inventory BOM + parts history
        var bom = await _db.AssetMaterials.AsNoTracking()
            .Include(m => m.CatalogItem)
                .ThenInclude(ci => ci!.Translations)
            .Where(m => assetIdSet.Contains(m.AssetId) && !m.IsDeleted)
            .ToListAsync(cancellationToken);

        var completedOrders = await _db.MaintenanceOrders.AsNoTracking()
            .Include(o => o.Parts)
            .Where(o => (o.State == MaintenanceOrderStates.Done || o.State == MaintenanceOrderStates.Verified)
                        && o.CreatedAt >= now.AddDays(-365)
                        && assetIdSet.Contains(o.AssetId))
            .ToListAsync(cancellationToken);

        var openOrders = await _db.MaintenanceOrders.AsNoTracking()
            .Include(o => o.Parts)
            .Where(o => MaintenanceOrderStates.ActiveStates.Contains(o.State))
            .ToListAsync(cancellationToken);

        IQueryable<AssetHub.Domain.Inventory.StockBalance> stockQuery = _db.StockBalances.AsNoTracking()
            .Include(s => s.Warehouse)
            .Include(s => s.CatalogItem)
                .ThenInclude(ci => ci!.Translations);

        if (request.WarehouseId.HasValue)
            stockQuery = stockQuery.Where(s => s.WarehouseId == request.WarehouseId.Value);

        var stockBalancesRaw = await stockQuery.ToListAsync(cancellationToken);
        var stockBalances = stockBalancesRaw
            .Where(s => s.Warehouse is not null && !s.Warehouse.IsDeleted && s.Warehouse.IsActive)
            .ToList();

        // ---------------------------------------------------------------- health + staff + backlog + costs
        var healthPredictions = await _db.AssetHealthPredictions.AsNoTracking()
            .Where(h => assetIdSet.Contains(h.AssetId))
            .ToListAsync(cancellationToken);

        var lifecycleEvents = await _db.AssetLifecycleEvents.AsNoTracking()
            .Where(e => assetIdSet.Contains(e.AssetId))
            .ToListAsync(cancellationToken);

        var lifecycleByAsset = lifecycleEvents
            .GroupBy(e => e.AssetId)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<AssetLifecycleEvent>)g.OrderBy(e => e.At).ToList());

        var latestHealthByAsset = healthPredictions
            .GroupBy(h => h.AssetId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(h => h.CreatedAt).First());

        var employees = await _db.Employees.AsNoTracking()
            .Where(e => e.IsActive && !e.IsDeleted)
            .ToListAsync(cancellationToken);
        var employeeIds = employees.Select(e => e.Id).ToList();

        var availabilities = employeeIds.Count == 0
            ? new List<EmployeeAvailability>()
            : await _db.EmployeeAvailabilities.AsNoTracking()
                .Where(a => employeeIds.Contains(a.EmployeeId))
                .ToListAsync(cancellationToken);

        var backlogTasks = await _db.WorkTasks.AsNoTracking()
            .Where(t => !t.IsDeleted
                        && t.AssetId != null
                        && assetIdSet.Contains(t.AssetId.Value)
                        && !WorkTaskStates.TerminalStates.Contains(t.State))
            .ToListAsync(cancellationToken);

        IQueryable<CostEntry> costQuery = _db.CostEntries.AsNoTracking()
            .Where(c => !c.IsDeleted && c.OccurredAt >= now.AddDays(-180));

        if (request.AssetTemplateId.HasValue)
        {
            costQuery = costQuery.Where(c => c.AssetId != null && assetIdSet.Contains(c.AssetId.Value));
        }

        var costEntries = await costQuery.ToListAsync(cancellationToken);

        var currencyWindowStart = now.AddDays(-90);
        var currency = costEntries
            .Where(c => c.OccurredAt >= currencyWindowStart && !string.IsNullOrWhiteSpace(c.Currency))
            .OrderByDescending(c => c.OccurredAt)
            .Select(c => c.Currency.Trim().ToUpperInvariant())
            .FirstOrDefault()
            ?? costEntries
                .Where(c => !string.IsNullOrWhiteSpace(c.Currency))
                .OrderByDescending(c => c.OccurredAt)
                .Select(c => c.Currency.Trim().ToUpperInvariant())
                .FirstOrDefault()
            ?? "MXN";

        // ---------------------------------------------------------------- catalog labels + costs
        var labelById = new Dictionary<Guid, string>();
        var codeById = new Dictionary<Guid, string>();
        foreach (var material in bom)
        {
            if (material.CatalogItem is not null)
            {
                labelById[material.CatalogItemId] = ResolveLabel(material.CatalogItem);
                codeById[material.CatalogItemId] = material.CatalogItem.Code;
            }
        }
        foreach (var balance in stockBalances)
        {
            if (balance.CatalogItem is not null)
            {
                labelById[balance.CatalogItemId] = ResolveLabel(balance.CatalogItem);
                codeById[balance.CatalogItemId] = balance.CatalogItem.Code;
            }
        }

        var historicalUnitCost = BuildHistoricalUnitCost(completedOrders);

        var bomByAsset = bom
            .GroupBy(m => m.AssetId)
            .ToDictionary(
                g => g.Key,
                g => g.GroupBy(m => m.CatalogItemId)
                    .Select(x => (CatalogItemId: x.Key, Quantity: x.Sum(y => y.Quantity)))
                    .ToList());

        var historicalUsageByAsset = BuildHistoricalUsage(completedOrders);

        // ---------------------------------------------------------------- projected services
        var services = new List<ProjectedService>();
        var meterProjections = new List<MeterProjection>();

        AddCronServices(plans, assetsById, now, horizonEnd, services);

        foreach (var asset in assets)
        {
            AddMeterService(
                asset,
                plans,
                request,
                now,
                horizonEnd,
                completedOrders,
                lifecycleByAsset,
                services,
                meterProjections);
        }

        AddHealthRiskServices(latestHealthByAsset, assetsById, now, horizonDays, services);

        var orderedServices = services
            .OrderBy(s => s.DueDate)
            .ThenBy(s => s.AssetCode, StringComparer.OrdinalIgnoreCase)
            .ToList();

        // ---------------------------------------------------------------- stockout crossing
        var demandEvents = BuildDemandEvents(orderedServices, bomByAsset, historicalUsageByAsset);

        var onHandByItem = stockBalances
            .GroupBy(s => s.CatalogItemId)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.QuantityOnHand));

        // Count only unposted internal parts; posted internal parts already decremented StockBalance,
        // and external parts do not consume warehouse stock.
        var committedByItem = openOrders
            .SelectMany(o => o.Parts)
            .Where(p => p.InventoryTransactionId == null
                        && string.Equals(p.SourceType, "internal", StringComparison.OrdinalIgnoreCase)
                        && (!request.WarehouseId.HasValue || p.WarehouseId == null || p.WarehouseId == request.WarehouseId.Value))
            .GroupBy(p => p.CatalogItemId)
            .ToDictionary(g => g.Key, g => g.Sum(x => (decimal)x.Quantity));

        var unitCostByItem = new Dictionary<Guid, decimal>();
        foreach (var itemId in demandEvents.Select(e => e.CatalogItemId).Distinct())
        {
            var balances = stockBalances.Where(s => s.CatalogItemId == itemId).ToList();
            var positiveBalances = balances
                .Where(b => b.QuantityOnHand > 0m && b.AverageUnitCost > 0m)
                .ToList();
            var positiveOnHand = positiveBalances.Sum(b => b.QuantityOnHand);
            var weighted = positiveOnHand > 0m
                ? positiveBalances.Sum(b => b.QuantityOnHand * b.AverageUnitCost) / positiveOnHand
                : balances
                    .Where(b => b.AverageUnitCost > 0m)
                    .Select(b => b.AverageUnitCost)
                    .FirstOrDefault();

            if (weighted <= 0m && historicalUnitCost.TryGetValue(itemId, out var histCost))
                weighted = histCost;

            unitCostByItem[itemId] = weighted;
        }

        var stockouts = BuildStockoutForecasts(
            demandEvents,
            onHandByItem,
            committedByItem,
            unitCostByItem,
            now,
            horizonDays,
            currency);

        // Ensure labels exist for items that only appeared in historical parts.
        var missingLabelIds = stockouts
            .Where(s => !labelById.ContainsKey(s.CatalogItemId) || !codeById.ContainsKey(s.CatalogItemId))
            .Select(s => s.CatalogItemId)
            .Distinct()
            .ToList();
        if (missingLabelIds.Count > 0)
        {
            var catalogItems = await _db.CatalogItems.AsNoTracking()
                .Include(ci => ci.Translations)
                .Where(ci => missingLabelIds.Contains(ci.Id))
                .ToListAsync(cancellationToken);
            foreach (var item in catalogItems)
            {
                labelById[item.Id] = ResolveLabel(item);
                codeById[item.Id] = item.Code;
            }
        }

        stockouts = stockouts
            .Select(s => s with
            {
                Code = codeById.TryGetValue(s.CatalogItemId, out var code) ? code : string.Empty,
                Label = labelById.TryGetValue(s.CatalogItemId, out var lbl) && !string.IsNullOrWhiteSpace(lbl)
                    ? lbl
                    : (codeById.TryGetValue(s.CatalogItemId, out var fallbackCode) ? fallbackCode : string.Empty)
            })
            .ToList();

        // ---------------------------------------------------------------- workshop + budget
        var weeklyLoad = BuildWeeklyLoad(
            orderedServices,
            backlogTasks,
            employees,
            availabilities,
            now,
            horizonEnd);

        var budget = BuildBudgetProjection(
            orderedServices.Count,
            demandEvents,
            onHandByItem,
            committedByItem,
            unitCostByItem,
            completedOrders,
            costEntries,
            now,
            horizonDays,
            currency);

        return new PredictiveForecastSnapshot(
            GeneratedAt: now,
            HorizonDays: horizonDays,
            HorizonStart: horizonStart,
            HorizonEnd: horizonEnd,
            AssetTemplateId: request.AssetTemplateId,
            WarehouseId: request.WarehouseId,
            Currency: currency,
            ProjectedServices: orderedServices,
            StockoutForecasts: stockouts,
            WeeklyWorkshopLoad: weeklyLoad,
            BudgetProjection: budget,
            MeterProjections: meterProjections);
    }

    // ------------------------------------------------------------------ services

    private static void AddCronServices(
        IReadOnlyList<PreventivePlan> plans,
        IReadOnlyDictionary<Guid, Asset> assetsById,
        DateTime now,
        DateTime horizonEnd,
        List<ProjectedService> services)
    {
        var timeZone = TimeHelper.GetMexicoCityTimeZone();
        var horizonEndExclusive = horizonEnd.AddDays(1);

        foreach (var plan in plans)
        {
            if (string.IsNullOrWhiteSpace(plan.CronExpression))
                continue;

            List<Asset> targets;
            if (plan.AssetId.HasValue && assetsById.TryGetValue(plan.AssetId.Value, out var directAsset))
                targets = new List<Asset> { directAsset };
            else if (plan.AssetTemplateId.HasValue)
                targets = assetsById.Values.Where(a => a.AssetTemplateId == plan.AssetTemplateId.Value).ToList();
            else
                continue;

            targets = targets
                .Where(asset => MatchesPlanConditions(plan.ConditionRuleJson, asset.State))
                .ToList();

            if (targets.Count == 0)
                continue;

            CronExpression expression;
            try
            {
                expression = CronExpression.Parse(plan.CronExpression);
            }
            catch
            {
                continue;
            }

            var planEnd = plan.EndsAt.HasValue ? EnsureUtc(plan.EndsAt.Value) : (DateTime?)null;
            var occurrences = new List<DateTime>();
            var hasBaseline = plan.NextRunAt.HasValue;
            var baseline = hasBaseline ? EnsureUtc(plan.NextRunAt!.Value) : now;

            DateTime cursor;
            if (hasBaseline && baseline < now && (!planEnd.HasValue || baseline <= planEnd.Value) && now < horizonEndExclusive)
            {
                occurrences.Add(now);
                cursor = now;
            }
            else
            {
                cursor = (baseline > now ? baseline : now).AddSeconds(-1);
            }

            while (occurrences.Count < MaxCronOccurrencesPerPlan)
            {
                var next = expression.GetNextOccurrence(cursor, timeZone);
                if (next is null)
                    break;

                var occurrence = EnsureUtc(next.Value);
                if (planEnd.HasValue && occurrence > planEnd.Value)
                    break;
                if (occurrence >= horizonEndExclusive)
                    break;

                occurrences.Add(occurrence);
                cursor = occurrence;
            }

            foreach (var asset in targets)
            {
                foreach (var occurrence in occurrences)
                {
                    services.Add(new ProjectedService(
                        ServiceKey: $"plan:{plan.Id}:{asset.Id}:{occurrence:yyyyMMddHHmm}",
                        AssetId: asset.Id,
                        AssetCode: asset.Code,
                        AssetName: asset.Name,
                        AssetTemplateId: asset.AssetTemplateId,
                        Label: plan.Name,
                        Source: ServiceSource.PreventivePlan,
                        DueDate: occurrence,
                        DaysUntilDue: Math.Max(0, (occurrence.Date - now.Date).Days),
                        PreventivePlanId: plan.Id,
                        MeterKey: null,
                        CurrentMeterValue: null,
                        TargetMeterValue: null,
                        BurnRatePerDay: null,
                        BurnRateConfidence: null,
                        RiskLevel: null));
                }
            }
        }
    }

    private static void AddMeterService(
        Asset asset,
        IReadOnlyList<PreventivePlan> plans,
        PredictiveForecastRequest request,
        DateTime now,
        DateTime horizonEnd,
        IReadOnlyList<MaintenanceOrder> completedOrders,
        IReadOnlyDictionary<Guid, IReadOnlyList<AssetLifecycleEvent>> lifecycleByAsset,
        List<ProjectedService> services,
        List<MeterProjection> meterProjections)
    {
        if (!TryParseJsonObject(asset.PropertiesJson, out var properties))
            return;

        var meterKey = string.IsNullOrWhiteSpace(request.MeterKeyOverride)
            ? DetectMeterKey(properties)
            : request.MeterKeyOverride!.Trim();

        if (meterKey is null || !TryFindNumber(properties, meterKey, out var currentValue))
            return;

        var overrideInterval = request.MeterIntervalOverride is > 0m
            ? request.MeterIntervalOverride
            : null;

        var interval = overrideInterval
                       ?? PositiveOrNull(DetectNumber(properties, IntervalKeys))
                       ?? DetectPlanInterval(plans, asset);

        var explicitTarget = overrideInterval.HasValue
            ? null
            : DetectNumber(properties, TargetKeys);

        var target = explicitTarget
                     ?? (interval.HasValue ? NextIntervalTarget(currentValue, interval.Value) : null);

        var assetEvents = lifecycleByAsset.TryGetValue(asset.Id, out var events)
            ? events
            : Array.Empty<AssetLifecycleEvent>();

        var points = CollectMeterPoints(asset, completedOrders, assetEvents, meterKey, currentValue, now);
        var (burnRate, confidence) = EstimateBurnRate(points, asset, currentValue, now);

        DateTime? projectedDate = null;
        if (burnRate.HasValue && burnRate.Value > 0m && target.HasValue)
        {
            var remaining = target.Value - currentValue;
            if (remaining <= 0m)
            {
                projectedDate = now.Date;
            }
            else
            {
                var rawDays = remaining / burnRate.Value;
                if (rawDays <= MaxProjectedBurnDays)
                {
                    var days = (int)Math.Ceiling(rawDays);
                    projectedDate = now.Date.AddDays(Math.Max(0, days));
                }
            }
        }

        meterProjections.Add(new MeterProjection(
            AssetId: asset.Id,
            AssetCode: asset.Code,
            MeterKey: meterKey,
            CurrentValue: currentValue,
            TargetValue: target,
            Interval: interval,
            BurnRatePerDay: burnRate,
            Confidence: confidence,
            ProjectedServiceDate: projectedDate));

        if (projectedDate is null || projectedDate.Value > horizonEnd || !target.HasValue)
            return;

        var stepTarget = target.Value;
        var stepDate = projectedDate.Value;
        var emitted = 0;

        while (stepDate <= horizonEnd && emitted < MaxMeterOccurrencesPerAsset)
        {
            services.Add(new ProjectedService(
                ServiceKey: $"meter:{asset.Id}:{meterKey}:{stepTarget:0.##}",
                AssetId: asset.Id,
                AssetCode: asset.Code,
                AssetName: asset.Name,
                AssetTemplateId: asset.AssetTemplateId,
                Label: $"Meter service · {meterKey}",
                Source: ServiceSource.MeterBurnRate,
                DueDate: stepDate,
                DaysUntilDue: Math.Max(0, (stepDate.Date - now.Date).Days),
                PreventivePlanId: null,
                MeterKey: meterKey,
                CurrentMeterValue: currentValue,
                TargetMeterValue: stepTarget,
                BurnRatePerDay: burnRate,
                BurnRateConfidence: confidence,
                RiskLevel: null));

            emitted++;

            if (interval is not > 0m || burnRate is not > 0m)
                break;

            stepTarget += interval.Value;
            var remaining = stepTarget - currentValue;
            if (remaining <= 0m)
            {
                stepDate = now.Date;
                continue;
            }

            var rawDays = remaining / burnRate.Value;
            if (rawDays > MaxProjectedBurnDays)
                break;

            var days = (int)Math.Ceiling(rawDays);
            stepDate = now.Date.AddDays(Math.Max(0, days));
        }
    }

    private static void AddHealthRiskServices(
        IReadOnlyDictionary<Guid, AssetHealthPrediction> latestHealth,
        IReadOnlyDictionary<Guid, Asset> assetsById,
        DateTime now,
        int horizonDays,
        List<ProjectedService> services)
    {
        foreach (var (assetId, prediction) in latestHealth)
        {
            if (!assetsById.TryGetValue(assetId, out var asset))
                continue;

            var isCritical = string.Equals(prediction.RiskLevel, "Critical", StringComparison.OrdinalIgnoreCase)
                             || string.Equals(prediction.RiskLevel, "High", StringComparison.OrdinalIgnoreCase)
                             || prediction.RiskProbability >= 0.7m;

            if (!isCritical || !prediction.PredictedFailureDays.HasValue)
                continue;

            var rawDays = prediction.PredictedFailureDays.Value;
            if (rawDays < 0)
                continue;

            var due = EnsureUtc(prediction.CreatedAt).Date.AddDays(rawDays);
            var daysUntil = (due - now.Date).Days;
            if (daysUntil < 0 || daysUntil > horizonDays)
                continue;

            services.Add(new ProjectedService(
                ServiceKey: $"risk:{assetId}:{daysUntil}",
                AssetId: asset.Id,
                AssetCode: asset.Code,
                AssetName: asset.Name,
                AssetTemplateId: asset.AssetTemplateId,
                Label: $"Predictive failure risk ({prediction.RiskLevel})",
                Source: ServiceSource.HealthRisk,
                DueDate: due,
                DaysUntilDue: daysUntil,
                PreventivePlanId: null,
                MeterKey: null,
                CurrentMeterValue: null,
                TargetMeterValue: null,
                BurnRatePerDay: null,
                BurnRateConfidence: null,
                RiskLevel: prediction.RiskLevel));
        }
    }

    // ------------------------------------------------------------------ burn rate

    private static List<(DateTime At, decimal Value)> CollectMeterPoints(
        Asset asset,
        IReadOnlyList<MaintenanceOrder> completedOrders,
        IReadOnlyList<AssetLifecycleEvent> lifecycleEvents,
        string meterKey,
        decimal currentValue,
        DateTime now)
    {
        var points = new List<(DateTime At, decimal Value)>();

        foreach (var order in completedOrders.Where(o => o.AssetId == asset.Id))
        {
            if (!TryParseJsonObject(order.PropertiesJson, out var json))
                continue;
            if (!TryFindNumber(json, meterKey, out var value))
                continue;

            var at = order.CompletedAt ?? order.ScheduledStart ?? order.CreatedAt;
            points.Add((EnsureUtc(at), value));
        }

        foreach (var evt in lifecycleEvents)
        {
            if (!TryParseMeterFromNotes(evt.Notes, meterKey, out var value))
                continue;
            points.Add((EnsureUtc(evt.At), value));
        }

        if (points.Count > 0 && points.Max(p => p.At) < now)
        {
            points.Add((now, currentValue));
        }

        return points
            .GroupBy(p => (p.At, p.Value))
            .Select(g => g.First())
            .OrderBy(p => p.At)
            .TakeLast(MaxBurnRatePoints)
            .ToList();
    }

    private static (decimal? BurnRate, string Confidence) EstimateBurnRate(
        IReadOnlyList<(DateTime At, decimal Value)> points,
        Asset asset,
        decimal currentValue,
        DateTime now)
    {
        if (points.Count >= 2)
        {
            var first = points[0];
            var last = points[^1];
            var spanDays = (last.At - first.At).TotalDays;
            var deltaValue = last.Value - first.Value;

            if (spanDays >= 1 && deltaValue > 0)
            {
                var rate = deltaValue / (decimal)spanDays;
                return (rate, spanDays >= 14 ? "High" : "Medium");
            }
        }

        var start = asset.CommissionedAt ?? asset.InstalledAt ?? asset.CreatedAt;
        var days = (now - EnsureUtc(start)).TotalDays;
        if (days >= 1 && currentValue > 0)
        {
            var rate = currentValue / (decimal)days;
            return (rate, days >= 60 ? "Medium" : "Estimated");
        }

        return (null, "Estimated");
    }

    // ------------------------------------------------------------------ stock crossing

    private static List<DemandEvent> BuildDemandEvents(
        IReadOnlyList<ProjectedService> services,
        IReadOnlyDictionary<Guid, List<(Guid CatalogItemId, decimal Quantity)>> bomByAsset,
        IReadOnlyDictionary<Guid, Dictionary<Guid, decimal>> historicalUsageByAsset)
    {
        var events = new List<DemandEvent>();

        foreach (var service in services)
        {
            var parts = bomByAsset.TryGetValue(service.AssetId, out var assetBom) && assetBom.Count > 0
                ? assetBom
                : historicalUsageByAsset.TryGetValue(service.AssetId, out var history)
                    ? history.Select(kvp => (kvp.Key, kvp.Value)).ToList()
                    : new List<(Guid, decimal)>();

            foreach (var (catalogItemId, quantity) in parts)
            {
                if (quantity <= 0)
                    continue;

                events.Add(new DemandEvent(
                    service.DueDate.Date,
                    catalogItemId,
                    quantity,
                    service.AssetId,
                    service.AssetCode));
            }
        }

        return events;
    }

    private static IReadOnlyList<StockoutForecast> BuildStockoutForecasts(
        IReadOnlyList<DemandEvent> demandEvents,
        IReadOnlyDictionary<Guid, decimal> onHandByItem,
        IReadOnlyDictionary<Guid, decimal> committedByItem,
        IReadOnlyDictionary<Guid, decimal> unitCostByItem,
        DateTime now,
        int horizonDays,
        string currency)
    {
        var results = new List<StockoutForecast>();

        foreach (var group in demandEvents.GroupBy(e => e.CatalogItemId))
        {
            var events = group.OrderBy(e => e.Date).ToList();
            var required = events.Sum(e => e.Quantity);
            if (required <= 0)
                continue;

            var onHand = onHandByItem.GetValueOrDefault(group.Key, 0m);
            var committed = committedByItem.GetValueOrDefault(group.Key, 0m);
            var freeStock = onHand - committed;

            DateTime? stockoutDate = null;
            if (freeStock < 0m)
            {
                stockoutDate = now.Date;
            }
            else
            {
                var cumulative = 0m;
                foreach (var evt in events)
                {
                    cumulative += evt.Quantity;
                    if (cumulative > freeStock)
                    {
                        stockoutDate = evt.Date;
                        break;
                    }
                }
            }

            var shortfall = Math.Max(0m, required - freeStock);
            if (stockoutDate is null && shortfall <= 0m)
                continue;

            var effectiveStockoutDate = stockoutDate ?? events[^1].Date;
            var daysUntil = Math.Clamp((effectiveStockoutDate.Date - now.Date).Days, 0, horizonDays);
            var unitCost = unitCostByItem.GetValueOrDefault(group.Key, 0m);

            results.Add(new StockoutForecast(
                CatalogItemId: group.Key,
                Code: string.Empty,
                Label: string.Empty,
                RequiredQuantity: required,
                AvailableQuantity: freeStock,
                ShortfallQuantity: shortfall,
                DaysUntilStockout: daysUntil,
                StockoutDate: effectiveStockoutDate,
                EstimatedRestockCost: decimal.Round(shortfall * unitCost, 2, MidpointRounding.AwayFromZero),
                Currency: currency,
                AffectedAssetIds: events.Select(e => e.AssetId).Distinct().ToList(),
                AffectedAssetCodes: events.Select(e => e.AssetCode).Distinct(StringComparer.OrdinalIgnoreCase).ToList()));
        }

        return results
            .OrderBy(r => r.DaysUntilStockout ?? int.MaxValue)
            .ThenByDescending(r => r.ShortfallQuantity)
            .ToList();
    }

    // ------------------------------------------------------------------ workshop load

    private static IReadOnlyList<WeeklyWorkshopLoad> BuildWeeklyLoad(
        IReadOnlyList<ProjectedService> services,
        IReadOnlyList<WorkTask> backlogTasks,
        IReadOnlyList<Employee> employees,
        IReadOnlyList<EmployeeAvailability> availabilities,
        DateTime now,
        DateTime horizonEnd)
    {
        var serviceHoursByWeek = new Dictionary<(int Year, int Week), (int Count, decimal Hours)>();
        foreach (var service in services)
        {
            var key = WeekKey(service.DueDate);
            serviceHoursByWeek.TryGetValue(key, out var current);
            serviceHoursByWeek[key] = (current.Count + 1, current.Hours + DefaultServiceHours);
        }

        var backlogByWeek = new Dictionary<(int Year, int Week), int>();
        foreach (var task in backlogTasks)
        {
            var due = task.DueAt ?? task.DueDate ?? task.CreatedAt;
            if (due > horizonEnd)
                continue;

            var normalized = due.Date < now.Date ? now.Date : due.Date;
            var key = WeekKey(normalized);
            backlogByWeek[key] = backlogByWeek.GetValueOrDefault(key) + 1;
        }

        var allWeeks = serviceHoursByWeek.Keys
            .Concat(backlogByWeek.Keys)
            .Distinct()
            .OrderBy(k => k.Year)
            .ThenBy(k => k.Week)
            .ToList();

        var availabilityByEmployee = availabilities
            .GroupBy(a => a.EmployeeId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var results = new List<WeeklyWorkshopLoad>();

        foreach (var (year, week) in allWeeks)
        {
            var weekStart = ISOWeek.ToDateTime(year, week, DayOfWeek.Monday).Date;
            var weekEnd = weekStart.AddDays(6);

            serviceHoursByWeek.TryGetValue((year, week), out var serviceInfo);
            var backlogCount = backlogByWeek.GetValueOrDefault((year, week));
            var projectedHours = serviceInfo.Hours + backlogCount * DefaultBacklogHoursPerTask;

            var availableHours = employees.Sum(e =>
                ComputeEmployeeWeekHours(e, availabilityByEmployee, weekStart));

            var saturation = availableHours <= 0m
                ? (projectedHours > 0m ? 100m : 0m)
                : decimal.Round(projectedHours / availableHours * 100m, 2, MidpointRounding.AwayFromZero);

            results.Add(new WeeklyWorkshopLoad(
                IsoYear: year,
                IsoWeek: week,
                WeekStart: weekStart,
                WeekEnd: weekEnd,
                ProjectedServices: serviceInfo.Count,
                BacklogTasks: backlogCount,
                ProjectedHours: projectedHours,
                AvailableHours: decimal.Round(availableHours, 2, MidpointRounding.AwayFromZero),
                SaturationPercent: saturation,
                IsOverloaded: saturation >= 90m));
        }

        return results;
    }

    private static decimal ComputeEmployeeWeekHours(
        Employee employee,
        IReadOnlyDictionary<Guid, List<EmployeeAvailability>> availabilityByEmployee,
        DateTime weekStart)
    {
        if (!availabilityByEmployee.TryGetValue(employee.Id, out var rows) || rows.Count == 0)
            return DefaultWeeklyHoursPerTechnician;

        var total = 0m;
        for (var i = 0; i < 7; i++)
        {
            var day = weekStart.AddDays(i);
            var dayOfWeek = (int)day.DayOfWeek;
            foreach (var row in rows.Where(r => r.DayOfWeek == dayOfWeek && r.IsAvailable))
            {
                var hours = (decimal)(row.EndTime - row.StartTime).TotalHours;
                if (hours > 0)
                    total += Math.Min(hours, 24m);
            }
        }

        return Math.Min(total, 168m);
    }

    // ------------------------------------------------------------------ budget

    private static BudgetProjection BuildBudgetProjection(
        int projectedServiceCount,
        IReadOnlyList<DemandEvent> demandEvents,
        IReadOnlyDictionary<Guid, decimal> onHandByItem,
        IReadOnlyDictionary<Guid, decimal> committedByItem,
        IReadOnlyDictionary<Guid, decimal> unitCostByItem,
        IReadOnlyList<MaintenanceOrder> completedOrders,
        IReadOnlyList<CostEntry> costEntries,
        DateTime now,
        int horizonDays,
        string currency)
    {
        var coveredCost = 0m;
        var urgentCost = 0m;

        foreach (var group in demandEvents.GroupBy(e => e.CatalogItemId))
        {
            var required = group.Sum(e => e.Quantity);
            var freeStock = onHandByItem.GetValueOrDefault(group.Key, 0m)
                            - committedByItem.GetValueOrDefault(group.Key, 0m);
            var unitCost = unitCostByItem.GetValueOrDefault(group.Key, 0m);

            var covered = Math.Clamp(freeStock, 0m, required);
            var shortfall = Math.Max(0m, required - freeStock);

            coveredCost += covered * unitCost;
            urgentCost += shortfall * unitCost;
        }

        var averageLaborPerService = 0m;
        var averageCostPerService = 0m;
        if (completedOrders.Count > 0)
        {
            averageLaborPerService = completedOrders.Average(o => o.LaborCost);
            averageCostPerService = completedOrders.Average(o =>
                o.LaborCost + o.Parts.Sum(p => p.Quantity * p.UnitCost));
        }

        var estimatedLabor = averageLaborPerService * projectedServiceCount;

        var costWindowStart = now.AddDays(-90);
        var recentCosts = costEntries
            .Where(c => c.OccurredAt >= costWindowStart
                        && string.Equals(c.Currency?.Trim(), currency, StringComparison.OrdinalIgnoreCase))
            .ToList();
        var historicalDailyCost = recentCosts.Count == 0
            ? 0m
            : recentCosts.Sum(c => c.Amount) / 90m;

        var historicalRunRate = historicalDailyCost * horizonDays;

        return new BudgetProjection(
            Currency: currency,
            CoveredPartsCost: decimal.Round(coveredCost, 2, MidpointRounding.AwayFromZero),
            UrgentPurchaseCost: decimal.Round(urgentCost, 2, MidpointRounding.AwayFromZero),
            EstimatedLaborCost: decimal.Round(estimatedLabor, 2, MidpointRounding.AwayFromZero),
            HistoricalRunRateCost: decimal.Round(historicalRunRate, 2, MidpointRounding.AwayFromZero),
            EstimatedTotalCost: decimal.Round(coveredCost + urgentCost + estimatedLabor, 2, MidpointRounding.AwayFromZero),
            ProjectedServiceCount: projectedServiceCount,
            AverageCostPerService: decimal.Round(averageCostPerService, 2, MidpointRounding.AwayFromZero),
            HistoricalDailyCost: decimal.Round(historicalDailyCost, 2, MidpointRounding.AwayFromZero));
    }

    // ------------------------------------------------------------------ historical usage

    private static Dictionary<Guid, decimal> BuildHistoricalUnitCost(IReadOnlyList<MaintenanceOrder> completedOrders)
    {
        var totals = new Dictionary<Guid, (decimal Qty, decimal Cost)>();
        foreach (var part in completedOrders.SelectMany(o => o.Parts))
        {
            totals.TryGetValue(part.CatalogItemId, out var current);
            totals[part.CatalogItemId] = (current.Qty + part.Quantity, current.Cost + part.Quantity * part.UnitCost);
        }

        return totals.ToDictionary(
            kvp => kvp.Key,
            kvp => kvp.Value.Qty > 0 ? kvp.Value.Cost / kvp.Value.Qty : 0m);
    }

    private static Dictionary<Guid, Dictionary<Guid, decimal>> BuildHistoricalUsage(
        IReadOnlyList<MaintenanceOrder> completedOrders)
    {
        var result = new Dictionary<Guid, Dictionary<Guid, decimal>>();

        foreach (var assetGroup in completedOrders.GroupBy(o => o.AssetId))
        {
            var orderCount = assetGroup.Count();
            if (orderCount == 0)
                continue;

            var itemTotals = assetGroup
                .SelectMany(o => o.Parts)
                .GroupBy(p => p.CatalogItemId)
                .ToDictionary(g => g.Key, g => g.Sum(p => (decimal)p.Quantity));

            result[assetGroup.Key] = itemTotals.ToDictionary(
                kvp => kvp.Key,
                kvp => decimal.Round(kvp.Value / orderCount, 2, MidpointRounding.AwayFromZero));
        }

        return result;
    }

    // ------------------------------------------------------------------ parsing helpers

    private static bool TryParseJsonObject(string? json, out JsonElement element)
    {
        element = default;
        if (string.IsNullOrWhiteSpace(json))
            return false;

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
                return false;

            element = document.RootElement.Clone();
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string? DetectMeterKey(JsonElement root)
    {
        foreach (var key in MeterKeys)
        {
            if (TryFindNumber(root, key, out _))
                return key;
        }

        return null;
    }

    private static decimal? DetectNumber(JsonElement root, IEnumerable<string> keys)
    {
        foreach (var key in keys)
        {
            if (TryFindNumber(root, key, out var value))
                return value;
        }

        return null;
    }

    private static decimal? PositiveOrNull(decimal? value) =>
        value.HasValue && value.Value > 0m ? value.Value : null;

    private static bool MatchesPlanConditions(string? conditionRuleJson, string assetState)
    {
        if (string.IsNullOrWhiteSpace(conditionRuleJson))
            return true;

        try
        {
            var rule = JsonSerializer.Deserialize<ConditionRule>(
                conditionRuleJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (rule is null)
                return true;

            if (rule.AllowedStates is { Count: > 0 }
                && !rule.AllowedStates.Contains(assetState, StringComparer.OrdinalIgnoreCase))
            {
                return false;
            }

            if (rule.ExcludedStates is { Count: > 0 }
                && rule.ExcludedStates.Contains(assetState, StringComparer.OrdinalIgnoreCase))
            {
                return false;
            }

            return true;
        }
        catch
        {
            return true;
        }
    }

    private static decimal? DetectPlanInterval(IReadOnlyList<PreventivePlan> plans, Asset asset)
    {
        var candidatePlans = plans
            .Where(p => p.AssetId == asset.Id && !string.IsNullOrWhiteSpace(p.ConditionRuleJson))
            .Concat(plans.Where(p => p.AssetId is null
                                     && p.AssetTemplateId == asset.AssetTemplateId
                                     && !string.IsNullOrWhiteSpace(p.ConditionRuleJson)));

        foreach (var plan in candidatePlans)
        {
            if (!TryParseJsonObject(plan.ConditionRuleJson, out var rule))
                continue;

            var value = DetectNumber(rule, IntervalKeys)
                        ?? DetectNumber(rule, new[] { "intervalHours", "meterInterval", "interval", "targetHours", "serviceInterval" });
            if (value.HasValue && value.Value > 0m)
                return value.Value;
        }

        return null;
    }

    private static decimal? NextIntervalTarget(decimal current, decimal interval)
    {
        if (interval <= 0m)
            return null;

        var remainder = current % interval;
        if (remainder == 0m)
            return current + interval;

        return Math.Ceiling(current / interval) * interval;
    }

    private static bool TryFindNumber(JsonElement element, string key, out decimal value)
    {
        value = 0m;
        if (element.ValueKind != JsonValueKind.Object)
            return false;

        foreach (var property in element.EnumerateObject())
        {
            if (!string.Equals(property.Name, key, StringComparison.OrdinalIgnoreCase))
                continue;

            if (TryReadDecimal(property.Value, out value))
                return true;
        }

        return false;
    }

    private static bool TryReadDecimal(JsonElement element, out decimal value)
    {
        value = 0m;
        switch (element.ValueKind)
        {
            case JsonValueKind.Number:
                return element.TryGetDecimal(out value);
            case JsonValueKind.String:
                return TryParseFlexibleDecimal(element.GetString(), out value);
            default:
                return false;
        }
    }

    private static bool TryParseFlexibleDecimal(string? raw, out decimal value)
    {
        value = 0m;
        if (string.IsNullOrWhiteSpace(raw))
            return false;

        var trimmed = raw.Trim();
        var hasComma = trimmed.Contains(',');
        var hasDot = trimmed.Contains('.');

        string normalized;
        if (hasComma && hasDot)
        {
            normalized = trimmed.LastIndexOf(',') > trimmed.LastIndexOf('.')
                ? trimmed.Replace(".", string.Empty).Replace(',', '.')
                : trimmed.Replace(",", string.Empty);
        }
        else if (hasComma)
        {
            try
            {
                normalized = ThousandsCommaRegex.IsMatch(trimmed)
                    ? trimmed.Replace(",", string.Empty)
                    : trimmed.Replace(',', '.');
            }
            catch (RegexMatchTimeoutException)
            {
                return false;
            }
        }
        else if (hasDot)
        {
            try
            {
                normalized = MultiDotThousandsRegex.IsMatch(trimmed)
                    ? trimmed.Replace(".", string.Empty)
                    : trimmed;
            }
            catch (RegexMatchTimeoutException)
            {
                return false;
            }
        }
        else
        {
            normalized = trimmed;
        }

        return decimal.TryParse(
            normalized,
            NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
            CultureInfo.InvariantCulture,
            out value);
    }

    private static bool TryParseMeterFromNotes(string? notes, string meterKey, out decimal value)
    {
        value = 0m;
        if (string.IsNullOrWhiteSpace(notes))
            return false;

        if (TryParseJsonObject(notes, out var json) && TryFindNumber(json, meterKey, out value))
            return true;

        try
        {
            var pattern = $@"(?i)(?<![\p{{L}}\p{{N}}_]){Regex.Escape(meterKey)}(?![\p{{L}}\p{{N}}_])\s*[:=]\s*(-?[0-9]+(?:[.,][0-9]+)*)";
            var match = Regex.Match(notes, pattern, RegexOptions.CultureInvariant, RegexTimeout);
            if (match.Success)
            {
                return TryParseFlexibleDecimal(match.Groups[1].Value, out value);
            }
        }
        catch (Exception ex) when (ex is ArgumentException or RegexMatchTimeoutException)
        {
            return false;
        }

        return false;
    }

    private static string ResolveLabel(CatalogItem item)
    {
        if (item.Translations is { Count: > 0 })
        {
            var uiIso = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
            var preferredLocale = string.Equals(uiIso, "en", StringComparison.OrdinalIgnoreCase) ? "en" : "es";
            var fallbackLocale = preferredLocale == "en" ? "es" : "en";

            var preferred = item.Translations.FirstOrDefault(t => string.Equals(t.Locale, preferredLocale, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(preferred?.Label))
                return preferred.Label;

            var secondary = item.Translations.FirstOrDefault(t => string.Equals(t.Locale, fallbackLocale, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(secondary?.Label))
                return secondary.Label;

            var first = item.Translations.FirstOrDefault(t => !string.IsNullOrWhiteSpace(t.Label));
            if (first is not null)
                return first.Label;
        }

        return item.Code;
    }

    private static (int Year, int Week) WeekKey(DateTime date) =>
        (ISOWeek.GetYear(date), ISOWeek.GetWeekOfYear(date));

    private static int NormalizeHorizon(int horizonDays) =>
        horizonDays <= 30 ? 30 : horizonDays <= 60 ? 60 : 90;

    private static DateTime EnsureUtc(DateTime value) =>
        value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);

    private sealed record DemandEvent(
        DateTime Date,
        Guid CatalogItemId,
        decimal Quantity,
        Guid AssetId,
        string AssetCode);

    private sealed class ConditionRule
    {
        public List<string>? AllowedStates { get; set; }
        public List<string>? ExcludedStates { get; set; }
    }
}
