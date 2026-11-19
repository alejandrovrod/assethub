using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace AssetHub.Application.Interfaces;

public sealed record LoadedIncidentImage(string FileName, string MimeType, byte[] Bytes);

/// <summary>
/// Safely loads image attachments and embedded media URLs associated with an incident
/// for multimodal AI inspection.
/// </summary>
public interface IIncidentMediaLoader
{
    Task<IReadOnlyList<LoadedIncidentImage>> LoadImagesAsync(
        IEnumerable<(string FileUrl, string? ContentType, string FileName)> attachments,
        string? propertiesJson,
        int maxImages = 4,
        int maxBytesPerImage = 4 * 1024 * 1024,
        CancellationToken cancellationToken = default);
}
