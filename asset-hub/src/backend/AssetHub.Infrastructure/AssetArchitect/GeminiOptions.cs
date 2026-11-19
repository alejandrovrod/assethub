namespace AssetHub.Infrastructure.AssetArchitect;

public sealed class GeminiOptions
{
    public const string SectionName = "Gemini";

    /// <summary>
    /// Google Gemini API key. Can also be set via GEMINI_API_KEY environment variable.
    /// </summary>
    public string? ApiKey { get; set; }

    /// <summary>
    /// Model name to use for generation (defaults to gemini-3.1-flash-lite).
    /// </summary>
    public string Model { get; set; } = "gemini-3.1-flash-lite";

    /// <summary>
    /// Optional temperature (default 0.2 for deterministic structured generation).
    /// </summary>
    public float Temperature { get; set; } = 0.2f;
}
