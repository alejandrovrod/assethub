using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace AssetHub.Application.AssetArchitect;

public sealed record DraftIssue(string Path, string Message);

/// <summary>
/// Pure, side-effect-free validation of an agent-generated draft. It never trusts the model:
/// every rule here protects <c>CreateAssetTemplateCommand</c> or the lifecycle engine from bad input.
/// </summary>
public static class AssetArchitectDraftValidator
{
    public const int MaxTemplates = 25;

    private static readonly Regex KeyNameRegex = new("^[a-zA-Z][a-zA-Z0-9_]*$", RegexOptions.Compiled);
    private static readonly Regex ColorRegex = new("^#[0-9a-fA-F]{6}$", RegexOptions.Compiled);

    public static IReadOnlyList<DraftIssue> Validate(
        AssetArchitectDraft? draft,
        IReadOnlyCollection<string> existingCatalogCodes)
    {
        var issues = new List<DraftIssue>();

        if (draft?.Templates is null || draft.Templates.Count == 0)
        {
            issues.Add(new DraftIssue("templates", "The draft must contain at least one template."));
            return issues;
        }

        if (draft.Templates.Count > MaxTemplates)
        {
            issues.Add(new DraftIssue("templates", $"The draft cannot contain more than {MaxTemplates} templates."));
        }

        var catalogs = new HashSet<string>(existingCatalogCodes ?? Array.Empty<string>(), StringComparer.Ordinal);
        var templateCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < draft.Templates.Count; i++)
        {
            var template = draft.Templates[i];
            var path = $"templates[{i}]";

            if (string.IsNullOrWhiteSpace(template.Code) || template.Code.Any(char.IsWhiteSpace) || template.Code.Length > 50)
            {
                issues.Add(new DraftIssue($"{path}.code", "Code is required, must not contain spaces and must be at most 50 characters."));
            }
            else if (!templateCodes.Add(template.Code))
            {
                issues.Add(new DraftIssue($"{path}.code", $"Duplicate template code '{template.Code}'."));
            }

            if (string.IsNullOrWhiteSpace(template.Name))
            {
                issues.Add(new DraftIssue($"{path}.name", "Name is required."));
            }

            ValidateFields(template, path, catalogs, issues);
            ValidateLifecycle(template, path, issues);
            ValidateChecklist(template, path, issues);
        }

