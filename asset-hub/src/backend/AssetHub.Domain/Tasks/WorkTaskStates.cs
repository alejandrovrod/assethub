namespace AssetHub.Domain.Tasks;

public static class WorkTaskStates
{
    public const string Todo = "todo";
    public const string Rework = "rework";
    public const string InProgress = "in_progress";

    /// <summary>
    /// Trabajo empezado y detenido a propósito (esperando un repuesto, acceso al sitio,
    /// etc.). No es terminal: la tarea sigue venciendo y sigue contando para el cierre de
    /// la orden de mantenimiento. El tiempo detenido se acumula en
    /// <see cref="WorkTask.TotalPausedSeconds"/> para no inflar las métricas de resolución.
    /// </summary>
    public const string Paused = "paused";

    public const string Done = "done";
    public const string Cancelled = "cancelled";

    public static readonly HashSet<string> TerminalStates = new()
    {
        Done, Cancelled
    };
}
