using System;
using System.Collections.Generic;
using System.Linq;
using AssetHub.Application.Inventory.Queries;

namespace AssetHub.Application.Common.Exceptions;

/// <summary>
/// No hay stock suficiente y la política del tenant no permite saldos negativos.
///
/// Es <c>409</c> y no <c>422</c>: el pedido es válido, lo que no alcanza es el stock. La
/// diferencia importa en el cliente offline, que no debe reintentar el mismo payload
/// (reintentar no crea unidades).
///
/// El payload lleva <c>available</c>, <c>requested</c> y <c>alternatives</c>: sin las
/// alternativas, el técnico ve "no hay stock" y cierra la tarea sin material. Con ellas
/// puede resolverlo en el momento en vez de volver al depósito.
/// </summary>
public class InsufficientStockException : Exception
{
    public const string ErrorCode = "insufficient_stock";

    public InsufficientStockException(
        decimal available,
        decimal requested,
        IReadOnlyList<StockAlternativeDto>? alternatives = null)
        : base($"Insufficient stock. Available: {available}, requested: {requested}.")
    {
        Available = available;
        Requested = requested;
        Alternatives = alternatives ?? Array.Empty<StockAlternativeDto>();
    }

    public string Code => ErrorCode;

    public decimal Available { get; }

    public decimal Requested { get; }

    public IReadOnlyList<StockAlternativeDto> Alternatives { get; }
}
