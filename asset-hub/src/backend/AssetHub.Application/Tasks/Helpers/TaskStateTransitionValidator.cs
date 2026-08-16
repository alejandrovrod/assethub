using System;
using System.Collections.Generic;

namespace AssetHub.Application.Tasks.Helpers;

public static class TaskStateTransitionValidator
{
    private static readonly HashSet<(string From, string To)> AllowedTransitions = new()
    {
        ("todo", "in_progress"),
        ("todo", "cancelled"),
        ("in_progress", "done"),
        ("in_progress", "cancelled"),
    };

    public static readonly HashSet<string> TerminalStates = new() { "done", "cancelled" };

    public static bool IsValidTransition(string? fromState, string toState)
    {
        if (string.IsNullOrWhiteSpace(fromState))
        {
            return toState == "todo";
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
            return "A new task must start in 'todo' state.";
        }

        if (TerminalStates.Contains(fromState))
        {
            return $"Cannot change state from '{fromState}' because it is a terminal state.";
        }

        return $"Invalid state transition from '{fromState}' to '{toState}'.";
    }
}
