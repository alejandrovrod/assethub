using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.AssetArchitect;

namespace AssetHub.Application.Interfaces;

/// <summary>
/// Port for the Asset Architect agent. Implementations (e.g. Gemini) live in Infrastructure.
/// The agent only proposes a draft; it never persists anything.
/// </summary>
public interface IAssetArchitectAgent
{
    Task<AssetArchitectDraft> GenerateDraftAsync(AssetArchitectRequest request, CancellationToken cancellationToken);
}
