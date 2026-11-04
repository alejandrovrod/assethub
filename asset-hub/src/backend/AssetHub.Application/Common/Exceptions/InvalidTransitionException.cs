using System.Collections.Generic;
using AssetHub.Domain.Exceptions;

namespace AssetHub.Application.Common.Exceptions;

/// <summary>
/// La máquina de estados del recurso no admite el salto pedido
/// (por ejemplo <c>todo → paused</c>: no se puede pausar algo que nunca empezó).
///
/// Se responde <c>409</c> y no <c>422</c> ni <c>412</c>:
/// <list type="bullet">
///   <item>No es <c>412</c>: el cliente mandó la versión correcta. Reintentar con el mismo
///   <c>If-Match</c> después de releer da exactamente el mismo resultado.</item>
///   <item>No es <c>422</c>: el payload es válido y el estado actual es válido; lo que
///   choca son los dos entre sí.</item>
/// </list>
/// El cuerpo incluye <c>allowedTransitions</c> para que el cliente offline corrija el
/// intento sin un round-trip extra (spec 021 §6.6).
/// </summary>
public class InvalidTransitionException : DomainException
{
    public const string ErrorCode = "invalid_transition";

    public InvalidTransitionException(
        string fromState,
        string toState,
        string? currentState,
        IReadOnlyList<string> allowedTransitions)
        : base(
            ErrorCode,
            $"Invalid state transition from '{fromState}' to '{toState}'.",
            ErrorCode,
            fromState,
            toState)
    {
        CurrentState = currentState;
        AllowedTransitions = allowedTransitions;
    }

    /// <summary>Estado en el que está el recurso ahora (el mismo <c>fromState</c> del intento).</summary>
    public string? CurrentState { get; }

    /// <summary>Estados alcanzables desde <see cref="CurrentState"/>.</summary>
    public IReadOnlyList<string> AllowedTransitions { get; }
}
