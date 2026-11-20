using System;
using System.Collections.Generic;
using MediatR;

namespace AssetHub.Application.FieldCopilot.Queries;

public sealed record AskFieldCopilotQuery(
    Guid AssetId,
    string? Question,
    string? AudioBase64 = null,
    string? AudioMimeType = null,
    IReadOnlyList<CopilotConversationTurn>? History = null,
    string? PreferredLanguage = null) : IRequest<FieldCopilotResponse>;
