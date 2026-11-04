using System;

namespace AssetHub.Domain.Common;

/// <summary>
/// Contrato de las entidades que participan del delta sync (022, §8.1).
///
/// El cliente offline no puede permitirse un full sync cada vez que se conecta: pide
/// "dame todo lo que cambió desde este cursor" y el servidor necesita una columna
/// monótona y actualizada para responder sin recorrer la tabla entera.
/// <c>CreatedAt</c> no sirve como cursor: una tarea de hace tres meses que se reasigna
/// hoy tiene que volver a viajar al dispositivo.
///
/// Vive en <c>AssetHub.Domain</c> y no en <c>Application</c> porque las entidades que lo
/// implementan están en Domain, y Domain no referencia Application. Ponerlo en
/// Application obligaría a invertir la dependencia para satisfacer un detalle de
/// persistencia.
///
/// <c>UpdatedAt</c> es <b>no nullable</b> a propósito: un cursor nullable obliga a
/// <c>COALESCE</c> en cada consulta y deja a las filas nunca tocadas fuera del delta para
/// siempre. Se inicializa al crear la fila y nunca queda en <c>default</c>.
/// </summary>
public interface ITimestamped
{
    DateTime CreatedAt { get; set; }

    DateTime UpdatedAt { get; set; }
}
