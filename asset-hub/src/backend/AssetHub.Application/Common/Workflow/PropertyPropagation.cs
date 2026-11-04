using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Common.Workflow;

/// <summary>
/// Cascades dynamic properties down the chain Asset → Incident → MaintenanceOrder → WorkTask.
///
/// Only the fields the template marks with <c>propagateToWork: true</c> travel. Everything else
/// (attachments, internal notes, the technician's own answers) stays where it was filled in.
/// </summary>
public static class PropertyPropagation
{
    /// <summary>
    /// Keys the template declares as propagating. Returns <c>null</c> when there is no usable
    /// schema, which means "the template says nothing" and callers must copy everything so that
    /// legacy templates keep working.
    /// </summary>
    /// <remarks>
    /// A schema that exists but marks no field at all is also treated as "nothing declared":
    /// filtering to an empty set would silently wipe the properties of every existing template.
    /// </remarks>
    public static HashSet<string>? PropagatableKeys(string? templateSchemaJson)
    {
        if (string.IsNullOrWhiteSpace(templateSchemaJson))
            return null;

        try
        {
            using var doc = JsonDocument.Parse(templateSchemaJson);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
                return null;

            var keys = new HashSet<string>(StringComparer.Ordinal);

            if (root.TryGetProperty("properties", out var properties) && properties.ValueKind == JsonValueKind.Object)
            {
                CollectPropagatable(properties, keys);
            }

            if (root.TryGetProperty("dependencies", out var dependencies) && dependencies.ValueKind == JsonValueKind.Object)
            {
                foreach (var dependency in dependencies.EnumerateObject())
                {
                    if (dependency.Value.ValueKind != JsonValueKind.Object) continue;
                    if (!dependency.Value.TryGetProperty("oneOf", out var branches)) continue;
                    if (branches.ValueKind != JsonValueKind.Array) continue;

                    foreach (var branch in branches.EnumerateArray())
                    {
                        if (branch.ValueKind != JsonValueKind.Object) continue;
                        if (!branch.TryGetProperty("properties", out var branchProperties)) continue;
                        if (branchProperties.ValueKind != JsonValueKind.Object) continue;

                        CollectPropagatable(branchProperties, keys);
                    }
                }
            }

            return keys.Count > 0 ? keys : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static void CollectPropagatable(JsonElement properties, HashSet<string> keys)
    {
        foreach (var property in properties.EnumerateObject())
        {
            if (property.Value.ValueKind != JsonValueKind.Object) continue;
            if (!property.Value.TryGetProperty("propagateToWork", out var flag)) continue;
            if (flag.ValueKind == JsonValueKind.True) keys.Add(property.Name);
        }
    }

    /// <summary>
    /// Keeps only the propagating keys of <paramref name="propertiesJson"/>.
    /// When the template declares nothing, the payload is returned untouched.
    /// </summary>
    public static string FilterToPropagatable(string? propertiesJson, string? templateSchemaJson)
    {
        if (string.IsNullOrWhiteSpace(propertiesJson))
            return propertiesJson ?? "{}";

        var allowed = PropagatableKeys(templateSchemaJson);
        if (allowed == null)
            return propertiesJson;

        var source = Parse(propertiesJson);
        if (source == null)
            return propertiesJson;

        var filtered = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var kvp in source)
        {
            if (allowed.Contains(kvp.Key)) filtered[kvp.Key] = kvp.Value;
        }

        return Serialize(filtered);
    }

    /// <summary>
    /// Makes the propagated fields of <paramref name="targetJson"/> mirror
    /// <paramref name="sourceJson"/>: keys the template declares as propagating are removed and
    /// re-applied, so a value deleted upstream also disappears downstream. Fields that do not
    /// propagate — the child's own answers — are left untouched.
    /// </summary>
    /// <remarks>
    /// When the template declares nothing (legacy), this degrades to <see cref="Merge"/>: the
    /// source is overlaid and nothing is ever removed, because we cannot tell which keys were
    /// inherited and which ones the child filled in itself.
    /// </remarks>
    public static string SyncPropagatable(string? targetJson, string sourceJson, string? templateSchemaJson)
    {
        var allowed = PropagatableKeys(templateSchemaJson);
        if (allowed == null)
            return Merge(targetJson, sourceJson);

        var target = Parse(targetJson) ?? new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var key in allowed)
        {
            target.Remove(key);
        }

        var source = Parse(sourceJson);
        if (source != null)
        {
            foreach (var kvp in source)
            {
                if (allowed.Contains(kvp.Key)) target[kvp.Key] = kvp.Value;
            }
        }

        return Serialize(target);
    }

