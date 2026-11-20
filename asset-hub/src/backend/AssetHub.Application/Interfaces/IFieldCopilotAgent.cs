using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.FieldCopilot;

namespace AssetHub.Application.Interfaces;

/// <summary>
/// Port for the Field Maintenance Copilot agent that answers technician questions
/// grounded strictly in an asset's indexed technical manuals using Gemini File Search.
/// </summary>
public interface IFieldCopilotAgent
{
    Task<FieldCopilotResponse> AskAsync(
        AskFieldCopilotRequest request,
        CancellationToken cancellationToken = default);
}
