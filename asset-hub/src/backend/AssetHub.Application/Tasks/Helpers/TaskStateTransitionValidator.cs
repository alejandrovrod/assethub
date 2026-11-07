using System;
using System.Collections.Generic;
using System.Linq;
using AssetHub.Domain.Tasks;

namespace AssetHub.Application.Tasks.Helpers;

public static class TaskStateTransitionValidator
{
    private static readonly HashSet<(string From, string To)> AllowedTransitions = new()
    {
        (WorkTaskStates.Todo, WorkTaskStates.InProgress),
        (WorkTaskStates.Todo, WorkTaskStates.Cancelled),
        (WorkTaskStates.Rework, WorkTaskStates.InProgress),
        (WorkTaskStates.Rework, WorkTaskStates.Done),
        (WorkTaskStates.Rework, WorkTaskStates.Cancelled),
        (WorkTaskStates.InProgress, WorkTaskStates.Paused),
        (WorkTaskStates.InProgress, WorkTaskStates.Done),
        (WorkTaskStates.InProgress, WorkTaskStates.Cancelled),
        (WorkTaskStates.Paused, WorkTaskStates.InProgress),
        (WorkTaskStates.Paused, WorkTaskStates.Done),
        (WorkTaskStates.Paused, WorkTaskStates.Cancelled),
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

    /// <summary>
    /// Estados alcanzables desde <paramref name="fromState"/>. Se usa en el payload de
    /// <c>412</c> para que el cliente offline pueda resolver el conflicto con la
    /// información que ya tiene, sin pedir el recurso de nuevo.
    /// </summary>
    public static IReadOnlyList<string> GetAllowedTransitions(string? fromState)
    {
        if (string.IsNullOrWhiteSpace(fromState) || TerminalStates.Contains(fromState))
        {
            return Array.Empty<string>();
        }

        return AllowedTransitions
            .Where(t => t.From == fromState)
            .Select(t => t.To)
            .OrderBy(t => t, StringComparer.Ordinal)
            .ToList();
    }

    public static string GetErrorMessage(string? fromState, string toState)    {
        if (string.IsNullOrWhiteSpace(fromState))
        {
            return $"Una nueva tarea debe iniciar en estado '{WorkTaskStates.Todo}'.";
        }

        if (TerminalStates.Contains(fromState))
        {
            return $"No se puede cambiar el estado desde '{fromState}' porque es un estado terminal.";
        }

        return $"Transición de estado inválida de '{fromState}' a '{toState}'.";
    }
}
