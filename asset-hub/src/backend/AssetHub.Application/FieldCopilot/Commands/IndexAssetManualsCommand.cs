using System;
using MediatR;

namespace AssetHub.Application.FieldCopilot.Commands;

public sealed record IndexAssetManualsCommand(Guid AssetId, bool ForceReindex = false) : IRequest<IndexAssetManualsResponse>;
