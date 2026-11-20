using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace AssetHub.Application.FieldCopilot;

public sealed record DiscoveredAssetManual(
    string FileName,
    string MimeType,
    string Source,
    string? DownloadUrl,
    string FileHash,
    long SizeBytes,
    Func<CancellationToken, Task<Stream>> OpenReadAsync);

public sealed record AssetManualStatusDto(
    string FileName,
    string MimeType,
    string Source,
    string? DownloadUrl,
    long SizeBytes,
    string FileHash,
    bool IsIndexed,
    string? RemoteDocumentName);

public sealed record AssetCopilotManualsResponse(
    Guid AssetId,
    string AssetCode,
    string AssetName,
    string? FileSearchStoreName,
    int TotalManualsCount,
    int IndexedManualsCount,
    IReadOnlyList<AssetManualStatusDto> Manuals);

public sealed record IndexAssetManualsResponse(
    Guid AssetId,
    string? FileSearchStoreName,
    int TotalManualsCount,
    int IndexedManualsCount,
    int NewlyIndexedCount,
    int SkippedAlreadyIndexedCount,
    int RemovedOrphanedCount,
    IReadOnlyList<string> Warnings,
    IReadOnlyList<AssetManualStatusDto> Manuals);

public sealed record CopilotConversationTurn(
    string Role,
    string Text);

public sealed record FieldCopilotCitation(
    string FileName,
    int? PageNumber,
    string? Snippet,
    string? DownloadUrl,
    string? DocumentName,
    string? MediaId);

public sealed record AskFieldCopilotRequest(
    Guid AssetId,
    string AssetCode,
    string AssetName,
    string TemplateName,
    string FileSearchStoreName,
    string Question,
    byte[]? AudioBytes,
    string? AudioMimeType,
    IReadOnlyList<CopilotConversationTurn> History,
    string PreferredLanguage,
    IReadOnlyList<AssetManualStatusDto> AssetManuals);

public sealed record FieldCopilotResponse(
    string Answer,
    bool FoundInManuals,
    IReadOnlyList<FieldCopilotCitation> Citations,
    IReadOnlyList<string> SafetyWarnings,
    int IndexedManualsCount,
    string ModelUsed,
    bool UsedVoiceInput);

public sealed record FileSearchDocumentInfo(
    string Name,
    string? DisplayName,
    string? State,
    IReadOnlyDictionary<string, string> CustomMetadata);

public sealed record FileSearchSyncResult(
    string StoreName,
    int IndexedCount,
    int NewlyIndexedCount,
    int SkippedCount,
    int RemovedOrphanedCount,
    IReadOnlyList<string> Warnings,
    IReadOnlyDictionary<string, string> HashToDocumentName);
