namespace AssetHub.Domain.Tasks;

public static class TaskChecklistStates
{
    /// <summary>Snapshot creado, sin respuesta del técnico.</summary>
    public const string Pending = "pending";

    /// <summary>El técnico ya envió la respuesta (puede volver a enviarla).</summary>
    public const string Submitted = "submitted";
}
