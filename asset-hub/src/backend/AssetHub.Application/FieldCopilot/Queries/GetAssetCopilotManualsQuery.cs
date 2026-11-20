using System;
using MediatR;

namespace AssetHub.Application.FieldCopilot.Queries;

public sealed record GetAssetCopilotManualsQuery(Guid AssetId) : IRequest<AssetCopilotManualsResponse>;