    /// <summary>
    /// Overlays <paramref name="sourceJson"/> onto <paramref name="targetJson"/>.
    /// Source keys win, target-only keys are preserved (the child keeps its own answers).
    /// </summary>
    public static string Merge(string? targetJson, string sourceJson)
    {
        var target = Parse(targetJson) ?? new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        var source = Parse(sourceJson);
        if (source == null) return Serialize(target);

        foreach (var kvp in source)
        {
            target[kvp.Key] = kvp.Value;
        }

        return Serialize(target);
    }

    /// <summary>
    /// Pushes the order's properties into its non-terminal child tasks and keeps their owner in
    /// sync with the executor declared by the properties.
    /// </summary>
    public static async Task PropagateOrderPropertiesToTasksAsync(
        ITenantDbContext db,
        Guid orderId,
        string propertiesJson,
        CancellationToken cancellationToken)
    {
        // Two simple queries instead of nested conditional subqueries: this runs inside
        // commands that already track the order, and the schema is only needed as a string.
        var templateIds = await db.MaintenanceOrders
            .Where(o => o.Id == orderId)
            .Select(o => new
            {
                OrderTemplateId = o.WorkflowTemplateId,
                IncidentTemplateId = o.Incident != null ? o.Incident.WorkflowTemplateId : null
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (templateIds == null)
            return;

        var templateId = templateIds.OrderTemplateId ?? templateIds.IncidentTemplateId;

        var schemaJson = templateId.HasValue
            ? await db.WorkflowTemplates
                .Where(w => w.Id == templateId.Value)
                .Select(w => w.SchemaJson)
                .FirstOrDefaultAsync(cancellationToken)
            : null;

        var propagating = FilterToPropagatable(propertiesJson, schemaJson);
        var orderProps = Parse(propagating);
        if (orderProps == null || orderProps.Count == 0)
            return;

        var childTasks = await db.WorkTasks
            .Where(t => t.MaintenanceOrderId == orderId)
            .Where(t => !WorkTaskStates.TerminalStates.Contains(t.State))
            .ToListAsync(cancellationToken);

        foreach (var task in childTasks)
        {
            // Same rule as the order: propagated keys mirror the parent, the task's own answers
            // survive. A value deleted upstream must not resurrect from the task's old copy.
            var merged = SyncPropagatable(task.PropertiesJson, Serialize(orderProps), schemaJson);
            task.PropertiesJson = merged;

            if (WorkflowProperties.TryGetExecutorId(merged, out var executorId))
            {
                task.AssignedEmployeeId = executorId;
            }
        }
    }

    /// <summary>Structural JSON comparison: insensitive to key order, whitespace and formatting.</summary>
    public static bool SemanticJsonEquals(string? left, string? right)
    {
        if (ReferenceEquals(left, right))
            return true;

        if (left == null || right == null)
            return false;

        try
        {
            using var leftDoc = JsonDocument.Parse(left);
            using var rightDoc = JsonDocument.Parse(right);
            return JsonElement.DeepEquals(leftDoc.RootElement, rightDoc.RootElement);
        }
        catch (JsonException)
        {
            return string.Equals(left, right, StringComparison.Ordinal);
        }
    }

    private static Dictionary<string, JsonElement>? Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return null;

            var result = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            foreach (var property in doc.RootElement.EnumerateObject())
            {
                result[property.Name] = property.Value.Clone();
            }
            return result;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string Serialize(Dictionary<string, JsonElement> values)
    {
        // Utf8JsonWriter instead of JsonSerializer.Serialize: writing JsonElement values back
        // through reflection is slower and breaks under trimming / AOT.
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            foreach (var kvp in values)
            {
                writer.WritePropertyName(kvp.Key);
                kvp.Value.WriteTo(writer);
            }
            writer.WriteEndObject();
        }

        return Encoding.UTF8.GetString(stream.ToArray());
    }
}
