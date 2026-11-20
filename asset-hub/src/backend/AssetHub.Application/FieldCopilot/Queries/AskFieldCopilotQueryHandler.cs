using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.FieldCopilot.Queries;

public sealed class AskFieldCopilotQueryHandler
    : IRequestHandler<AskFieldCopilotQuery, FieldCopilotResponse>
{
    private const int MaxAudioBytes = 6 * 1024 * 1024;
    private const int MaxHistoryTurns = 6;
    private const int MaxTurnCharacters = 1500;
    private const int MaxQuestionCharacters = 2000;

    private static readonly HashSet<string> AllowedAudioMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "audio/webm",
        "audio/mp4",
        "audio/mpeg",
        "audio/mp3",
        "audio/ogg",
        "audio/wav",
        "audio/x-m4a",
        "audio/aac"
    };

    private readonly ITenantDbContext _db;
    private readonly IAssetManualLoader _manualLoader;
    private readonly IFileSearchStoreClient _storeClient;
    private readonly IFieldCopilotAgent _copilotAgent;

    public AskFieldCopilotQueryHandler(
        ITenantDbContext db,
        IAssetManualLoader manualLoader,
        IFileSearchStoreClient storeClient,
        IFieldCopilotAgent copilotAgent)
    {
        _db = db;
        _manualLoader = manualLoader;
        _storeClient = storeClient;
        _copilotAgent = copilotAgent;
    }

    public async Task<FieldCopilotResponse> Handle(
        AskFieldCopilotQuery request,
        CancellationToken cancellationToken)
    {
        var question = NormalizeQuestion(request.Question);
        var (audioBytes, audioMimeType) = ParseAudioPayload(request.AudioBase64, request.AudioMimeType);

        if (string.IsNullOrEmpty(question) && audioBytes is null)
            throw new ArgumentException("Either a question or voice audio is required.");

        var preferredLanguage = FieldCopilotHelper.ResolvePreferredLanguage(request.PreferredLanguage);

        var (asset, manuals) = await FieldCopilotHelper.LoadAssetAndManualsAsync(
            _db,
            _manualLoader,
            request.AssetId,
            cancellationToken);

        if (manuals.Count == 0)
        {
            var noManualMessage = preferredLanguage == "en"
                ? $"No technical manuals or PDF documents are currently attached to asset {asset.Name} ({asset.Code}). Attach the manufacturer's manual first to ask technical questions."
                : $"Este activo ({asset.Name} - {asset.Code}) aún no tiene manuales técnicos o PDF adjuntos. Adjunta primero el manual del fabricante para realizar consultas.";

            return new FieldCopilotResponse(
                noManualMessage,
                FoundInManuals: false,
                Citations: Array.Empty<FieldCopilotCitation>(),
                SafetyWarnings: Array.Empty<string>(),
                IndexedManualsCount: 0,
                ModelUsed: "none",
                UsedVoiceInput: audioBytes is not null);
        }

        var templateName = await _db.AssetTemplates
            .AsNoTracking()
            .Where(t => t.Id == asset.AssetTemplateId)
            .Select(t => t.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? string.Empty;

        var syncResult = await _storeClient.SyncAssetManualsAsync(
            asset.TenantId,
            asset.Id,
            manuals,
            forceReindex: false,
            cancellationToken);

        var manualStatuses = FieldCopilotHelper.MapManualStatuses(manuals, syncResult.HashToDocumentName);
        var sanitizedHistory = SanitizeHistory(request.History);

        var agentRequest = new AskFieldCopilotRequest(
            asset.Id,
            asset.Code,
            asset.Name,
            templateName,
            syncResult.StoreName,
            question,
            audioBytes,
            audioMimeType,
            sanitizedHistory,
            preferredLanguage,
            manualStatuses);

        return await _copilotAgent.AskAsync(agentRequest, cancellationToken);
    }

    private static string NormalizeQuestion(string? rawQuestion)
    {
        if (string.IsNullOrWhiteSpace(rawQuestion))
            return string.Empty;

        var trimmed = rawQuestion.Trim();
        return trimmed.Length > MaxQuestionCharacters
            ? trimmed.Substring(0, MaxQuestionCharacters)
            : trimmed;
    }

    private static (byte[]? Bytes, string? MimeType) ParseAudioPayload(string? audioBase64, string? rawMimeType)
    {
        if (string.IsNullOrWhiteSpace(audioBase64))
            return (null, null);

        var base64 = audioBase64.Trim();
        string? embeddedMime = null;

        if (base64.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            var commaIndex = base64.IndexOf(',');
            if (commaIndex <= 5)
                throw new ArgumentException("Malformed audio data URL.");

            var header = base64.Substring(5, commaIndex - 5);
            var semiIndex = header.IndexOf(';');
            embeddedMime = semiIndex > 0 ? header.Substring(0, semiIndex) : header;
            base64 = base64.Substring(commaIndex + 1).Trim();
        }

        var candidateMime = string.IsNullOrWhiteSpace(rawMimeType) ? embeddedMime : rawMimeType;
        var baseMime = (candidateMime ?? "audio/webm").Split(';')[0].Trim().ToLowerInvariant();

        if (!AllowedAudioMimeTypes.Contains(baseMime))
            throw new ArgumentException($"Unsupported audio MIME type '{baseMime}'.");

        if ((base64.Length * 3L) / 4L > MaxAudioBytes + 3)
            throw new ArgumentException($"Voice audio exceeds maximum allowed size of {MaxAudioBytes / (1024 * 1024)} MB.");

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(base64);
        }
        catch (FormatException ex)
        {
            throw new ArgumentException("Invalid base64 audio payload.", ex);
        }

        if (bytes.Length == 0 || bytes.Length > MaxAudioBytes)
            throw new ArgumentException($"Voice audio size must be between 1 byte and {MaxAudioBytes / (1024 * 1024)} MB.");

        return (bytes, baseMime);
    }

    private static IReadOnlyList<CopilotConversationTurn> SanitizeHistory(IReadOnlyList<CopilotConversationTurn>? history)
    {
        if (history is null || history.Count == 0)
            return Array.Empty<CopilotConversationTurn>();

        return history
            .Where(t => !string.IsNullOrWhiteSpace(t.Text))
            .TakeLast(MaxHistoryTurns)
            .Select(t =>
            {
                var role = string.Equals(t.Role, "model", StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(t.Role, "assistant", StringComparison.OrdinalIgnoreCase)
                    ? "model"
                    : "user";

                var text = t.Text.Trim();
                if (text.Length > MaxTurnCharacters)
                    text = text.Substring(0, MaxTurnCharacters);

                return new CopilotConversationTurn(role, text);
            })
            .ToList();
    }
}
