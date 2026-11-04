using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using AssetHub.Api.Controllers;
using AssetHub.Api.Tests.Security;
using AssetHub.Domain.Security;
using AssetHub.Domain.Tenancy;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// 022 T077 — matriz rol × superficie.
///
/// Hay dos mitades y las dos importan:
/// 1. **Permisos**: qué códigos tiene el rol, exactamente. La lista se compara con
///    igualdad de conjuntos, no con "contiene": un permiso de más (por ejemplo
///    <c>tasks:delete</c>, que §10 no concede) sería una escalada silenciosa.
/// 2. **Endpoints**: los dos endpoints exclusivos del cliente de campo declaran su policy,
///    y esa policy tiene que ser un permiso que el rol efectivamente tiene. Un endpoint
///    nuevo que se olvide de la policy no lo detecta ningún 403 en producción.
///
/// El resto de la matriz (propiedad de la tarea, cancelar, reasignar) no es una policy
/// porque depende de la fila: eso se verifica en <see cref="FieldRoleTests"/>.
/// </summary>
public class PermissionMatrixTests
{
    /// <summary>
    /// Tabla de verdad de los endpoints con policy propia. Cambiar una policy sin querer
    /// rompe este test; agregar un endpoint de campo sin policy no lo rompe, pero el
    /// comentario de la clase deja explícito dónde se revisa.
    /// </summary>
    public static IEnumerable<object[]> FieldEndpoints => new[]
    {
        new object[] { typeof(TaskEvidencesController), nameof(TaskEvidencesController.GetEvidences), "tasks:read" },
        new object[] { typeof(InventoryController), nameof(InventoryController.ConsumeStock), "inventory:consume" },
    };

    [Theory]
    [MemberData(nameof(FieldEndpoints))]
    public void FieldEndpoint_RequiresAPermissionTheRoleGrants(Type controller, string action, string permission)
    {
        var method = controller.GetMethod(action, BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(method);

        var policies = method!
            .GetCustomAttributes<AuthorizeAttribute>(inherit: true)
            .Select(a => a.Policy)
            .Where(p => !string.IsNullOrEmpty(p))
            .ToList();

        Assert.Contains("permission:" + permission, policies);
        Assert.Contains(permission, FieldTechnicianRole.Permissions);
    }

    [Fact]
    public void EveryRolePermission_ExistsInTheCatalog()
    {
        var catalog = PermissionCatalog.All.Select(p => p.Code).ToHashSet(StringComparer.Ordinal);

        var unknown = FieldTechnicianRole.Permissions.Where(code => !catalog.Contains(code)).ToList();

        Assert.Empty(unknown);
    }

    [Fact]
    public void Role_HasExactlyThePermissionsOfTheSpec()
    {
        var expected = new[]
        {
            "tasks:read", "tasks:update", "tasks:start", "tasks:complete", "tasks:evidence", "tasks:comment",
            "task-status:read",
            "assets:read",
            "incidents:read", "incidents:create", "incidents:update", "incidents:change-state",
            "inventory:read", "inventory:consume", "stock:read", "warehouses:read",
        };

        Assert.Equal(expected.OrderBy(c => c, StringComparer.Ordinal),
            FieldTechnicianRole.Permissions.OrderBy(c => c, StringComparer.Ordinal));
    }

    [Theory]
    [InlineData("tasks:delete")]
    [InlineData("tasks:assign")]
    [InlineData("tasks:cancel")]
    [InlineData("roles:manage")]
    [InlineData("users:manage")]
    [InlineData("employees:update")]
    [InlineData("stock:adjust")]
    [InlineData("inventory:configure")]
    [InlineData("maintenance:cancel")]
    public void Role_DoesNotGrantBackOfficePermissions(string forbidden)
    {
        // La lista de arriba sale de §10 y del sentido común: cancelar, reasignar y borrar
        // son decisiones de oficina. Si alguien "arregla" el rol agregándolas por rango de
        // códigos, este test lo frena.
        Assert.DoesNotContain(forbidden, FieldTechnicianRole.Permissions);
    }

    [Fact]
    public async Task Seeder_CreatesTheRoleAndGrantsItToEveryTenant_Idempotently()
    {
        var (securityDb, roleManager) = SecurityTestHelper.CreateSecurityDb();
        await using var platformDb = SecurityTestHelper.CreatePlatformDb();

        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();
        platformDb.Tenants.AddRange(
            new Tenant { Id = tenantA, Slug = "a", Name = "Tenant A", Status = TenantStatus.Active },
            new Tenant { Id = tenantB, Slug = "b", Name = "Tenant B", Status = TenantStatus.Active });
        await platformDb.SaveChangesAsync();

        await SecurityTestHelper.SeedCatalogAndRolesAsync(securityDb, roleManager);

        // Dos corridas: el seeder tiene que ser idempotente o duplicaría la matriz en cada
        // arranque de la API.
        await FieldTechnicianRoleSeeder.SeedAsync(securityDb, roleManager, platformDb);
        await FieldTechnicianRoleSeeder.SeedAsync(securityDb, roleManager, platformDb);

        var roles = await securityDb.Roles.Where(r => r.Name == FieldTechnicianRole.Name).ToListAsync();
        var role = Assert.Single(roles);
        Assert.True(role.IsSystemDefault);

        // No duplicó el catálogo de permisos.
        Assert.Equal(PermissionCatalog.All.Count, await securityDb.Permissions.CountAsync());

        var grants = await securityDb.RolePermissions
            .Where(rp => rp.RoleId == role.Id)
            .ToListAsync();

        Assert.Equal(2 * FieldTechnicianRole.Permissions.Count, grants.Count);

        var permissionIds = await securityDb.Permissions
            .Where(p => FieldTechnicianRole.Permissions.Contains(p.Code))
            .Select(p => p.Id)
            .ToListAsync();

        foreach (var tenantId in new[] { tenantA, tenantB })
        {
            var granted = grants.Where(g => g.TenantId == tenantId).Select(g => g.PermissionId).ToHashSet();
            Assert.Equal(FieldTechnicianRole.Permissions.Count, granted.Count);
            Assert.All(permissionIds, id => Assert.Contains(id, granted));
        }
    }

    [Fact]
    public async Task Seeder_SeedsThePermissionsItNeeds_WhenTheCatalogIsEmpty()
    {
        // Arranque de test o base recién creada sin el paso 1b: el rol no puede quedar
        // apuntando a códigos que no existen como filas, porque la matriz no tendría qué
        // asignar y el 403 llegaría en producción en vez de acá.
        var (securityDb, roleManager) = SecurityTestHelper.CreateSecurityDb();
        await using var platformDb = SecurityTestHelper.CreatePlatformDb();
        platformDb.Tenants.Add(new Tenant
        {
            Id = Guid.NewGuid(), Slug = "solo", Name = "Solo", Status = TenantStatus.Active,
        });
        await platformDb.SaveChangesAsync();

        await FieldTechnicianRoleSeeder.SeedAsync(securityDb, roleManager, platformDb);

        var codes = await securityDb.Permissions.Select(p => p.Code).ToListAsync();
        Assert.Equal(
            FieldTechnicianRole.Permissions.OrderBy(c => c, StringComparer.Ordinal),
            codes.OrderBy(c => c, StringComparer.Ordinal));
    }
}
