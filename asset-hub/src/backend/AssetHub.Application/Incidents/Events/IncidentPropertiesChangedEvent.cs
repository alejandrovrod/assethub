using System;
using MediatR;

namespace AssetHub.Application.Incidents.Events;

/// <summary>
/// The incident's dynamic properties changed without a state transition.
///
/// <see cref="IncidentStateChangedEvent"/> only fires when the incident moves to another state,
/// so a technician editing the form in place — a new diagnosis, a different technician — would
/// never propagate. This event closes that gap.
/// </summary>
public record IncidentPropertiesChangedEvent(Guid IncidentId) : INotification;
