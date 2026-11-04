using System;
using System.Collections.Generic;
using System.Linq;
using AssetHub.Application.Common.Cursors;
using AssetHub.Application.Sync.Dtos;

namespace AssetHub.Application.Sync;

/// <summary>
/// Mecánica compartida por los cuatro endpoints de delta sync (022 §8).
///
/// La paginación se resuelve pidiendo <c>limit + 1</c> filas: si llegó una de más, hay otra
/// página. Evita el <c>COUNT(*)</c> que un <c>HasMore</c> ingenuo necesitaría, y ese count
/// sobre una tabla que se está escribiendo es exactamente lo que no queremos en el camino
/// caliente de un pull.
/// </summary>
public static class DeltaSync
{
    public const int DefaultLimit = 100;

    /// <summary>
    /// Techo de la página. Con 200 filas el peor caso son ~8 páginas para un tenant con
    /// 800 activos, y el payload sigue entrando cómodo en una conexión rural.
    /// </summary>
    public const int MaxLimit = 200;

    public static int NormalizeLimit(int? limit)
        => Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);

    public static KeysetCursor? ParseSince(string? since)
        => string.IsNullOrWhiteSpace(since) ? null : KeysetCursor.Decode(since);

    /// <summary>
    /// <paramref name="fetched"/> debe traer hasta <c>limit + 1</c> filas ya ordenadas.
    /// </summary>
    public static ChangePageDto BuildPage(IReadOnlyList<ChangeItemDto> fetched, int limit)
    {
        var hasMore = fetched.Count > limit;
        var items = hasMore ? fetched.Take(limit).ToList() : fetched.ToList();

        return new ChangePageDto
        {
            Items = items,
            HasMore = hasMore,
            NextCursor = items.Count == 0
                ? null
                : KeysetCursor.Encode(items[^1].UpdatedAt, items[^1].Id),
        };
    }
}
