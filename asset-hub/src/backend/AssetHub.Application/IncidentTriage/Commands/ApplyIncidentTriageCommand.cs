using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using MediatR;

namespace AssetHub.Application.IncidentTriage.Commands;

public sealed class ApplyIncidentTriageCommand : IRequest<ApplyIncidentTriageResult>
{
    public Guid IncidentId { get; set; }
    public Guid? PriorityId { get; set; }
    public Guid? AssignedEmployeeId { get; set; }
    public string? TargetState { get; set; }
    public string? DiagnosisSummary { get; set; }
    public bool CreateOrUpdateWorkOrder { get; set; }
    public List<ApplyTriagePartInput> SuggestedParts { get; set; } = new();

    /// <summary>
    /// Optimistic concurrency version decoded from the client's <c>If-Match</c> header.
    /// </summary>
    [JsonIgnore]
    public byte[]? ExpectedRowVersion { get; set; }
}

public sealed record ApplyTriagePartInput(
    Guid CatalogItemId,
    int Quantity,
    Guid? WarehouseId = null
);

public sealed record ApplyIncidentTriageResult(
    Guid IncidentId,
    string State,
    Guid? PriorityId,
    Guid? AssignedEmployeeId,
    Guid? MaintenanceOrderId,
    int AddedPartsCount,
    string? ETag
);
