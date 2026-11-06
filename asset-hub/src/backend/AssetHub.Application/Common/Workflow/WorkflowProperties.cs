using System;
using System.Text.Json;

namespace AssetHub.Application.Common.Workflow;

/// <summary>
/// Resolves the recipient of a work item from its dynamic template properties.
///
/// Dynamic properties are the source of truth for assignments configured through form templates.
/// </summary>
public static class WorkflowProperties
{
    /// <summary>
    /// Property keys that declare who EXECUTES the work (the assignee).
    /// Matches ASSIGNEE_PROPERTY_KEYS in core-offline/src/repositories/assignment.ts.
    /// </summary>
    public static readonly string[] ExecutorKeys = { "asignar_a", "asignado_a" };

    /// <summary>
    /// Property keys that declare who follows up on the work (supervisor / follower).
    /// Matches FOLLOW_UP_PROPERTY_KEYS in core-offline/src/repositories/assignment.ts.
    /// </summary>
    public static readonly string[] FollowUpKeys = { "reportar_a", "reportado_a", "recibe_a" };

    /// <summary>
    /// Legacy fallback list used exclusively for notification recipients when no executor is assigned.
    /// </summary>
    public static readonly string[] AssigneeKeys = { "asignar_a", "asignado_a", "reportar_a", "recibe_a" };

    /// <summary>
    /// Resolves the executor (AssignedEmployeeId) strictly from executor keys ("asignar_a", "asignado_a").
    /// Follow-up keys like "reportar_a" are never treated as executors.
    /// </summary>
    public static bool TryGetExecutorId(string? propertiesJson, out Guid employeeId)
    {
        employeeId = Guid.Empty;
        if (string.IsNullOrWhiteSpace(propertiesJson)) return false;

        try
        {
            using var doc = JsonDocument.Parse(propertiesJson);
            return TryGetExecutorId(doc.RootElement, out employeeId);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>
    /// Resolves the executor (AssignedEmployeeId) strictly from executor keys ("asignar_a", "asignado_a").
    /// </summary>
    public static bool TryGetExecutorId(JsonElement properties, out Guid employeeId)
    {
        employeeId = Guid.Empty;
        if (properties.ValueKind != JsonValueKind.Object) return false;

        foreach (var key in ExecutorKeys)
        {
            if (!properties.TryGetProperty(key, out var value)) continue;
            if (value.ValueKind != JsonValueKind.String) continue;
            if (!Guid.TryParse(value.GetString(), out var parsed)) continue;

            employeeId = parsed;
            return true;
        }

        return false;
    }

    /// <summary>
    /// Whether <paramref name="employeeId"/> is declared as the executor by any executor key.
    ///
    /// Unlike <see cref="TryGetExecutorId(string?, out Guid)"/> this checks every executor key
    /// and accepts arrays of ids, mirroring <c>matchesActorInProperties</c> in
    /// core-offline/src/repositories/assignment.ts. Templates that allow several assignees
    /// store them as an array, and a single-assignee read would hide that work from everyone.
    /// </summary>
    public static bool MatchesExecutor(string? propertiesJson, Guid employeeId)
    {
        if (string.IsNullOrWhiteSpace(propertiesJson)) return false;

        try
        {
            using var doc = JsonDocument.Parse(propertiesJson);
            return MatchesExecutor(doc.RootElement, employeeId);
        }
        catch (JsonException)
        {
            // Tenant data contains malformed JSON; a bad row is simply not assigned.
            return false;
        }
    }

    /// <summary>
    /// Whether <paramref name="employeeId"/> is declared as the executor by any executor key.
    /// </summary>
    public static bool MatchesExecutor(JsonElement properties, Guid employeeId)
    {
        if (properties.ValueKind != JsonValueKind.Object) return false;

        foreach (var key in ExecutorKeys)
        {
            if (!properties.TryGetProperty(key, out var value)) continue;
            if (ContainsEmployeeId(value, employeeId)) return true;
        }

        return false;
    }

    private static bool ContainsEmployeeId(JsonElement value, Guid employeeId)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.String:
                return Guid.TryParse(value.GetString(), out var single) && single == employeeId;

            case JsonValueKind.Array:
                foreach (var item in value.EnumerateArray())
                {
                    if (item.ValueKind != JsonValueKind.String) continue;
                    if (Guid.TryParse(item.GetString(), out var many) && many == employeeId) return true;
                }
                return false;

            default:
                return false;
        }
    }

    /// <summary>
    /// Reads the assignee id declared by the first assignee key present in the properties.
    /// Returns false when no key exists or its value is not a valid GUID.
    /// </summary>
    public static bool TryGetAssigneeId(JsonElement properties, out Guid assigneeId)
    {
        assigneeId = Guid.Empty;
        if (properties.ValueKind != JsonValueKind.Object) return false;

        foreach (var key in AssigneeKeys)
        {
            if (!properties.TryGetProperty(key, out var value)) continue;
            if (value.ValueKind != JsonValueKind.String) continue;
            if (!Guid.TryParse(value.GetString(), out var parsed)) continue;

            assigneeId = parsed;
            return true;
        }

        return false;
    }
}
