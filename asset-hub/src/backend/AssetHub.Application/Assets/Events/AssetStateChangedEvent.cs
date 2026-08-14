using System;
using System.Collections.Generic;
using MediatR;

namespace AssetHub.Application.Assets.Events;

public record AssetStateChangedEvent(
    Guid AssetId,
    string FromState,
    string ToState,
    string TemplateName,
    Dictionary<string, string>? TransitionData = null
) : INotification;
