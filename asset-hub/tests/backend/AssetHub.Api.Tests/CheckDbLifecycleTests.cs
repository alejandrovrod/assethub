using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.AssetTemplates;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests;

public class CheckDbLifecycleTests
{
    private sealed class GlobalTenantResolver : ITenantResolver
    {
        public Domain.Tenancy.Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => null;
        public Guid? GetCurrentUserId() => null;
    }

    [Fact]
    public async Task CheckTemplatesInDb()
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__assethub");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            var configPath = @"c:\Workspace\kimi\asset-hub\src\backend\AssetHub.Api\appsettings.json";
            if (File.Exists(configPath))
            {
                var configJson = File.ReadAllText(configPath);
                using var configDoc = JsonDocument.Parse(configJson);
                if (configDoc.RootElement.TryGetProperty("ConnectionStrings", out var csProp) &&
                    csProp.TryGetProperty("assethub", out var ahProp))
                {
                    connectionString = ahProp.GetString();
                }
            }
        }

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            // Skip execution if no direct DB connection is configured
            return;
        }

        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseSqlServer(connectionString, x => x.UseNetTopologySuite())
            .Options;

        using var db = new TenantDbContext(options, new GlobalTenantResolver());

        var templates = await db.AssetTemplates.IgnoreQueryFilters().ToListAsync();
        foreach (var t in templates)
        {
            var rawLifecycle = JsonSerializer.Serialize(t.LifecycleStates);
            Console.WriteLine($"TEMPLATE: {t.Code} | Name: {t.Name} | TenantId: {t.TenantId}");
            Console.WriteLine($"  InitialState: '{t.LifecycleStates?.InitialState}'");
            Console.WriteLine($"  States count: {t.LifecycleStates?.States?.Count ?? 0}");
            Console.WriteLine($"  Transitions count: {t.LifecycleStates?.Transitions?.Count ?? 0}");
            Console.WriteLine($"  Raw: {rawLifecycle.Substring(0, Math.Min(120, rawLifecycle.Length))}...");
        }
    }
}
