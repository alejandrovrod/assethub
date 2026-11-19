using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using AssetHub.Domain.AssetTemplates;
using AssetHub.Domain.Incidents;

namespace AssetHub.Application.IncidentTriage;

/// <summary>
/// Single source of truth for reachable non-terminal incident states, terminal detection,
/// and prompt property sanitization across both analysis and apply phases.
/// </summary>
public static class IncidentTriageStateHelper
{
    private const int MaxPropertyStringLength = 400;

    private static readonly HashSet<string> WorkOrderModules = new(StringComparer.OrdinalIgnoreCase)
    {
        "maintenance",
        "orders",
        "maintenance_orders",
        "work_orders"
    };

    public static IReadOnlyList<TriageReachableStateOption> GetReachableNonTerminalStates(Incident incident)
    {
        var config = incident.WorkflowTemplate?.LifecycleStates;
        if (config?.States is { Count: > 0 })
        {
            return GetTemplateReachableStates(incident.State, config);
        }

        return GetDefaultReachableStates(incident.State);
    }

    public static bool IsTerminalState(Incident incident, string stateName)
    {
        if (string.IsNullOrWhiteSpace(stateName))
            return false;

        var config = incident.WorkflowTemplate?.LifecycleStates;
        if (config?.States is { Count: > 0 } && TryGetStateConfig(config.States, stateName, out _, out var stateConfig))
        {
            return stateConfig.IsTerminal;
        }

        return IncidentStates.TerminalStates.Contains(stateName);
    }

    /// <summary>
    /// Removes inline base64 data URLs and truncates oversized strings so prompt context stays
    /// within token budgets without failing on unparseable legacy payloads.
    /// </summary>
    public static string SanitizePropertiesJsonForPrompt(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return "{}";

        try
        {
            var node = JsonNode.Parse(json);
            if (node is null)
                return "{}";

            var sanitized = SanitizeNode(node);
            return sanitized?.ToJsonString() ?? "{}";
        }
        catch (JsonException)
        {
            return json.Length > MaxPropertyStringLength
                ? string.Concat(json.AsSpan(0, MaxPropertyStringLength), "...")
                : json;
        }
    }

    private static IReadOnlyList<TriageReachableStateOption> GetTemplateReachableStates(
        string currentState,
        LifecycleConfig config)
    {
        if (config.Transitions is null ||
            !TryGetTransitionTargets(config.Transitions, currentState, out var targets) ||
            targets is null)
        {
            return Array.Empty<TriageReachableStateOption>();
        }

        var results = new List<TriageReachableStateOption>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var target in targets)
        {
            if (string.IsNullOrWhiteSpace(target))
                continue;

            if (!TryGetStateConfig(config.States, target, out var canonicalName, out var stateConfig))
                continue;

            if (stateConfig.IsTerminal || string.Equals(canonicalName, currentState, StringComparison.OrdinalIgnoreCase))
                continue;

            if (!seen.Add(canonicalName))
                continue;

            var triggersWorkOrder =
                (!string.IsNullOrWhiteSpace(stateConfig.AssociatedModule) && WorkOrderModules.Contains(stateConfig.AssociatedModule.Trim())) ||
                string.Equals(canonicalName, IncidentStates.Assigned, StringComparison.OrdinalIgnoreCase);

            results.Add(new TriageReachableStateOption(canonicalName, triggersWorkOrder));
        }

        return results;
    }

    private static IReadOnlyList<TriageReachableStateOption> GetDefaultReachableStates(string currentState)
    {
        if (IncidentStates.TerminalStates.Contains(currentState))
            return Array.Empty<TriageReachableStateOption>();

        return currentState.ToLowerInvariant() switch
        {
            IncidentStates.Reported => new[]
            {
                new TriageReachableStateOption(IncidentStates.Triaged, false),
                new TriageReachableStateOption(IncidentStates.Assigned, true)
            },
            IncidentStates.Triaged => new[]
            {
                new TriageReachableStateOption(IncidentStates.Assigned, true)
            },
            IncidentStates.Assigned => new[]
            {
                new TriageReachableStateOption(IncidentStates.InProgress, false)
            },
            IncidentStates.InProgress => new[]
            {
                new TriageReachableStateOption(IncidentStates.Resolved, false)
            },
            _ => Array.Empty<TriageReachableStateOption>()
        };
    }

    private static bool TryGetTransitionTargets(
        Dictionary<string, List<string>> transitions,
        string state,
        out List<string>? targets)
    {
        if (transitions.TryGetValue(state, out targets))
            return true;

        foreach (var kvp in transitions)
        {
            if (string.Equals(kvp.Key, state, StringComparison.OrdinalIgnoreCase))
            {
                targets = kvp.Value;
                return true;
            }
        }

        targets = null;
        return false;
    }

    private static bool TryGetStateConfig(
        Dictionary<string, StateConfig> states,
        string target,
        out string canonicalName,
        out StateConfig stateConfig)
    {
        if (states.TryGetValue(target, out var exact))
        {
            canonicalName = target;
            stateConfig = exact;
            return true;
        }

        foreach (var kvp in states)
        {
            if (string.Equals(kvp.Key, target, StringComparison.OrdinalIgnoreCase))
            {
                canonicalName = kvp.Key;
                stateConfig = kvp.Value;
                return true;
            }
        }

        canonicalName = string.Empty;
        stateConfig = null!;
        return false;
    }

    private static JsonNode? SanitizeNode(JsonNode? node)
    {
        switch (node)
        {
            case JsonObject obj:
                var newObj = new JsonObject();
                foreach (var kvp in obj)
                {
                    newObj[kvp.Key] = SanitizeNode(kvp.Value);
                }
                return newObj;

            case JsonArray arr:
                var newArr = new JsonArray();
                foreach (var item in arr)
                {
                    newArr.Add(SanitizeNode(item));
                }
                return newArr;

            case JsonValue val when val.TryGetValue<string>(out var str):
                if (str.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                    return JsonValue.Create("[inline media omitted]");
                if (str.Length > MaxPropertyStringLength)
                    return JsonValue.Create(string.Concat(str.AsSpan(0, MaxPropertyStringLength), "..."));
                return JsonValue.Create(str);

            default:
                return node?.DeepClone();
        }
    }
}
