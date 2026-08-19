using System;
using System.Collections.Generic;
using AssetHub.Domain.Maintenance;

namespace AssetHub.Application.Maintenance.Helpers;

public static class MaintenanceOrderStateTransitionValidator
{
    private static readonly HashSet<(string From, string To)> AllowedTransitions = new()
    {
        (MaintenanceOrderStates.Draft, MaintenanceOrderStates.Approved),
        (MaintenanceOrderStates.Draft, MaintenanceOrderStates.Scheduled),
        (MaintenanceOrderStates.Draft, MaintenanceOrderStates.Cancelled),
        (MaintenanceOrderStates.Approved, MaintenanceOrderStates.Scheduled),
        (MaintenanceOrderStates.Approved, MaintenanceOrderStates.Cancelled),
        (MaintenanceOrderStates.Scheduled, MaintenanceOrderStates.InProgress),
        (MaintenanceOrderStates.Scheduled, MaintenanceOrderStates.Cancelled),
        (MaintenanceOrderStates.InProgress, MaintenanceOrderStates.Done),
        (MaintenanceOrderStates.InProgress, MaintenanceOrderStates.Cancelled),
        (MaintenanceOrderStates.Done, MaintenanceOrderStates.Verified)
    };

    public static bool IsValidTransition(string? fromState, string toState)
    {
        if (string.IsNullOrWhiteSpace(fromState))
        {
            return toState == MaintenanceOrderStates.Draft;
        }

        if (MaintenanceOrderStates.TerminalStates.Contains(fromState))
        {
            return false;
        }

        return AllowedTransitions.Contains((fromState, toState));
    }

    public static string GetErrorMessage(string? fromState, string toState)
    {
        if (string.IsNullOrWhiteSpace(fromState))
        {
            return $"A new maintenance order must start in '{MaintenanceOrderStates.Draft}' state.";
        }

        if (MaintenanceOrderStates.TerminalStates.Contains(fromState))
        {
            return $"Cannot change state from '{fromState}' because it is a terminal state.";
        }

        return $"Invalid state transition from '{fromState}' to '{toState}'.";
    }
}
