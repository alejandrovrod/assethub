using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Staff;
using MediatR;
using Microsoft.EntityFrameworkCore;

using AssetHub.Application.Staff.Helpers;

namespace AssetHub.Application.Staff.Commands;

public class CreateEmployeeCommand : IRequest<Guid>
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public Guid RoleCatalogItemId { get; set; }
    public Guid[] Skills { get; set; } = Array.Empty<Guid>();
}

public class CreateEmployeeCommandHandler : IRequestHandler<CreateEmployeeCommand, Guid>
{
    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;

    public CreateEmployeeCommandHandler(ITenantDbContext db, ITenantResolver tenantResolver)
    {
        _db = db;
        _tenantResolver = tenantResolver;
    }

    public async Task<Guid> Handle(CreateEmployeeCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId();

        // Ensure role catalog exists for this tenant (lazy init)
        await StaffCatalogDefaults.EnsureRoleCatalogAsync(_db, tenantId.Value, cancellationToken);

        var roleExists = await _db.CatalogItems.AnyAsync(ci => ci.Id == request.RoleCatalogItemId, cancellationToken);
        if (!roleExists)
            throw new ArgumentException("Role catalog item not found");

        var emp = new Employee
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            FirstName = request.FirstName,
            LastName = request.LastName,
            Email = request.Email,
            PhoneNumber = request.PhoneNumber,
            RoleCatalogItemId = request.RoleCatalogItemId,
            SkillsJson = JsonSerializer.Serialize(request.Skills)
        };

        _db.Employees.Add(emp);
        await _db.SaveChangesAsync(cancellationToken);

        return emp.Id;
    }
}