        ValidateHierarchy(draft, issues);
        return issues;
    }

    private static void ValidateFields(TemplateDraft template, string path, HashSet<string> catalogs, List<DraftIssue> issues)
    {
        if (template.Fields.Count == 0)
        {
            issues.Add(new DraftIssue($"{path}.fields", "A template needs at least one field."));
            return;
        }

        var keys = new HashSet<string>(StringComparer.Ordinal);
        for (var f = 0; f < template.Fields.Count; f++)
        {
            var field = template.Fields[f];
            var fp = $"{path}.fields[{f}]";

            if (string.IsNullOrWhiteSpace(field.KeyName) || !KeyNameRegex.IsMatch(field.KeyName))
            {
                issues.Add(new DraftIssue($"{fp}.keyName", "keyName must start with a letter and contain only letters, digits or underscores."));
            }
            else if (!keys.Add(field.KeyName))
            {
                issues.Add(new DraftIssue($"{fp}.keyName", $"Duplicate field key '{field.KeyName}'."));
            }

            if (string.IsNullOrWhiteSpace(field.Title))
            {
                issues.Add(new DraftIssue($"{fp}.title", "Title is required."));
            }

            if (!AssetArchitectFieldTypes.Allowed.Contains(field.Type ?? string.Empty))
            {
                issues.Add(new DraftIssue($"{fp}.type", $"Unsupported field type '{field.Type}'."));
                continue;
            }

            switch (field.Type)
            {
                case "enum" when !field.EnumOptions.Any(o => !string.IsNullOrWhiteSpace(o)):
                    issues.Add(new DraftIssue($"{fp}.enumOptions", "An enum field needs at least one option."));
                    break;

                case "catalog":
                    if (string.IsNullOrWhiteSpace(field.CatalogCode))
                    {
                        issues.Add(new DraftIssue($"{fp}.catalogCode", "A catalog field needs a catalogCode."));
                    }
                    else if (!catalogs.Contains(field.CatalogCode))
                    {
                        issues.Add(new DraftIssue($"{fp}.catalogCode", $"Catalog '{field.CatalogCode}' does not exist for this tenant."));
                    }
                    break;
            }

            if (field.Type != "catalog" && !string.IsNullOrWhiteSpace(field.CatalogCode))
            {
                issues.Add(new DraftIssue($"{fp}.catalogCode", "catalogCode is only valid on catalog fields."));
            }
        }
    }

    private static void ValidateLifecycle(TemplateDraft template, string path, List<DraftIssue> issues)
    {
        if (template.States.Count == 0)
        {
            issues.Add(new DraftIssue($"{path}.states", "A template needs at least one lifecycle state."));
            return;
        }

        var names = new HashSet<string>(StringComparer.Ordinal);
        for (var s = 0; s < template.States.Count; s++)
        {
            var state = template.States[s];
            var sp = $"{path}.states[{s}]";

            if (string.IsNullOrWhiteSpace(state.Name))
            {
                issues.Add(new DraftIssue($"{sp}.name", "State name is required."));
            }
            else if (!names.Add(state.Name))
            {
                issues.Add(new DraftIssue($"{sp}.name", $"Duplicate state '{state.Name}'."));
            }

            if (!string.IsNullOrWhiteSpace(state.Color) && !ColorRegex.IsMatch(state.Color))
            {
                issues.Add(new DraftIssue($"{sp}.color", "Color must be a hex value like #10b981."));
            }

            if (state.MaxHoursInState is <= 0)
            {
                issues.Add(new DraftIssue($"{sp}.maxHoursInState", "maxHoursInState must be greater than zero."));
            }

            if (state.ChildStateDependencies is { Count: > 0 })
            {
                for (var cd = 0; cd < state.ChildStateDependencies.Count; cd++)
                {
                    var dep = state.ChildStateDependencies[cd];
                    var cdp = $"{sp}.childStateDependencies[{cd}]";

                    if (!string.Equals(dep.ConditionType, "Any", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(dep.ConditionType, "All", StringComparison.OrdinalIgnoreCase))
                    {
                        issues.Add(new DraftIssue($"{cdp}.conditionType", "ConditionType must be 'Any' or 'All'."));
                    }

                    if (dep.ChildStates is null || dep.ChildStates.Count == 0)
                    {
                        issues.Add(new DraftIssue($"{cdp}.childStates", "At least one child state must be specified."));
                    }
                }
            }
        }

        if (!names.Contains(template.InitialState ?? string.Empty))
        {
            issues.Add(new DraftIssue($"{path}.initialState", $"Initial state '{template.InitialState}' is not one of the states."));
            return;
        }

        foreach (var state in template.States.Where(s => !string.IsNullOrWhiteSpace(s.Name)))
        {
            foreach (var target in state.Transitions)
            {
                if (!names.Contains(target))
                {
                    issues.Add(new DraftIssue($"{path}.states[{state.Name}].transitions", $"Transition to unknown state '{target}'."));
                }
                else if (string.Equals(target, state.Name, StringComparison.Ordinal))
                {
                    issues.Add(new DraftIssue($"{path}.states[{state.Name}].transitions", "A state cannot transition to itself."));
                }
            }
        }

        if (!template.States.Any(s => s.IsTerminal))
        {
            issues.Add(new DraftIssue($"{path}.states", "The lifecycle needs at least one terminal state."));
        }

        var reachable = new HashSet<string>(StringComparer.Ordinal) { template.InitialState };
        var queue = new Queue<string>();
        queue.Enqueue(template.InitialState);
        var byName = template.States
            .Where(s => !string.IsNullOrWhiteSpace(s.Name))
            .GroupBy(s => s.Name, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.Ordinal);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (!byName.TryGetValue(current, out var state)) continue;
            foreach (var target in state.Transitions.Where(names.Contains))
            {
                if (reachable.Add(target)) queue.Enqueue(target);
            }
        }

        foreach (var name in names.Where(n => !reachable.Contains(n)))
        {
            issues.Add(new DraftIssue($"{path}.states[{name}]", $"State '{name}' is unreachable from the initial state."));
        }
    }

    private static void ValidateChecklist(TemplateDraft template, string path, List<DraftIssue> issues)
    {
        for (var t = 0; t < template.MaintenanceTasks.Count; t++)
        {
            if (string.IsNullOrWhiteSpace(template.MaintenanceTasks[t].Title))
            {
                issues.Add(new DraftIssue($"{path}.maintenanceTasks[{t}].title", "Task title is required."));
            }
        }
    }

    private static void ValidateHierarchy(AssetArchitectDraft draft, List<DraftIssue> issues)
    {
        var graph = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var template in draft.Templates.Where(t => !string.IsNullOrWhiteSpace(t.Code)))
        {
            graph.TryAdd(template.Code, new List<string>());
        }

        for (var i = 0; i < draft.Templates.Count; i++)
        {
            var template = draft.Templates[i];
            if (string.IsNullOrWhiteSpace(template.Code)) continue;

            foreach (var child in template.ChildTemplateCodes)
            {
                if (string.Equals(child, template.Code, StringComparison.OrdinalIgnoreCase))
                {
                    issues.Add(new DraftIssue($"templates[{i}].childTemplateCodes", "A template cannot be its own child."));
                }
                else if (!graph.ContainsKey(child))
                {
                    issues.Add(new DraftIssue($"templates[{i}].childTemplateCodes", $"Unknown child template '{child}'."));
                }
                else
                {
                    graph[template.Code].Add(child);
                }
            }
        }

        // 0 = unvisited, 1 = in stack, 2 = done
        var state = graph.Keys.ToDictionary(k => k, _ => 0, StringComparer.OrdinalIgnoreCase);
        var cycleReported = false;

        void Visit(string node)
        {
            if (cycleReported) return;
            state[node] = 1;
            foreach (var child in graph[node])
            {
                if (state[child] == 1)
                {
                    cycleReported = true;
                    issues.Add(new DraftIssue("templates", $"Circular parent/child hierarchy detected between '{node}' and '{child}'."));
                    return;
                }
                if (state[child] == 0) Visit(child);
            }
            state[node] = 2;
        }

        foreach (var node in graph.Keys.ToList())
        {
            if (state[node] == 0) Visit(node);
        }
    }
}
