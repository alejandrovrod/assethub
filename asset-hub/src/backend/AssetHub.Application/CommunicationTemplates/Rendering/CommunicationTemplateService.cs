using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.CommunicationTemplates;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace AssetHub.Application.CommunicationTemplates.Rendering;

/// <summary>
/// Resuelve la version activa de una plantilla por Code (aislada por tenant),
/// elige la traduccion del idioma del destinatario (fallback: "es") y renderiza
/// asunto y cuerpo con Scriban. Variables inexistentes => string vacio, sin error.
/// </summary>
public class CommunicationTemplateService : ICommunicationTemplateService
{
    private const string DefaultLocale = "es";

    private readonly ITenantDbContext _db;
    private readonly IPlatformDbContext _platformDb;
    private readonly ITemplateRenderEngine _renderEngine;
    private readonly IConfiguration _configuration;

    public CommunicationTemplateService(
        ITenantDbContext db, 
        IPlatformDbContext platformDb, 
        ITemplateRenderEngine renderEngine,
        IConfiguration configuration)
    {
        _db = db;
        _platformDb = platformDb;
        _renderEngine = renderEngine;
        _configuration = configuration;
    }

    public async Task<RenderedCommunication?> RenderActiveAsync(
        Guid tenantId,
        string templateCode,
        string recipientLocale,
        IReadOnlyDictionary<string, object> variables,
        CancellationToken cancellationToken = default)
    {
        // Buscar la plantilla por codigo dentro del tenant (el query filter de TenantId ya aplica,
        // pero se filtra explicitamente porque este servicio puede llamarse desde event handlers
        // que no necesariamente corren con el resolver del tenant correcto).
        var template = await _db.CommunicationTemplates
            .Where(t => t.TenantId == tenantId && t.Code == templateCode)
            .FirstOrDefaultAsync(cancellationToken);

        if (template == null || template.ActiveVersionId == null)
        {
            return null; // Sin plantilla definida => el caller usa su fallback hardcodeado
        }

        // Cargar la version activa con sus traducciones
        var version = await _db.CommunicationTemplateVersions
            .Where(v => v.Id == template.ActiveVersionId)
            .Include(v => v.Translations)
            .FirstOrDefaultAsync(cancellationToken);

        if (version == null || version.Translations.Count == 0)
        {
            return null;
        }

        // Resolver traduccion: idioma del destinatario => "es" => la primera disponible
        var locale = string.IsNullOrWhiteSpace(recipientLocale) ? DefaultLocale : recipientLocale;
        var translation = version.Translations.FirstOrDefault(t => t.Locale == locale)
            ?? version.Translations.FirstOrDefault(t => t.Locale == DefaultLocale)
            ?? version.Translations.First();

        var mergedVariables = new Dictionary<string, object>(variables);
        var tenant = await _platformDb.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, cancellationToken);
        if (tenant != null)
        {
            var logoUrl = tenant.LogoUrl;
            if (string.IsNullOrWhiteSpace(logoUrl))
            {
                logoUrl = "https://placehold.co/400x100?text=Logo+Tenant";
            }
            else if (!logoUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && 
                     !logoUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                var baseUrl = _configuration["App:BaseUrl"] ?? "https://localhost:7184";
                baseUrl = baseUrl.TrimEnd('/');
                logoUrl = baseUrl + (logoUrl.StartsWith("/") ? "" : "/") + logoUrl;
            }

            mergedVariables["tenant"] = new
            {
                name = tenant.Name,
                logo_url = logoUrl,
                support_email = tenant.SupportEmail ?? "soporte@sonnora.mx"
            };
        }

        var subject = translation.Subject != null
            ? _renderEngine.Render(translation.Subject, mergedVariables)
            : null;
        var body = _renderEngine.Render(translation.Content, mergedVariables);

        return new RenderedCommunication(subject, body);
    }

    public async Task<RenderedCommunication?> RenderByIdAsync(
        Guid tenantId,
        Guid templateId,
        string recipientLocale,
        IReadOnlyDictionary<string, object> variables,
        CancellationToken cancellationToken = default)
    {
        var template = await _db.CommunicationTemplates
            .Where(t => t.TenantId == tenantId && t.Id == templateId)
            .FirstOrDefaultAsync(cancellationToken);

        if (template == null || template.ActiveVersionId == null)
        {
            return null;
        }

        var version = await _db.CommunicationTemplateVersions
            .Where(v => v.Id == template.ActiveVersionId)
            .Include(v => v.Translations)
            .FirstOrDefaultAsync(cancellationToken);

        if (version == null || version.Translations.Count == 0)
        {
            return null;
        }

        var locale = string.IsNullOrWhiteSpace(recipientLocale) ? DefaultLocale : recipientLocale;
        var translation = version.Translations.FirstOrDefault(t => t.Locale == locale)
            ?? version.Translations.FirstOrDefault(t => t.Locale == DefaultLocale)
            ?? version.Translations.First();

        var mergedVariables = new Dictionary<string, object>(variables);
        var tenant = await _platformDb.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, cancellationToken);
        if (tenant != null)
        {
            var logoUrl = tenant.LogoUrl;
            if (string.IsNullOrWhiteSpace(logoUrl))
            {
                logoUrl = "https://placehold.co/400x100?text=Logo+Tenant";
            }
            else if (!logoUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && 
                     !logoUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                var baseUrl = _configuration["App:BaseUrl"] ?? "https://localhost:7184";
                baseUrl = baseUrl.TrimEnd('/');
                logoUrl = baseUrl + (logoUrl.StartsWith("/") ? "" : "/") + logoUrl;
            }

            mergedVariables["tenant"] = new
            {
                name = tenant.Name,
                logo_url = logoUrl,
                support_email = tenant.SupportEmail ?? "soporte@sonnora.mx"
            };
        }

        var subject = translation.Subject != null
            ? _renderEngine.Render(translation.Subject, mergedVariables)
            : null;
        var body = _renderEngine.Render(translation.Content, mergedVariables);

        return new RenderedCommunication(subject, body);
    }
}
