using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.IncidentTriage;
using AssetHub.Application.Interfaces;
using AssetHub.Infrastructure.AssetArchitect;
using Google.GenAI;
using Google.GenAI.Types;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AssetHub.Infrastructure.IncidentTriage;

/// <summary>
/// Infrastructure adapter calling Google Gemini multimodal models to analyze incident descriptions,
/// photos, asset telemetry/history, technician workload, and inventory stock.
/// </summary>
public sealed class GeminiIncidentTriageAgent : IIncidentTriageAgent
{
    private readonly GeminiOptions _options;
    private readonly ILogger<GeminiIncidentTriageAgent> _logger;
    private readonly Client _client;

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public GeminiIncidentTriageAgent(
        IOptions<GeminiOptions> options,
        ILogger<GeminiIncidentTriageAgent> logger)
    {
        _options = options.Value;
        _logger = logger;

        var apiKey = _options.ApiKey ?? System.Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("Gemini API Key is not configured in appsettings or GEMINI_API_KEY environment variable.");
        }

        _client = new Client(apiKey: apiKey);
    }

    public async Task<IncidentTriageDraft> AnalyzeAsync(
        IncidentTriageRequest request,
        CancellationToken cancellationToken = default)
    {
        var systemInstruction = BuildSystemPrompt(request);
        var userPrompt = BuildUserPrompt(request);

        var config = new GenerateContentConfig
        {
            Temperature = _options.Temperature,
            ResponseMimeType = "application/json",
            SystemInstruction = new Content
            {
                Parts = new List<Part> { new() { Text = systemInstruction } }
            }
        };

        var parts = new List<Part> { new() { Text = userPrompt } };
        foreach (var img in request.Images)
        {
            parts.Add(new Part
            {
                InlineData = new Blob
                {
                    Data = img.Bytes,
                    MimeType = img.MimeType
                }
            });
        }

        var userContent = new Content
        {
            Role = "user",
            Parts = parts
        };

        var candidateModels = new[]
        {
            string.IsNullOrWhiteSpace(_options.Model) ? "gemini-3.1-flash-lite" : _options.Model,
            "gemini-3.1-flash-lite",
            "gemini-3.5-flash-lite",
            "gemini-4-hydrogen",
            "gemini-3.8-flash"
        }.Distinct();

        string? rawJson = null;
        Exception? lastException = null;

        foreach (var modelName in candidateModels)
        {
            try
            {
                _logger.LogInformation(
                    "Attempting Gemini model {Model} for Incident Triage (IncidentId: {IncidentId}, Images: {ImageCount})",
                    modelName,
                    request.Incident.Id,
                    request.Images.Count);

                var response = await _client.Models.GenerateContentAsync(
                    model: modelName,
                    contents: userContent,
                    config: config,
                    cancellationToken: cancellationToken);

                var candidate = response?.Candidates?.FirstOrDefault();
                var contentPart = candidate?.Content?.Parts?.FirstOrDefault();
                rawJson = contentPart?.Text;

                if (!string.IsNullOrWhiteSpace(rawJson))
                {
                    _logger.LogInformation("Successfully received Incident Triage response from model {Model}", modelName);
                    break;
                }
            }
            catch (Exception ex) when (IsRetryableModelError(ex))
            {
                _logger.LogWarning(ex, "Model {Model} unavailable for Incident Triage. Trying next candidate...", modelName);
                lastException = ex;
            }
        }

        if (string.IsNullOrWhiteSpace(rawJson))
        {
            throw new InvalidOperationException(
                "Gemini returned an empty response or all candidate models were unavailable.",
                lastException);
        }

        var cleanedJson = StripMarkdownFences(rawJson);

        try
        {
            var draft = JsonSerializer.Deserialize<IncidentTriageDraft>(cleanedJson, SerializerOptions);
            if (draft is null)
            {
                throw new InvalidOperationException("Failed to deserialize Gemini output into IncidentTriageDraft.");
            }

            return draft;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse structured JSON from Gemini Incident Triage. Raw text: {RawJson}", rawJson);
            throw new InvalidOperationException("The AI triage agent generated an invalid JSON structure.", ex);
        }
    }

    private static bool IsRetryableModelError(Exception ex)
    {
        var msg = ex.Message;
        return msg.Contains("high demand", StringComparison.OrdinalIgnoreCase) ||
               msg.Contains("503", StringComparison.OrdinalIgnoreCase) ||
               msg.Contains("429", StringComparison.OrdinalIgnoreCase) ||
               msg.Contains("no longer available", StringComparison.OrdinalIgnoreCase) ||
               msg.Contains("RESOURCE_EXHAUSTED", StringComparison.OrdinalIgnoreCase) ||
               msg.Contains("not found", StringComparison.OrdinalIgnoreCase) ||
               msg.Contains("404", StringComparison.OrdinalIgnoreCase);
    }

    private static string StripMarkdownFences(string text)
    {
        var trimmed = text.Trim();
        if (!trimmed.StartsWith("```", StringComparison.Ordinal))
            return trimmed;

        var firstNewline = trimmed.IndexOf('\n');
        if (firstNewline >= 0)
            trimmed = trimmed.Substring(firstNewline + 1);

        if (trimmed.EndsWith("```", StringComparison.Ordinal))
            trimmed = trimmed.Substring(0, trimmed.Length - 3);

        return trimmed.Trim();
    }

    private static string BuildSystemPrompt(IncidentTriageRequest request)
    {
        var outputLang = string.Equals(request.PreferredLanguage, "en", StringComparison.OrdinalIgnoreCase)
            ? "English"
            : "neutral professional Spanish";

        return $$"""
You are AssetHub's Senior Maintenance & Reliability Triage Engineer.
Your mission is to analyze an industrial/facility incident report (plus attached photos, asset failure history, technician availability/skills/workload, and spare parts stock) and output a structured Human-in-the-Loop triage proposal.

### OUTPUT LANGUAGE
Write all narrative fields (`summary`, `severityRationale`, `technicianRationale`, `probableRootCauses`, `diagnosticSteps`, `safetyPrecautions`, `suggestedParts[].reason`, `visualFindings`) in {{outputLang}}.

### STRICT JSON OUTPUT CONTRACT
Return ONLY valid JSON matching this schema:
{
  "summary": "Concise executive diagnostic summary (2-4 sentences)",
  "recommendedSeverity": "Low | Medium | High | Critical",
  "severityRationale": "Evidence-based justification for severity",
  "confidenceScore": 0.85,
  "suggestedPriorityId": "exact GUID from AVAILABLE PRIORITIES or null",
  "suggestedPriorityCode": "exact Code from AVAILABLE PRIORITIES or null",
  "suggestedTechnicianId": "exact GUID from AVAILABLE TECHNICIANS or null",
  "suggestedTechnicianName": "exact FullName from AVAILABLE TECHNICIANS or null",
  "technicianRationale": "Why this technician fits best based on skills, role, today availability, and active workload",
  "suggestedTargetState": "exact state Name from REACHABLE STATES or null",
  "recommendWorkOrder": true,
  "probableRootCauses": ["Most likely failure mechanism 1", "Cause 2"],
  "diagnosticSteps": ["Step 1: verify ...", "Step 2: measure ..."],
  "safetyPrecautions": ["LOTO / isolation / PPE precaution when applicable"],
  "suggestedParts": [
    {
      "catalogItemId": "exact GUID from CANDIDATE SPARE PARTS",
      "code": "exact Code from CANDIDATE SPARE PARTS",
      "quantity": 1,
      "reason": "Why this part is likely required"
    }
  ],
  "visualFindings": "Direct observations from attached photos, or null if no photos were provided"
}

### STRICT ANTI-HALLUCINATION RULES
1. `suggestedPriorityId`: MUST be copied verbatim from AVAILABLE PRIORITIES (or null if the list is empty).
2. `suggestedTechnicianId`: MUST be copied verbatim from AVAILABLE TECHNICIANS (or null if none available). Strongly prefer technicians with relevant skills/role, `IsAvailableToday = true`, and lower `ActiveOrdersCount + ActiveTasksCount`.
3. `suggestedTargetState`: MUST be copied verbatim from REACHABLE STATES (or null if none are listed).
4. `suggestedParts`: EVERY item MUST copy `catalogItemId` and `code` verbatim from CANDIDATE SPARE PARTS. Prioritize BOM/critical parts and parts used in historical repairs that have `AvailableStock > 0`. NEVER invent catalog IDs, SKUs, stock counts, or prices. If no listed candidate parts apply, return an empty array `[]`.
5. If photos are attached, inspect them carefully for oil/coolant leaks, thermal discoloration, fractures, corrosion, loose fasteners, error codes/warning lights, or safety hazards, and report them in `visualFindings`.
6. Include practical industrial safety precautions (e.g., Lockout-Tagout, PPE, depressurization, electrical isolation) whenever physical intervention is implied.
""";
    }

    private static string BuildUserPrompt(IncidentTriageRequest request)
    {
        var sb = new StringBuilder();

        sb.AppendLine("### CURRENT INCIDENT");
        sb.AppendLine($"IncidentId: {request.Incident.Id}");
        sb.AppendLine($"Title: {request.Incident.Title}");
        sb.AppendLine($"State: {request.Incident.State}");
        sb.AppendLine($"ReportedAt (UTC): {request.Incident.ReportedAt:O}");
        sb.AppendLine($"Description: {request.Incident.Description ?? "(none)"}");
        sb.AppendLine($"PropertiesJson: {request.Incident.SanitizedPropertiesJson}");
        if (!string.IsNullOrWhiteSpace(request.Incident.AdditionalSupervisorNotes))
        {
            sb.AppendLine($"Supervisor Additional Notes: {request.Incident.AdditionalSupervisorNotes}");
        }
        sb.AppendLine($"Attached Photos Count: {request.Images.Count}");
        sb.AppendLine();

        sb.AppendLine("### AFFECTED ASSET");
        sb.AppendLine($"AssetId: {request.Asset.Id} | Code: {request.Asset.Code} | Name: {request.Asset.Name}");
        sb.AppendLine($"Current State: {request.Asset.State} | Template: {request.Asset.TemplateName}");
        if (request.Asset.ConditionIndex.HasValue)
            sb.AppendLine($"ConditionIndex: {request.Asset.ConditionIndex.Value}/100");
        if (!string.IsNullOrWhiteSpace(request.Asset.HealthRiskLevel))
            sb.AppendLine($"Predictive Health Risk: {request.Asset.HealthRiskLevel} (Probability: {request.Asset.HealthRiskProbability})");
        sb.AppendLine($"Asset PropertiesJson: {request.Asset.SanitizedPropertiesJson}");
        if (!string.IsNullOrWhiteSpace(request.Asset.MaintenanceChecklist))
            sb.AppendLine($"Template Maintenance Checklist: {request.Asset.MaintenanceChecklist}");
        sb.AppendLine();

        sb.AppendLine("### HISTORICAL INCIDENTS ON THIS ASSET");
        if (request.RecentIncidents.Count == 0)
        {
            sb.AppendLine("(none)");
        }
        else
        {
            foreach (var hi in request.RecentIncidents)
            {
                sb.AppendLine($"- [{hi.ReportedAt:yyyy-MM-dd}] {hi.Title} (State: {hi.State}) — {hi.Description ?? "no description"}");
            }
        }
        sb.AppendLine();

        sb.AppendLine("### RECENT CORRECTIVE WORK ORDERS ON THIS ASSET");
        if (request.RecentCorrectiveOrders.Count == 0)
        {
            sb.AppendLine("(none)");
        }
        else
        {
            foreach (var ho in request.RecentCorrectiveOrders)
            {
                var partsStr = ho.UsedPartLabels.Count > 0 ? string.Join(", ", ho.UsedPartLabels) : "none recorded";
                sb.AppendLine($"- [{ho.CreatedAt:yyyy-MM-dd}] {ho.Title} (State: {ho.State}, Parts used: {partsStr})");
            }
        }
        sb.AppendLine();

        sb.AppendLine("### AVAILABLE PRIORITIES (copy exact GUID)");
        if (request.Priorities.Count == 0)
        {
            sb.AppendLine("(none)");
        }
        else
        {
            foreach (var p in request.Priorities)
            {
                sb.AppendLine($"- Id: {p.Id} | Code: {p.Code} | Label: {p.Label}");
            }
        }
        sb.AppendLine();

        sb.AppendLine("### AVAILABLE TECHNICIANS (copy exact GUID)");
        if (request.Technicians.Count == 0)
        {
            sb.AppendLine("(none)");
        }
        else
        {
            foreach (var tech in request.Technicians)
            {
                var skills = tech.Skills.Count > 0 ? string.Join(", ", tech.Skills) : "none";
                var teams = tech.Teams.Count > 0 ? string.Join(", ", tech.Teams) : "none";
                sb.AppendLine(
                    $"- Id: {tech.Id} | Name: {tech.FullName} | Role: {tech.RoleLabel} | AvailableToday: {tech.IsAvailableToday} | ActiveOrders: {tech.ActiveOrdersCount} | ActiveTasks: {tech.ActiveTasksCount} | Skills: [{skills}] | Teams: [{teams}]");
            }
        }
        sb.AppendLine();

        sb.AppendLine("### REACHABLE STATES FROM CURRENT STATE (copy exact Name)");
        if (request.ReachableStates.Count == 0)
        {
            sb.AppendLine("(none)");
        }
        else
        {
            foreach (var st in request.ReachableStates)
            {
                sb.AppendLine($"- Name: {st.Name} | TriggersWorkOrder: {st.TriggersWorkOrder}");
            }
        }
        sb.AppendLine();

        sb.AppendLine("### CANDIDATE SPARE PARTS (copy exact CatalogItemId GUID & Code)");
        if (request.CandidateParts.Count == 0)
        {
            sb.AppendLine("(none)");
        }
        else
        {
            foreach (var part in request.CandidateParts)
            {
                sb.AppendLine(
                    $"- CatalogItemId: {part.CatalogItemId} | Code: {part.Code} | Label: {part.Label} | IsBomPart: {part.IsBomPart} | IsCritical: {part.IsCritical} | AvailableStock: {part.AvailableStock} | Warehouse: {part.WarehouseName ?? "N/A"}");
            }
        }

        return sb.ToString();
    }
}
