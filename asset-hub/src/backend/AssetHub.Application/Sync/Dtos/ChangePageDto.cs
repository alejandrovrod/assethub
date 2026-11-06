using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AssetHub.Application.Sync.Dtos;

/// <summary>
/// Una fila dentro de un pull incremental.
///
/// Es deliberadamente pobre: identificador, posición en el stream y si está borrada. El
/// cliente no reconstruye la entidad con esto; lo usa para saber qué volver a pedir. Meter
/// el detalle acá obligaría a mantener un DTO de sync por cada entidad y a versionar el
/// contrato cada vez que cambia un campo del modelo.
/// </summary>
public class ChangeItemDto
{
    public Guid Id { get; set; }

    /// <summary>Posición de la fila en el stream. Junto con <see cref="Id"/> forma el cursor.</summary>
    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// La fila fue borrada. El cliente tiene que eliminarla de su caché local; sin esta
    /// bandera el dispositivo conserva tareas que el servidor ya no tiene.
    /// </summary>
    public bool Deleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    /// <summary>
    /// Versión de la fila para el próximo <c>If-Match</c>. Se entrega acá para que el
    /// cliente pueda escribir sin un <c>GET</c> adicional por entidad; en las filas
    /// borradas viaja en <c>null</c> porque ya no hay nada que actualizar.
    /// </summary>
    [JsonPropertyName("etag")]
    public string? ETag { get; set; }
}

public class ChangePageDto
{
    public List<ChangeItemDto> Items { get; set; } = new();

    /// <summary>
    /// Cursor de la última fila escaneada, incluso cuando <see cref="HasMore"/> es
    /// <c>false</c>. Si sólo se devolviera al haber más páginas, el cliente que termina el
    /// sync no tendría desde dónde reanudar y el pull siguiente volvería a ser completo.
    ///
    /// Puede venir con <see cref="Items"/> vacío: en los deltas filtrados por asignación la
    /// página puede estar compuesta sólo por filas de otros técnicos. El cursor tiene que
    /// avanzar igual, o el cliente re-escanearía la misma ventana para siempre. Es
    /// <c>null</c> únicamente cuando no se escaneó ninguna fila: ahí el cliente conserva el
    /// cursor que había mandado.
    /// </summary>
    public string? NextCursor { get; set; }

    public bool HasMore { get; set; }
}
