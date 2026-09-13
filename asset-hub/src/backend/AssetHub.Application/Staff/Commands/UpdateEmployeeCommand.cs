using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Staff.Commands;

public class UpdateEmployeeCommand : IRequest<Unit>
{
    public Guid EmployeeId { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string? PreferredLocale { get; set; }
    public Guid RoleCatalogItemId { get; set; }
    public Guid[] Skills { get; set; } = Array.Empty<Guid>();
}

public class UpdateEmployeeCommandHandler : IRequestHandler<UpdateEmployeeCommand, Unit>
{
    private readonly ITenantDbContext _db;

    public UpdateEmployeeCommandHandler(ITenantDbContext db)
    {
        _db = db;
    }

    public async Task<Unit> Handle(UpdateEmployeeCommand request, CancellationToken cancellationToken)
    {
        var emp = await _db.Employees
            .FirstOrDefaultAsync(e => e.Id == request.EmployeeId && !e.IsDeleted, cancellationToken);

        if (emp == null)
            throw new ArgumentException("Employee not found");

        var roleExists = await _db.CatalogItems.AnyAsync(ci => ci.Id == request.RoleCatalogItemId, cancellationToken);
        if (!roleExists)
            throw new ArgumentException("Role catalog item not found");

        emp.FirstName = request.FirstName;
        emp.LastName = request.LastName;
        emp.Email = request.Email;
        emp.PhoneNumber = request.PhoneNumber;
        if (!string.IsNullOrWhiteSpace(request.PreferredLocale))
        {
            emp.PreferredLocale = request.PreferredLocale.Trim();
        }
        emp.RoleCatalogItemId = request.RoleCatalogItemId;
        emp.SkillsJson = JsonSerializer.Serialize(request.Skills);

        await _db.SaveChangesAsync(cancellationToken);

        return Unit.Value;
    }
}
