using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Sync.Dtos;
using AssetHub.Domain.Concurrency;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Sync.Queries;

/// <summary>
/// Pull incremental de activos (022 §8.2).
///
/// Es el stream más grande: un tenant mediano tiene cientos de activos y el técnico los
/// necesita todos en la tablet para trabajar sin red. De ahí el límite de 200 por página.
/// </summary>
public class GetAssetChangesQuery : IRequest<ChangePageDto>
{
    public string? Since { get; set; }

    public int? Limit { get; set; }

    public bool IncludeDeleted { get; set; } = true;
}

public class GetAssetChangesQueryHandler : IRequestHandler<GetAssetChangesQuery, ChangePageDto>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;

    public GetAssetChangesQueryHandler(ITenantDbContext db, ITenantResolver tenantResolver)
    {
        _db = db;
        _tenantResolver = tenantResolver;
    }

    public async Task<ChangePageDto> Handle(GetAssetChangesQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId()
            ?? throw new UnauthorizedAccessException("A tenant is required to pull changes.");

        var limit = DeltaSync.NormalizeLimit(request.Limit);
        var cursor = DeltaSync.ParseSince(request.Since);

        var query = _db.Assets
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(a => a.TenantId == tenantId);

        if (!request.IncludeDeleted)
        {
            query = query.Where(a => !a.IsDeleted);
        }

        if (cursor is { } position)
        {
            var after = position.UpdatedAt;
            var afterId = position.Id;

            query = query.Where(a =>
                a.UpdatedAt > after || (a.UpdatedAt == after && a.Id.CompareTo(afterId) > 0));
        }

        var rows = await query
            .OrderBy(a => a.UpdatedAt)
            .ThenBy(a => a.Id)
            .Take(limit + 1)
            .Select(a => new
            {
                a.Id,
                a.UpdatedAt,
                a.IsDeleted,
                a.DeletedAt,
                a.RowVersion,
            })
            .ToListAsync(cancellationToken);

        var items = rows
            .Select(a => new ChangeItemDto
            {
                Id = a.Id,
                UpdatedAt = a.UpdatedAt,
                Deleted = a.IsDeleted,
                DeletedAt = a.DeletedAt,
                ETag = a.IsDeleted ? null : RowVersionToken.ToToken(a.RowVersion),
            })
            .ToList();

        return DeltaSync.BuildPage(items, limit);
    }
}
