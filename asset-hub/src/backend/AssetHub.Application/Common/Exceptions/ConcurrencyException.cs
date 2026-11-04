using System;
using System.Collections.Generic;

namespace AssetHub.Application.Common.Exceptions;

/// <summary>
/// La fila cambió desde que el cliente la leyó: lo que intenta escribir se basa en una
/// versión vieja.
///
/// No es un error de validación ni una regla de negocio rota — el request era válido
/// cuando se armó. Por eso se responde <c>412 Precondition Failed</c> y no <c>422</c>:
/// el cliente debe releer el recurso, reconciliar y reintentar, no corregir el payload.
///
/// El payload de error incluye lo mínimo para que el cliente pueda resolver el conflicto
/// sin un round-trip extra:
/// <list type="bullet">
///   <item><c>currentState</c>: en qué estado está el recurso ahora.</item>
///   <item><c>allowedTransitions</c>: a qué estados puede ir desde ahí (si aplica).</item>
///   <item><c>currentETag</c>: la versión vigente, para reintentar sin volver a leer.</item>
/// </list>
/// </summary>
public class ConcurrencyException : Exception
{
    public const string ErrorCode = "version_mismatch";

    public ConcurrencyException(
        string message,
        string? currentState = null,
        IReadOnlyList<string>? allowedTransitions = null,
        string? currentETag = null)
        : base(message)
    {
        CurrentState = currentState;
        AllowedTransitions = allowedTransitions;
        CurrentETag = currentETag;
    }

    public string Code => ErrorCode;

    public string? CurrentState { get; }

    public IReadOnlyList<string>? AllowedTransitions { get; }

    public string? CurrentETag { get; }
}
