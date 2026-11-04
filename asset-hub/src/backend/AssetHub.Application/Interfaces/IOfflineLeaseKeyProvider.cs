using AssetHub.Application.Auth;

namespace AssetHub.Application.Interfaces;

/// <summary>
/// Expone la mitad pública del material de firma del lease offline.
///
/// El lease lo valida el dispositivo, no el servidor: sólo necesita claves públicas. Por eso
/// esta interfaz no tiene <c>Sign</c>: firmar es responsabilidad de
/// <see cref="IJwtTokenGenerator"/>, y así el handler que arma la respuesta no puede, ni por
/// accidente, tener acceso a la clave privada.
/// </summary>
public interface IOfflineLeaseKeyProvider
{
    /// <summary><c>kid</c> de la clave con la que se firma hoy.</summary>
    string CurrentKeyId { get; }

    /// <summary>Claves públicas publicables: la vigente primero, después la anterior en solape.</summary>
    OfflineLeaseJwks GetPublicJwks();
}
