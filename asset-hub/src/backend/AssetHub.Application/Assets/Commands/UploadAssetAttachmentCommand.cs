using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Assets;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Assets.Commands;

public record UploadAssetAttachmentCommand(Guid AssetId, string FileName, string ContentType, long SizeBytes, Stream ContentStream) : IRequest<Guid>;

public class UploadAssetAttachmentCommandHandler : IRequestHandler<UploadAssetAttachmentCommand, Guid>
{
    private readonly ITenantDbContext _dbContext;
    private readonly IFileStorageService _fileStorageService;

    public UploadAssetAttachmentCommandHandler(
        ITenantDbContext dbContext,
        IFileStorageService fileStorageService)
    {
        _dbContext = dbContext;
        _fileStorageService = fileStorageService;
    }

    public async Task<Guid> Handle(UploadAssetAttachmentCommand request, CancellationToken cancellationToken)
    {
        var asset = await _dbContext.Assets
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == request.AssetId, cancellationToken);
        if (asset == null) throw new InvalidOperationException("Asset not found");

        var rawName = Path.GetFileName((request.FileName ?? string.Empty).Replace('\\', '/'));
        var safeFileName = string.IsNullOrWhiteSpace(rawName) ? "attachment" : rawName;
        var contentType = string.IsNullOrWhiteSpace(request.ContentType)
            ? "application/octet-stream"
            : request.ContentType.Trim();

        var blobUri = await _fileStorageService.UploadFileAsync(request.ContentStream, safeFileName, contentType);

        var kind = contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ? "photo" : "doc";
        var now = DateTime.UtcNow;

        var attachment = new AssetAttachment
        {
            Id = Guid.NewGuid(),
            TenantId = asset.TenantId,
            AssetId = request.AssetId,
            FileName = safeFileName,
            ContentType = contentType,
            SizeBytes = request.SizeBytes,
            BlobUri = blobUri,
            Kind = kind,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.AssetAttachments.Add(attachment);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return attachment.Id;
    }
}
