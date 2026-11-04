namespace AssetHub.Application.Auth;

/// <summary>
/// Nombres y valores de los claims del lease offline (022 §4.4).
///
/// Están en constantes y no escritos a mano en el generador porque los consume el test que
/// verifica el contrato: si alguien renombra <c>tid</c> a <c>tenant_id</c>, el lease sigue
/// firmándose bien y el cliente deja de reconocer el tenant. El test tiene que romperse.
/// </summary>
public static class OfflineLeaseClaims
{
    /// <summary>Emisor del lease. En minúsculas, tal como lo fija el spec (022 §4.4).</summary>
    public const string Issuer = "assethub";

    /// <summary>
    /// Audiencia propia del lease. No coincide con la del access token (<c>AssetHub</c>) a
    /// propósito: un documento pensado para operar sin red no debe poder confundirse con
    /// una credencial de API ni siquiera si algún día ambos comparten algoritmo.
    /// </summary>
    public const string Audience = "field-pwa";

    public const string TokenType = "offline_lease";

    public const string Scope = "field:offline";

    public const string TenantId = "tid";

    public const string DeviceId = "device_id";
}
