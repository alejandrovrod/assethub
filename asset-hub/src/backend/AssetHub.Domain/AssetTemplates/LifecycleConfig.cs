using System.Collections.Generic;

namespace AssetHub.Domain.AssetTemplates;

public class LifecycleConfig
{
    public string InitialState { get; set; } = string.Empty;
    public Dictionary<string, List<string>> Transitions { get; set; } = new();

    // UI metadata to preserve visual canvas state (ReactFlow)
    public System.Text.Json.JsonElement? Nodes { get; set; }
    public System.Text.Json.JsonElement? Edges { get; set; }
}
