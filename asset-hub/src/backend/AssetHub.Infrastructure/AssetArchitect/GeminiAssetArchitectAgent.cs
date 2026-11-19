using System.Text.Json;
using AssetHub.Application.AssetArchitect;
using AssetHub.Application.Interfaces;
using Google.GenAI;
using Google.GenAI.Types;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AssetHub.Infrastructure.AssetArchitect;

/// <summary>
/// Infrastructure adapter that calls the official Google Gemini API to design asset templates.
/// </summary>
public sealed class GeminiAssetArchitectAgent : IAssetArchitectAgent
{
    private readonly GeminiOptions _options;
    private readonly ILogger<GeminiAssetArchitectAgent> _logger;
    private readonly Client _client;

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public GeminiAssetArchitectAgent(
        IOptions<GeminiOptions> options,
        ILogger<GeminiAssetArchitectAgent> logger)
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

    public async Task<AssetArchitectDraft> GenerateDraftAsync(AssetArchitectRequest request, CancellationToken cancellationToken = default)
    {
        var systemInstruction = BuildSystemPrompt(request);

        var config = new GenerateContentConfig
        {
            Temperature = _options.Temperature,
            ResponseMimeType = "application/json",
            SystemInstruction = new Content
            {
                Parts = new List<Part> { new() { Text = systemInstruction } }
            }
        };

        var prompt = $"Create an asset template architecture proposal for the following business requirements:\n\n{request.Description}";

        var candidateModels = new[]
        {
            string.IsNullOrWhiteSpace(_options.Model) ? "gemini-3.1-flash-lite" : _options.Model,
            "gemini-3.1-flash-lite",
            "gemini-3.8-flash",
            "gemini-3.7-flash"
        }.Distinct();

        string? rawJson = null;
        Exception? lastException = null;

        foreach (var modelName in candidateModels)
        {
            try
            {
                _logger.LogInformation("Attempting Gemini model {Model} for Asset Architect request", modelName);

                var response = await _client.Models.GenerateContentAsync(
                    model: modelName,
                    contents: prompt,
                    config: config,
                    cancellationToken: cancellationToken);

                var candidate = response?.Candidates?.FirstOrDefault();
                var contentPart = candidate?.Content?.Parts?.FirstOrDefault();
                rawJson = contentPart?.Text;

                if (!string.IsNullOrWhiteSpace(rawJson))
                {
                    _logger.LogInformation("Successfully received response from model {Model}", modelName);
                    break;
                }
            }
            catch (Exception ex) when (ex.Message.Contains("high demand", StringComparison.OrdinalIgnoreCase) ||
                                       ex.Message.Contains("503", StringComparison.OrdinalIgnoreCase) ||
                                       ex.Message.Contains("429", StringComparison.OrdinalIgnoreCase) ||
                                       ex.Message.Contains("no longer available", StringComparison.OrdinalIgnoreCase) ||
                                       ex.Message.Contains("RESOURCE_EXHAUSTED", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning(ex, "Model {Model} unavailable due to demand/quota. Retrying next candidate...", modelName);
                lastException = ex;
            }
        }

        if (string.IsNullOrWhiteSpace(rawJson))
        {
            throw new InvalidOperationException("Gemini returned an empty response or all candidate models were unavailable due to high demand.", lastException);
        }

        try
        {
            var draft = JsonSerializer.Deserialize<AssetArchitectDraft>(rawJson, SerializerOptions);
            if (draft is null)
            {
                throw new InvalidOperationException("Failed to deserialize Gemini output into AssetArchitectDraft.");
            }

            return draft;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to parse structured JSON from Gemini. Raw text: {RawJson}", rawJson);
            throw new InvalidOperationException("The AI architect generated an invalid JSON structure.", ex);
        }
    }

    private static string BuildSystemPrompt(AssetArchitectRequest request)
    {
        var allowedCatalogs = request.ExistingCatalogCodes is { Count: > 0 }
            ? string.Join(", ", request.ExistingCatalogCodes)
            : "none";

        return $$"""
You are the Senior Asset Architect AI of AssetHub.
Your mission is to analyze natural language business descriptions and generate a coherent, production-ready asset template architecture.

### OUTPUT SPECIFICATION
You MUST return valid JSON adhering strictly to this data contract:
{
  "templates": [
    {
      "code": "UNIQUE_CODE (e.g. ELECTRIC_VAN, SOLAR_INVERTER)",
      "name": "Human-readable template name (e.g. Electric Delivery Van)",
      "description": "Functional description of this asset type",
      "initialState": "OPERATIONAL", // Must match the Name of one state in states array
      "childTemplateCodes": [], // Codes of other templates in this list that can be child components
      "fields": [
        {
          "keyName": "snake_case_or_camelCase (e.g. battery_capacity_kwh)",
          "title": "Readable Label (e.g. Battery Capacity (kWh))",
          "type": "string | number | boolean | date | enum | catalog | employee | team | file | files",
          "required": true,
          "enumOptions": ["Option A", "Option B"], // Required only when type is 'enum'
          "catalogCode": "code_from_allowed_catalogs" // Required only when type is 'catalog'
        }
      ],
      "states": [
        {
          "name": "OPERATIONAL",
          "color": "#10b981", // Hex color (e.g. #10b981, #f59e0b, #ef4444, #94a3b8)
          "isTerminal": false,
          "maxHoursInState": 720,
          "transitions": ["MAINTENANCE", "RETIRED"], // Target state Names reachable from here
          "onEnterAction": "", // Optional: "CREATE_WORK_ORDER", "NOTIFY_MANAGER", or empty ""
          "notificationTargetFieldId": "", // Optional: keyName of an employee/team field to notify
          "associatedModule": "", // Optional: "work_orders", "incidents", or empty ""
          "requiresFields": [], // Optional: list of field keyNames required to transition to this state
          "allowedRoles": [], // Optional: e.g. ["Admin", "MaintenanceTechnician"]
          "childStateDependencies": [] // Optional: child propagation rules
        },
        {
          "name": "MAINTENANCE",
          "color": "#f59e0b",
          "isTerminal": false,
          "maxHoursInState": 48,
          "transitions": ["OPERATIONAL"],
          "onEnterAction": "CREATE_WORK_ORDER",
          "notificationTargetFieldId": "asignar_a",
          "associatedModule": "work_orders",
          "requiresFields": ["odometer_km"],
          "allowedRoles": ["MaintenanceTechnician", "Admin"],
          "childStateDependencies": [
            {
              "conditionType": "Any", // "Any" or "All"
              "childStates": ["FAULTY", "NEEDS_SERVICE"],
              "targetState": "MAINTENANCE"
            }
          ]
        },
        {
          "name": "RETIRED",
          "color": "#64748b",
          "isTerminal": true,
          "maxHoursInState": null,
          "transitions": [],
          "onEnterAction": "",
          "notificationTargetFieldId": "",
          "associatedModule": "",
          "requiresFields": [],
          "allowedRoles": ["Admin"],
          "childStateDependencies": []
        }
      ],
      "maintenanceTasks": [
        {
          "title": "Battery and coolant inspection",
          "description": "Check coolant levels and battery pack thermal degradation.",
          "frequency": "Monthly"
        }
      ]
    }
  ]
}

### CRITICAL DOMAIN RULES:
1. Field types MUST ONLY be one of:
   - string, number, boolean, date, enum, catalog, employee, team, file, files
2. If field type is 'catalog', 'catalogCode' MUST match one of the following available tenant catalogs:
   [{{allowedCatalogs}}]
   If no catalogs are available or none fit, DO NOT use type 'catalog'; use 'enum' or 'string' instead.
3. CANONICAL ASSIGNMENT & REPORTING KEYS (MANDATORY):
   - Whenever an asset needs an assigned operator, technician, or executor, its 'keyName' MUST BE EXACTLY "asignar_a" (type: 'employee').
   - Whenever an asset needs a supervisor, follower, or person to report to, its 'keyName' MUST BE EXACTLY "reportar_a" (type: 'employee').
   - Do NOT use variations like 'assigned_to', 'supervisor_id', or 'assigned_technician'. Use ONLY "asignar_a" and "reportar_a".
4. If field type is 'enum', 'enumOptions' MUST contain at least 2 distinct options.
5. Each template MUST define a complete lifecycle:
   - 'initialState' must exactly match the 'name' of one state in the 'states' list.
   - All other states must be reachable from the initial state via 'transitions'.
   - Terminal states must have 'isTerminal': true and empty 'transitions': [].
6. 'childTemplateCodes' can only reference 'code' values of other templates defined in this same draft. No self-reference, no cycles.
7. LIFECYCLE AUTOMATION & PROPAGATION RULES:
   - 'onEnterAction': Choose 'CREATE_WORK_ORDER' (when entering a repair, service, or maintenance state), 'NOTIFY_MANAGER' (for critical, alert, or quarantine states), or empty string "" if none.
   - 'associatedModule': Use 'work_orders' when the state involves repair/service, 'incidents' for damaged/quarantine states, or empty string "" if none.
   - 'notificationTargetFieldId': Set to "reportar_a" (for NOTIFY_MANAGER or supervisor alerts) or "asignar_a" (for task execution or technician notices).
   - 'requiresFields': Array of 'keyName' from 'fields' that must be completed before an operator can transition an asset into this state (e.g. ['odometer_km'] before maintenance, ['accident_report'] before repair).
   - 'childStateDependencies': If this template has children ('childTemplateCodes'), define propagation rules. For example, if any child goes into 'FAULTY', this parent transitions to 'MAINTENANCE'. Use 'conditionType': 'Any' or 'All'.
8. Provide high-quality technical fields, realistic maintenance checklists, and clear lifecycle states matching the user's business equipment.
""";
    }
}
