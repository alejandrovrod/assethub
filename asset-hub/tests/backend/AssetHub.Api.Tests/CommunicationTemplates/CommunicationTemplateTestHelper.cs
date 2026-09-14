using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.CommunicationTemplates.Rendering;
using AssetHub.Application.Interfaces;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace AssetHub.Api.Tests.CommunicationTemplates;

public static class CommunicationTemplateTestHelper
{
    public sealed class FakeTenantResolver : ITenantResolver
    {
        private readonly Guid? _tenantId;
        public FakeTenantResolver(Guid tenantId) => _tenantId = tenantId;
        public Domain.Tenancy.Tenant? GetCurrentTenant() => null;
        public Guid? GetCurrentTenantId() => _tenantId;
    }

    public sealed class CapturingEmailService : IEmailService
    {
        public List<(string To, string Subject, string Body)> Sent { get; } = new();

        public Task SendEmailAsync(string to, string subject, string body, bool isHtml = false, CancellationToken cancellationToken = default)
        {
            Sent.Add((to, subject, body));
            return Task.CompletedTask;
        }
    }

    public static TenantDbContext CreateDbContext(Guid tenantId)
    {
        var resolver = new FakeTenantResolver(tenantId);
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TenantDbContext(options, resolver);
    }

    public static PlatformDbContext CreatePlatformDbContext()
    {
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new PlatformDbContext(options);
    }

    /// <summary>
    /// CommunicationTemplateService con platform db en memoria y config vacia
    /// (usa los defaults de logo/BaseUrl cuando no hay tenant cargado).
    /// </summary>
    public static CommunicationTemplateService CreateTemplateService(
        TenantDbContext db, PlatformDbContext? platformDb = null)
    {
        return new CommunicationTemplateService(
            db,
            platformDb ?? CreatePlatformDbContext(),
            new AssetHub.Infrastructure.Services.Templates.ScribanTemplateRenderEngine(),
            new ConfigurationBuilder().Build());
    }
}
