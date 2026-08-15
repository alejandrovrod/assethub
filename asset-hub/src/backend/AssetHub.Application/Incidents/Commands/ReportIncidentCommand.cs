using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Assets.Commands;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Incidents;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.IO;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace AssetHub.Application.Incidents.Commands;

public class ReportIncidentCommand : IRequest<Guid>
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid AssetId { get; set; }
    public Guid TypeId { get; set; }
    public Guid? PriorityId { get; set; }
    
    public Guid? IncidentTemplateId { get; set; }
    public string PropertiesJson { get; set; } = "{}";
    
    public string? GeoJson { get; set; }
    
    public List<AttachmentDto> Attachments { get; set; } = new();

    public class AttachmentDto
    {
        public string FileUrl { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public string ContentType { get; set; } = string.Empty;
        public long SizeBytes { get; set; }
    }
}

public class ReportIncidentCommandHandler : IRequestHandler<ReportIncidentCommand, Guid>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;
    private readonly IMediator _mediator;
    private readonly ILogger<ReportIncidentCommandHandler> _logger;

    public ReportIncidentCommandHandler(ITenantDbContext db, ITenantResolver tenantResolver, IMediator mediator, ILogger<ReportIncidentCommandHandler> logger)
    {
        _db = db;
        _tenantResolver = tenantResolver;
        _mediator = mediator;
        _logger = logger;
    }

    public async Task<Guid> Handle(ReportIncidentCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId();
        
        var assetExists = await _db.Assets.AnyAsync(a => a.Id == request.AssetId, cancellationToken);
        if (!assetExists)
            throw new ArgumentException("Asset not found");
            
        // var typeExists = await _db.CatalogItems.AnyAsync(c => c.Id == request.TypeId, cancellationToken);
        // if (!typeExists && request.TypeId != Guid.Empty)
        //     throw new ArgumentException("Type catalog item not found");
            
        // if (request.PriorityId.HasValue && request.PriorityId.Value != Guid.Empty)
        // {
        //     var priorityExists = await _db.CatalogItems.AnyAsync(c => c.Id == request.PriorityId.Value, cancellationToken);
        //     if (!priorityExists)
        //         throw new ArgumentException("Priority catalog item not found");
        // }
        
        NetTopologySuite.Geometries.Geometry? geo = null;
        string? geoType = null;
        if (!string.IsNullOrWhiteSpace(request.GeoJson))
        {
            var reader = new GeoJsonReader();
            geo = reader.Read<NetTopologySuite.Geometries.Geometry>(request.GeoJson);
            if (geo != null)
            {
                geo.SRID = 4326;
                geoType = geo.GeometryType;
            }
        }

        var incident = new Incident
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            Title = request.Title,
            Description = request.Description,
            AssetId = request.AssetId,
            TypeId = request.TypeId,
            PriorityId = request.PriorityId,
            IncidentTemplateId = request.IncidentTemplateId,
            PropertiesJson = string.IsNullOrWhiteSpace(request.PropertiesJson) ? "{}" : request.PropertiesJson,
            State = "reported", // Podríamos obtener el initial state de la plantilla si existe
            Geo = geo,
            GeoType = geoType
        };

        if (request.IncidentTemplateId.HasValue)
        {
            var template = await _db.IncidentTemplates.FirstOrDefaultAsync(t => t.Id == request.IncidentTemplateId.Value, cancellationToken);
            if (template != null && template.LifecycleStates != null && !string.IsNullOrEmpty(template.LifecycleStates.InitialState))
            {
                incident.State = template.LifecycleStates.InitialState;
            }
        }

        _db.Incidents.Add(incident);

        foreach (var att in request.Attachments)
        {
            _db.IncidentAttachments.Add(new IncidentAttachment
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId.Value,
                IncidentId = incident.Id,
                FileUrl = att.FileUrl,
                FileName = att.FileName,
                ContentType = att.ContentType,
                SizeBytes = att.SizeBytes
            });
        }

        _db.IncidentLifecycleEvents.Add(new IncidentLifecycleEvent
        {
            Id = Guid.NewGuid(),
            IncidentId = incident.Id,
            EventType = "reportado",
            FromState = string.Empty,
            ToState = incident.State,
            Notes = "Incidencia reportada",
            PropertiesJson = incident.PropertiesJson,
            At = DateTime.UtcNow,
            UserId = Guid.Empty // Sistema por ahora, hasta que inyectemos usuario
        });

        await _db.SaveChangesAsync(cancellationToken);

        // --- Flujo Dual: Lock the asset and propagate upward ---
        // After saving the incident, transition the affected asset to its "incidents-locked" state.
        // The resulting AssetStateChangedEvent will be handled by ParentStatePropagationHandler
        // which already implements upward propagation recursively.
        await TryLockAssetForIncidentAsync(request.AssetId, cancellationToken);

        return incident.Id;
    }

    private async Task TryLockAssetForIncidentAsync(Guid assetId, CancellationToken cancellationToken)
    {
        var asset = await _db.Assets
            .Include(a => a.AssetTemplate)
            .FirstOrDefaultAsync(a => a.Id == assetId, cancellationToken);

        if (asset?.AssetTemplate?.LifecycleStates == null)
        {
            _logger.LogWarning("[ReportIncident] Asset {AssetId} has no lifecycle template. Skipping asset lock.", assetId);
            return;
        }

        var lifecycle = asset.AssetTemplate.LifecycleStates;

        // Find a state reachable from the current state that has AssociatedModule = "incidents"
        if (!lifecycle.Transitions.TryGetValue(asset.State, out var reachableStates) || reachableStates == null)
        {
            _logger.LogWarning("[ReportIncident] No transitions defined from state '{State}' for asset {AssetId}.", asset.State, assetId);
            return;
        }

        var lockedState = reachableStates.FirstOrDefault(s =>
            lifecycle.States.TryGetValue(s, out var cfg) &&
            string.Equals(cfg.AssociatedModule, "incidents", StringComparison.OrdinalIgnoreCase));

        if (lockedState == null)
        {
            _logger.LogWarning(
                "[ReportIncident] No reachable state with AssociatedModule='incidents' from '{State}' for asset {AssetId}. Skipping lock.",
                asset.State, assetId);
            return;
        }

        _logger.LogInformation(
            "[ReportIncident] Locking asset {AssetId} from '{From}' → '{To}' due to new incident.",
            assetId, asset.State, lockedState);

        try
        {
            await _mediator.Send(
                new ChangeAssetEnvironmentStateCommand(assetId, lockedState, "Bloqueado automáticamente por incidencia reportada."),
                cancellationToken);
        }
        catch (Exception ex)
        {
            // Non-fatal: log but don't fail the incident creation
            _logger.LogError(ex, "[ReportIncident] Failed to lock asset {AssetId}. Incident was still created.", assetId);
        }
    }
}
