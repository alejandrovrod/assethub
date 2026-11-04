namespace AssetHub.Application.Common.Exceptions;

/// <summary>
/// La política de lease del tenant está fuera del rango soportado (022 §6.3).
///
/// Se responde <c>422</c> y no <c>400</c>: el request del técnico es perfecto —pidió un
/// lease, como corresponde—. Lo que no se puede procesar es la configuración del tenant.
/// Esa distinción importa operativamente: un <c>400</c> manda al cliente a revisar el
/// payload; un <c>422</c> con <c>offlineLeaseHours</c> manda a quien administra el tenant a
/// corregir un número.
///
/// No se acota silenciosamente al rango (clamp): un tenant que pidió 100 h y recibe 24 sin
/// aviso cree que sus técnicos tienen cuatro días de autonomía y no los tienen.
/// </summary>
public class InvalidFieldAppSettingsException : System.Exception
{
    public const string ErrorCode = "field_app_settings_invalid";

    public InvalidFieldAppSettingsException(int offlineLeaseHours, int min, int max)
        : base($"offlineLeaseHours must be between {min} and {max} (got {offlineLeaseHours}).")
    {
        OfflineLeaseHours = offlineLeaseHours;
        Min = min;
        Max = max;
    }

    public string Code => ErrorCode;

    /// <summary>
    /// Clave del catálogo de mensajes. El middleware resuelve el <c>detail</c> contra el
    /// <c>Accept-Language</c> del request, igual que hace con <see cref="DomainException"/>.
    /// </summary>
    public string ResourceKey => ErrorCode;

    /// <summary>Argumentos posicionales para el catálogo: valor, mínimo, máximo.</summary>
    public object[] Args => new object[] { OfflineLeaseHours, Min, Max };

    public int OfflineLeaseHours { get; }

    public int Min { get; }

    public int Max { get; }
}
