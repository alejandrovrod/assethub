using System;

namespace AssetHub.Application.Tasks.Helpers;

/// <summary>
/// Aritmética de tiempos de una tarea. Es pura y no mira el reloj: recibe los instantes.
/// Así se puede probar una pausa de tres horas sin dormir el test, y el handler es el
/// único que decide "ahora".
/// </summary>
public static class TaskTiming
{
    /// <summary>
    /// Segundos completos transcurridos entre dos instantes, nunca negativos.
    ///
    /// El clamp no es defensivo porque sí: si el reloj del servidor retrocede (ajuste NTP
    /// entre la pausa y la reanudación), restar un tiempo negativo <b>sumaría</b> tiempo
    /// pausado y la duración neta quedaría por debajo de la real.
    /// </summary>
    public static int ElapsedSeconds(DateTime from, DateTime to)
    {
        var elapsed = (to - from).TotalSeconds;
        return elapsed <= 0 ? 0 : (int)Math.Round(elapsed);
    }

    /// <summary>
    /// Duración neta en segundos: tiempo bruto entre inicio y fin menos todo el tiempo
    /// pausado. Nula mientras falte alguno de los dos extremos, porque no hay duración
    /// que medir (una tarea abierta no tiene duración todavía).
    /// </summary>
    public static int? NetDurationSeconds(DateTime? startedAt, DateTime? completedAt, int totalPausedSeconds)
    {
        if (startedAt is null || completedAt is null)
        {
            return null;
        }

        if (completedAt.Value <= startedAt.Value)
        {
            return null;
        }

        var gross = ElapsedSeconds(startedAt.Value, completedAt.Value);
        return Math.Max(0, gross - totalPausedSeconds);
    }
}
