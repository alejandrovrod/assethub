using System;
using System.Collections.Generic;
using AssetHub.Domain.Tasks;

namespace AssetHub.Application.Tasks.Helpers;

public static class TaskStateTransitionValidator
{
    private static readonly HashSet<(string From, string To)> AllowedTransitions = new()
    {
        (WorkTaskStates.Todo, WorkTaskStates.InProgress),
        (WorkTaskStates.Todo, WorkTaskStates.Cancelled),
        (WorkTaskStates.InProgress, WorkTaskStates.Done),
        (WorkTaskStates.InProgress, WorkTaskStates.Cancelled),
    };

    public static readonly HashSet<string> TerminalStates = WorkTaskStates.TerminalStates;

    public static bool IsValidTransition(string? fromState, string toState)
    {
        if (string.IsNullOrWhiteSpace(fromState))
        {
            return toState == WorkTaskStates.Todo;
        }

        if (TerminalStates.Contains(fromState))
        {
            return false;
        }

        return AllowedTransitions.Contains((fromState, toState));
    }

    public static string GetErrorMessage(string? fromState, string toState)
    {
        if (string.IsNullOrWhiteSpace(fromState))
        {
            return $"A new task must start in '{WorkTaskStates.Todo}' state.";
        }

        if (TerminalStates.Contains(fromState))
        {
            return $"Cannot change state from '{fromState}' because it is a terminal state.";
        }

        return $"Invalid state transition from '{fromState}' to '{toState}'.";
    }
}
