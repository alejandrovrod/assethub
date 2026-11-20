using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.FieldCopilot;
using AssetHub.Application.Interfaces;
using AssetHub.Infrastructure.AssetArchitect;
using Google.GenAI;
using Google.GenAI.Types;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AssetHub.Infrastructure.FieldCopilot;

/// <summary>
/// Gemini File Search agent adapter supporting multimodal voice/text technical Q&amp;A
/// grounded strictly in an asset's uploaded manuals with page-level citations.
/// </summary>
public sealed class GeminiFieldCopilotAgent : IFieldCopilotAgent
{
    private const int MaxSnippetLength = 360;
    private static readonly Regex WhitespaceCollapseRegex = new(@"\s+", RegexOptions.Compiled);

    private readonly GeminiOptions _options;
    private readonly ILogger<GeminiFieldCopilotAgent> _logger;
    private readonly Client? _client;

    public GeminiFieldCopilotAgent(
        IOptions<GeminiOptions> options,
        ILogger<GeminiFieldCopilotAgent> logger)
    {
        _options = options.Value;
        _logger = logger;

        var apiKey = !string.IsNullOrWhiteSpace(_options.ApiKey)
            ? _options.ApiKey.Trim()
            : System.Environment.GetEnvironmentVariable("GEMINI_API_KEY")?.Trim();

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("Gemini API Key is not configured for Field Copilot.");
        }
        else
        {
            _client = new Client(
                apiKey: apiKey,
                httpOptions: new HttpOptions { ApiVersion = "v1beta" });
        }
    }

    public async Task<FieldCopilotResponse> AskAsync(
        AskFieldCopilotRequest request,
        CancellationToken cancellationToken = default)
    {
        var client = _client
            ?? throw new InvalidOperationException("Gemini API Key is not configured.");

        var config = new GenerateContentConfig
        {
            Temperature = 0.1f,
            SystemInstruction = new Content
            {
                Parts = new List<Part> { new() { Text = BuildSystemPrompt(request.PreferredLanguage) } }
            },
            Tools = new List<Tool>
            {
                new()
                {
                    FileSearch = new FileSearch
                    {
                        FileSearchStoreNames = new List<string> { request.FileSearchStoreName },
                        MetadataFilter = $"assetid=\"{request.AssetId:N}\"",
                        TopK = 8
                    }
                }
            }
        };

        var contents = BuildContents(request);

        var candidateModels = new[]
        {
            string.IsNullOrWhiteSpace(_options.Model) ? "gemini-3.1-flash-lite" : _options.Model,
            "gemini-3.1-flash-lite",
            "gemini-3.5-flash-lite",
            "gemini-3.8-flash",
            "gemini-3.6-flash"
        }.Distinct();

        GenerateContentResponse? response = null;
        string? modelUsed = null;
        Exception? lastException = null;

        foreach (var modelName in candidateModels)
        {
            try
            {
                _logger.LogInformation(
                    "Querying Gemini File Search with model {Model} for asset {AssetId} (hasAudio: {HasAudio})",
                    modelName,
                    request.AssetId,
                    request.AudioBytes is { Length: > 0 });

                response = await client.Models.GenerateContentAsync(
                    model: modelName,
                    contents: contents,
                    config: config,
                    cancellationToken: cancellationToken);

                var rawText = ExtractCandidateText(response);
                if (!string.IsNullOrWhiteSpace(rawText))
                {
                    modelUsed = modelName;
                    break;
                }
            }
            catch (Exception ex) when (IsRetryableModelError(ex))
            {
                _logger.LogWarning(ex, "Model {Model} unavailable for Field Copilot File Search. Trying next...", modelName);
                lastException = ex;
            }
        }

        var candidate = response?.Candidates?.FirstOrDefault();
        var fullText = ExtractCandidateText(response);

        if (string.IsNullOrWhiteSpace(fullText) || modelUsed is null)
        {
            throw new InvalidOperationException(
                "Gemini returned an empty response or all File Search models were unavailable.",
                lastException);
        }

        var (cleanAnswer, safetyWarnings, hasNotFoundMarker) = ParseStructuredMarkers(fullText);
        var citations = ExtractCitations(candidate?.GroundingMetadata, request.AssetManuals);

        var indexedCount = request.AssetManuals.Count(m => m.IsIndexed);
        var foundInManuals = !hasNotFoundMarker && (citations.Count > 0 || indexedCount > 0);
        if (hasNotFoundMarker)
            foundInManuals = false;

        return new FieldCopilotResponse(
            cleanAnswer,
            foundInManuals,
            citations,
            safetyWarnings,
            indexedCount,
            modelUsed,
            request.AudioBytes is { Length: > 0 });
    }

    private static List<Content> BuildContents(AskFieldCopilotRequest request)
    {
        var contents = new List<Content>();

        foreach (var turn in request.History)
        {
            contents.Add(new Content
            {
                Role = string.Equals(turn.Role, "model", StringComparison.OrdinalIgnoreCase) ? "model" : "user",
                Parts = new List<Part> { new() { Text = turn.Text } }
            });
        }

        var currentParts = new List<Part>();
        var promptSb = new StringBuilder();
        promptSb.AppendLine($"Asset Context: {request.AssetName} (Code: {request.AssetCode}, Template: {request.TemplateName})");

        if (!string.IsNullOrWhiteSpace(request.Question))
        {
            promptSb.AppendLine();
            promptSb.AppendLine($"Technician Question: {request.Question}");
        }
        else
        {
            promptSb.AppendLine();
            promptSb.AppendLine("Listen carefully to the technician's attached voice recording and answer their question using ONLY the asset's technical manuals.");
        }

        currentParts.Add(new Part { Text = promptSb.ToString().Trim() });

        if (request.AudioBytes is { Length: > 0 } && !string.IsNullOrWhiteSpace(request.AudioMimeType))
        {
            currentParts.Add(new Part
            {
                InlineData = new Blob
                {
                    Data = request.AudioBytes,
                    MimeType = request.AudioMimeType
                }
            });
        }

        contents.Add(new Content
        {
            Role = "user",
            Parts = currentParts
        });

        return contents;
    }

    private static string BuildSystemPrompt(string preferredLanguage)
    {
        var outputLang = string.Equals(preferredLanguage, "en", StringComparison.OrdinalIgnoreCase)
            ? "English"
            : "neutral professional Spanish";

        return $"""
You are AssetHub's Field Maintenance Technical Copilot.
Your ONLY job is to answer field technicians' questions strictly from the attached equipment technical manuals retrieved via the File Search tool.

### OUTPUT LANGUAGE
Write your entire answer in {outputLang}.

### STRICT EXTRACTIVE INDUSTRIAL SAFETY RULES
1. NEVER invent, guess, interpolate, or extrapolate torque specs, pressures, voltages, amperages, fluid capacities, clearances, part numbers, or LOTO steps from general memory.
2. Answer ONLY with facts explicitly present in the retrieved manual passages. If the retrieved passages describe a specific equipment model inside an attached manual for this asset, answer directly from that manual even if the asset's display name or template label in the system differs.
3. Quote exact values and units verbatim (e.g. `45 Nm`, `3200 PSI`, `24 VDC`) and reference diagram/figure numbers when mentioned in the text.
4. Keep answers direct, structured, and easy to read on a mobile screen in the field (concise bullet points or numbered steps).
5. If critical safety hazards apply to the requested procedure (Lockout/Tagout, hydraulic depressurization, electrical isolation, high temperature, PPE, tightening sequence criticality), begin with one or more separate lines starting with `[SAFETY] ` describing the exact precaution from the manual.
6. If the retrieved manual passages do NOT contain the requested specification or procedure, start your response with `[NOT_FOUND] ` followed by one short sentence stating that the requested information was not found in the asset's uploaded manuals. Do NOT provide unverified estimates.
7. If a voice recording is attached, transcribe the technical intent internally (accounting for workshop background noise) and answer directly from the manuals.
""";
    }

    private static string ExtractCandidateText(GenerateContentResponse? response)
    {
        var parts = response?.Candidates?.FirstOrDefault()?.Content?.Parts;
        if (parts is null || parts.Count == 0)
            return string.Empty;

        return string.Join(
            System.Environment.NewLine,
            parts.Where(p => !string.IsNullOrWhiteSpace(p.Text)).Select(p => p.Text!.Trim()));
    }

    private static (string CleanAnswer, IReadOnlyList<string> SafetyWarnings, bool HasNotFoundMarker) ParseStructuredMarkers(
        string rawText)
    {
        var safetyWarnings = new List<string>();
        var bodyLines = new List<string>();
        var hasNotFoundMarker = false;

        var normalized = rawText.Replace("\r\n", "\n");
        foreach (var line in normalized.Split('\n'))
        {
            var trimmed = line.Trim();

            if (trimmed.StartsWith("[NOT_FOUND]", StringComparison.OrdinalIgnoreCase))
            {
                hasNotFoundMarker = true;
                var rest = trimmed.Substring("[NOT_FOUND]".Length).Trim();
                if (!string.IsNullOrWhiteSpace(rest))
                    bodyLines.Add(rest);
                continue;
            }

            if (trimmed.StartsWith("[SAFETY]", StringComparison.OrdinalIgnoreCase))
            {
                var warning = trimmed.Substring("[SAFETY]".Length).Trim();
                if (!string.IsNullOrWhiteSpace(warning))
                    safetyWarnings.Add(warning);
                continue;
            }

            bodyLines.Add(line);
        }

        var cleanAnswer = string.Join('\n', bodyLines).Trim();
        return (cleanAnswer, safetyWarnings, hasNotFoundMarker);
    }

    private static IReadOnlyList<FieldCopilotCitation> ExtractCitations(
        GroundingMetadata? groundingMetadata,
        IReadOnlyList<AssetManualStatusDto> assetManuals)
    {
        var chunks = groundingMetadata?.GroundingChunks;
        if (chunks is null || chunks.Count == 0)
            return Array.Empty<FieldCopilotCitation>();

        var citations = new List<FieldCopilotCitation>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var chunk in chunks)
        {
            var ctx = chunk.RetrievedContext;
            if (ctx is null)
                continue;

            var metadataFileName = ctx.CustomMetadata?
                .FirstOrDefault(m => string.Equals(m.Key, "fileName", StringComparison.OrdinalIgnoreCase))
                ?.StringValue;

            var fileName = !string.IsNullOrWhiteSpace(metadataFileName)
                ? metadataFileName.Trim()
                : (!string.IsNullOrWhiteSpace(ctx.Title) ? ctx.Title.Trim() : (ctx.DocumentName ?? "Manual"));

            var matchedManual = assetManuals.FirstOrDefault(m =>
                (!string.IsNullOrWhiteSpace(ctx.DocumentName) &&
                 string.Equals(m.RemoteDocumentName, ctx.DocumentName, StringComparison.OrdinalIgnoreCase)) ||
                string.Equals(m.FileName, fileName, StringComparison.OrdinalIgnoreCase));

            var resolvedFileName = matchedManual?.FileName ?? fileName;
            var pageNumber = ctx.PageNumber.HasValue ? (int)ctx.PageNumber.Value : (int?)null;

            var rawSnippet = ctx.Text ?? string.Empty;
            var snippet = WhitespaceCollapseRegex.Replace(rawSnippet, " ").Trim();
            if (snippet.Length > MaxSnippetLength)
                snippet = snippet.Substring(0, MaxSnippetLength).TrimEnd() + "...";

            var snippetKey = snippet.Length > 80 ? snippet.Substring(0, 80) : snippet;
            var dedupeKey = $"{resolvedFileName}|{pageNumber?.ToString() ?? "-"}|{snippetKey}";
            if (!seen.Add(dedupeKey))
                continue;

            citations.Add(new FieldCopilotCitation(
                resolvedFileName,
                pageNumber,
                string.IsNullOrWhiteSpace(snippet) ? null : snippet,
                matchedManual?.DownloadUrl,
                ctx.DocumentName,
                ctx.MediaId));
        }

        return citations;
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
               msg.Contains("404", StringComparison.OrdinalIgnoreCase) ||
               msg.Contains("not supported", StringComparison.OrdinalIgnoreCase);
    }
}
