using System;
using System.Text.Json.Serialization;
using MediatR;

namespace AssetHub.Application.Tasks.Commands;

public class UpdateWorkTaskPropertiesCommand : IRequest<Unit>
{
    public Guid WorkTaskId { get; set; }
    public string PropertiesJson { get; set; } = "{}";

    [JsonIgnore]
    public byte[]? ExpectedRowVersion { get; set; }
}

