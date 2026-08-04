using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Security;
using AssetHub.Domain.Tenancy;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Tenancy.Commands;

public record SignUpTenantCommand(
    string OrgName,
    string Slug,
    string AdminName,
    string Email,
    string Password,
    string PlanCode) : IRequest<SignUpTenantResult>;

public record SignUpTenantResult(Guid TenantId, string Status);

public class SignUpTenantCommandHandler : IRequestHandler<SignUpTenantCommand, SignUpTenantResult>
{
    private readonly IPlatformDbContext _catalogDb;
    private readonly ISecurityDbContext _securityDb;
    private readonly UserManager<ApplicationUser> _userManager;

    public SignUpTenantCommandHandler(IPlatformDbContext catalogDb, ISecurityDbContext securityDb, UserManager<ApplicationUser> userManager)
    {
        _catalogDb = catalogDb;
        _securityDb = securityDb;
        _userManager = userManager;
    }

    public async Task<SignUpTenantResult> Handle(SignUpTenantCommand request, CancellationToken cancellationToken)
    {
        // 1. Validate Slug
        var reserved = new[] { "www", "api", "app", "admin", "support" };
        if (reserved.Contains(request.Slug))
        {
            throw new ArgumentException("Slug reservado");
        }
        
        if (!System.Text.RegularExpressions.Regex.IsMatch(request.Slug, "^[a-z0-9][a-z0-9-]{2,62}$"))
        {
            throw new ArgumentException("Slug inválido");
        }

        var exists = await _catalogDb.Tenants.AnyAsync(t => t.Slug == request.Slug, cancellationToken);
        if (exists)
        {
            throw new ArgumentException("Slug ya existe");
        }

        // 2. Create Tenant
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            Slug = request.Slug,
            Name = request.OrgName,
            Status = TenantStatus.Provisioning
        };

        _catalogDb.Tenants.Add(tenant);
        await _catalogDb.SaveChangesAsync(cancellationToken);

        // 3. Create Admin User
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = request.Email,
            Email = request.Email,
            FullName = request.AdminName,
            TenantId = tenant.Id,
            EmailConfirmed = true
        };

        var result = await _userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            throw new Exception("Error al crear usuario: " + string.Join(", ", result.Errors.Select(e => e.Description)));
        }

        // 4. (Simulated) Trigger Seeding Job
        // Here we would enqueue a background job to seed catalogs and activate the tenant.
        // For this iteration we activate it immediately:
        tenant.Status = TenantStatus.Active;
        await _catalogDb.SaveChangesAsync(cancellationToken);

        return new SignUpTenantResult(tenant.Id, tenant.Status.ToString());
    }
}
