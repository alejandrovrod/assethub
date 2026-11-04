using System.Text;
using AssetHub.Application.Finance.Mapping;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Tenancy.Commands;
using AssetHub.Domain.Security;
using AssetHub.Infrastructure.Billing;
using AssetHub.Infrastructure.Middleware;
using AssetHub.Infrastructure.Persistence;
using AssetHub.Infrastructure.Security;
using AssetHub.Api.Configuration;
using AssetHub.Infrastructure.Tenancy;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        var factory = new NetTopologySuite.IO.Converters.GeoJsonConverterFactory();
        options.JsonSerializerOptions.Converters.Add(factory);
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.CamelCase));
    });
builder.Services.AddOpenApi();

// ---------------------------------------------------------------------------
// Localization (es / en). See LocalizationSetup for the culture matrix and the
// Accept-Language resolution order. Registering localization also makes
// ASP.NET Core model-binding and DataAnnotation messages culture-aware.
// ---------------------------------------------------------------------------
builder.Services.AddAssetHubLocalization();


builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowVite", policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173",
                "http://localhost:4173",
                "http://localhost:5174",
                "https://assethubweb.netlify.app",
                "https://*.dev.sonnora.mx"
              )
              .SetIsOriginAllowed(origin =>
              {
                  var host = new Uri(origin).Host;
                  return host.EndsWith("localhost") || 
                         host.EndsWith(".netlify.app") || 
                         host.EndsWith(".sonnora.mx");
              })
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var connectionString = builder.Configuration.GetConnectionString("assethub");
builder.Services.AddDbContext<PlatformDbContext>(options => options.UseSqlServer(connectionString));
builder.Services.AddScoped<IPlatformDbContext>(provider => provider.GetRequiredService<PlatformDbContext>());

builder.Services.AddDbContext<TenantDbContext>(options => options
    .UseSqlServer(connectionString, x => x.UseNetTopologySuite())
    .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning)));
builder.Services.AddScoped<ITenantDbContext>(provider => provider.GetRequiredService<TenantDbContext>());

builder.Services.AddDbContext<SecurityDbContext>(options => options.UseSqlServer(connectionString));
builder.Services.AddScoped<ISecurityDbContext>(provider => provider.GetRequiredService<SecurityDbContext>());

builder.Services.AddIdentity<ApplicationUser, ApplicationRole>()
    .AddEntityFrameworkStores<SecurityDbContext>()
    .AddDefaultTokenProviders()
    .AddErrorDescriber<AssetHub.Infrastructure.Security.SpanishIdentityErrorDescriber>();

var jwtSecret = builder.Configuration["JwtSettings:Secret"] ?? "SuperSecretKeyThatIsAtLeast32BytesLongForHS256!!!";
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = "AssetHub",
        ValidAudience = "AssetHub",
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
    };
});
builder.Services.AddAuthorization();
builder.Services.AddSingleton<Microsoft.AspNetCore.Authorization.IAuthorizationPolicyProvider, AssetHub.Infrastructure.Security.PermissionPolicyProvider>();
builder.Services.AddScoped<Microsoft.AspNetCore.Authorization.IAuthorizationHandler, AssetHub.Infrastructure.Security.PermissionAuthorizationHandler>();

builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssemblyContaining<CheckSlugCommand>());

// FluentValidation: register every validator in the Application assembly and run
// them through the pipeline so failures surface as localized ValidationException
// problem+json responses instead of reaching the handlers.
builder.Services.AddValidatorsFromAssemblyContaining<AssetHub.Application.Assets.Commands.CreateAssetMaterialCommandValidator>();
builder.Services.AddTransient(typeof(MediatR.IPipelineBehavior<,>), typeof(AssetHub.Application.Common.Behaviors.ValidationBehavior<,>));
builder.Services.AddAutoMapper(typeof(FinanceMappingProfile).Assembly);
builder.Services.AddHttpContextAccessor();
builder.Services.AddMemoryCache();

builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("PublicApi", opt =>
    {
        opt.PermitLimit = 100;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueProcessingOrder = System.Threading.RateLimiting.QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 0;
    });
    options.RejectionStatusCode = 429;
});

builder.Services.AddScoped<ITenantResolver, TenantResolver>();
builder.Services.Configure<SchedulerSettings>(builder.Configuration.GetSection(SchedulerSettings.SectionName));
builder.Services.AddScoped<IBillingProvider, ManualBillingProvider>();
builder.Services.AddScoped<IJwtTokenGenerator, JwtTokenGenerator>();

// Lease offline (022 Fase 8). El anillo de claves es singleton porque importar el material
// RSA una vez por request no aporta nada y cuesta; su mitad pública es la que se publica.
builder.Services.AddSingleton<AssetHub.Infrastructure.Security.OfflineLeaseKeyRing>();
builder.Services.AddSingleton<AssetHub.Application.Interfaces.IOfflineLeaseKeyProvider>(
    sp => sp.GetRequiredService<AssetHub.Infrastructure.Security.OfflineLeaseKeyRing>());
builder.Services.AddScoped<AssetHub.Application.Auth.OfflineLeaseIssuer>();
builder.Services.AddScoped<IUsageTracker, UsageTracker>();
builder.Services.AddScoped<ICatalogUsageChecker, AssetHub.Infrastructure.Catalogs.DummyCatalogUsageChecker>();
builder.Services.AddScoped<IEntityTypeUsageChecker, AssetHub.Infrastructure.EntityTypes.DummyEntityTypeUsageChecker>();
builder.Services.AddScoped<IAssetTemplateUsageChecker, AssetHub.Infrastructure.AssetTemplates.DummyAssetTemplateUsageChecker>();
builder.Services.AddScoped<IAssetHierarchyService, AssetHub.Infrastructure.Services.AssetHierarchyService>();
builder.Services.AddScoped<IInventoryPostingService, AssetHub.Infrastructure.Services.InventoryPostingService>();
builder.Services.AddScoped<IFileStorageService, AssetHub.Infrastructure.Storage.LocalDiskFileStorageService>();
builder.Services.AddScoped<IEmailService, AssetHub.Infrastructure.Services.Email.SmtpEmailService>();
builder.Services.AddScoped<AssetHub.Application.Interfaces.ITemplateRenderEngine, AssetHub.Infrastructure.Services.Templates.ScribanTemplateRenderEngine>();
builder.Services.AddScoped<AssetHub.Application.Interfaces.ICommunicationTemplateService, AssetHub.Application.CommunicationTemplates.Rendering.CommunicationTemplateService>();
builder.Services.AddScoped<AssetHub.Application.CommunicationTemplates.Rendering.TemplateVariableBuilder>();
builder.Services.AddScoped<AssetHub.Application.Field.FieldTaskAccess>();
builder.Services.AddHostedService<AssetHub.Api.Workers.PreventivePlanSchedulerService>();
builder.Services.AddHostedService<AssetHub.Api.Workers.IdempotencyCleanupWorker>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    
    // Apply migrations and seed default admin user
    using var scope = app.Services.CreateScope();
    
    // Ensure databases are created and migrations are applied
    var securityDb = scope.ServiceProvider.GetRequiredService<SecurityDbContext>();
    await securityDb.Database.MigrateAsync();
    
    var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
    await platformDb.Database.MigrateAsync();
    
    var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
    await tenantDb.Database.MigrateAsync();
    
    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<ApplicationRole>>();

    // 1. Seed Roles (base del sistema, marcados como IsSystemDefault)
    var roles = new[] { "admin", "Tenant Admin", "Asset Manager", "Technician", "Viewer" };
    foreach (var role in roles)
    {
        if (!await roleManager.RoleExistsAsync(role))
        {
            await roleManager.CreateAsync(new ApplicationRole
            {
                Name = role,
                NormalizedName = role.ToUpper(),
                IsSystemDefault = true,
                Description = role switch
                {
                    "admin" => "Administrador del sistema",
                    "Tenant Admin" => "Administración completa del tenant",
                    "Asset Manager" => "Gestión de activos y plantillas",
                    "Technician" => "Ejecución de mantenimiento y tareas",
                    _ => "Acceso de solo lectura"
                }
            });
        }
        else
        {
            // Backfill de roles existentes creados antes de la matriz
            var existing = await roleManager.FindByNameAsync(role);
            if (existing != null && !existing.IsSystemDefault)
            {
                existing.IsSystemDefault = true;
                await roleManager.UpdateAsync(existing);
            }
        }
    }

    // 1b. Seed Permission Catalog (catalogo global, una sola vez)
    var securityDbContext = scope.ServiceProvider.GetRequiredService<SecurityDbContext>();
    var existingPermCodes = await securityDbContext.Permissions.Select(p => p.Code).ToListAsync();
    var catalogByCode = AssetHub.Domain.Security.PermissionCatalog.All.ToDictionary(p => p.Code);
    var newPermissions = catalogByCode
        .Where(kvp => !existingPermCodes.Contains(kvp.Key))
        .Select(kvp => new AssetHub.Domain.Security.Permission
        {
            Id = Guid.NewGuid(),
            Code = kvp.Value.Code,
            Description = kvp.Value.Description,
            Module = kvp.Value.Module,
            PlanModule = kvp.Value.PlanModule
        })
        .ToList();
    if (newPermissions.Count > 0)
    {
        securityDbContext.Permissions.AddRange(newPermissions);
        await securityDbContext.SaveChangesAsync();
    }

    // Limpieza: RolePermissions huerfanos con TenantId vacio (default Guid del
    // cambio de PK) de corridas previas; la tabla estaba vacia antes de la matriz.
    var orphanRolePerms = await securityDbContext.RolePermissions
        .Where(rp => rp.TenantId == Guid.Empty)
        .ToListAsync();
    if (orphanRolePerms.Count > 0)
    {
        securityDbContext.RolePermissions.RemoveRange(orphanRolePerms);
        await securityDbContext.SaveChangesAsync();
    }
    
    // 2. Ensure Demo Tenant exists
    var demoTenant = await platformDb.Tenants.FirstOrDefaultAsync(t => t.Slug == "demo");
    if (demoTenant == null)
    {
        demoTenant = new AssetHub.Domain.Tenancy.Tenant { Name = "Demo Tenant", Slug = "demo", Status = AssetHub.Domain.Tenancy.TenantStatus.Active };
        platformDb.Tenants.Add(demoTenant);
        await platformDb.SaveChangesAsync();
    }

    // Seed Plans
    if (!await platformDb.Plans.AnyAsync())
    {
        platformDb.Plans.AddRange(
            new AssetHub.Domain.Tenancy.Plan { Code = "free", Name = "Free", PriceMonthly = 0, PriceYearly = 0, MaxAssets = 100, MaxUsers = 3, MaxStorageMB = 1000, IsPublic = true, EnabledModules = "[\"assets\"]" },
            new AssetHub.Domain.Tenancy.Plan { Code = "pro", Name = "Pro", PriceMonthly = 49, PriceYearly = 490, MaxAssets = 5000, MaxUsers = 20, MaxStorageMB = 50000, IsPublic = true, EnabledModules = "[\"assets\", \"maintenance\"]" },
            new AssetHub.Domain.Tenancy.Plan { Code = "enterprise", Name = "Enterprise", PriceMonthly = 199, PriceYearly = 1990, MaxAssets = 100000, MaxUsers = 500, MaxStorageMB = 500000, IsPublic = false, EnabledModules = "[\"assets\", \"maintenance\", \"advanced\", \"core\", \"incidents\", \"preventive-plans\", \"tasks\", \"employees\", \"geo\", \"reports\"]" }
        );
        await platformDb.SaveChangesAsync();
    }

    // Asegurarse de que el Demo Tenant tenga el plan Enterprise (que tiene todos los módulos)
    var enterprisePlan = await platformDb.Plans.FirstOrDefaultAsync(p => p.Code == "enterprise");
    if (enterprisePlan != null && demoTenant.PlanId != enterprisePlan.Id)
    {
        demoTenant.PlanId = enterprisePlan.Id;
        await platformDb.SaveChangesAsync();
    }

    // 3. Seed System Admin (admin@demo.com)
    var adminUser = await userManager.FindByEmailAsync("admin@demo.com");
    if (adminUser == null)
    {
        adminUser = new ApplicationUser { UserName = "admin@demo.com", Email = "admin@demo.com", FullName = "System Administrator", TenantId = null };
        await userManager.CreateAsync(adminUser, "Admin123!");
        await userManager.AddToRoleAsync(adminUser, "admin");
    }

    // 4. Seed Tenant Admin (cliente@demo.com)
    var clientUser = await userManager.FindByEmailAsync("cliente@demo.com");
    if (clientUser == null)
    {
        clientUser = new ApplicationUser { UserName = "cliente@demo.com", Email = "cliente@demo.com", FullName = "Cliente Demo", TenantId = demoTenant.Id };
        await userManager.CreateAsync(clientUser, "Cliente123!");
        await userManager.AddToRoleAsync(clientUser, "Tenant Admin");
    }

    // 5. FIX: Assign Tenant Admin to any user missing a role
    var allUsers = await userManager.Users.ToListAsync();
    foreach (var u in allUsers)
    {
        var userRoles = await userManager.GetRolesAsync(u);
        if (userRoles.Count == 0 && u.TenantId != null)
        {
            await userManager.AddToRoleAsync(u, "Tenant Admin");
        }
    }
    // 6. Seed Role-Permission Matrix por tenant (R-ROLE-1: roles base con
    //    permisos default del catalogo; tenants ya creados en corridas previas)
    await RolePermissionMatrixSeeder.SeedAsync(securityDbContext, platformDb);

    // 7. Rol de campo (022 T074). Después de la matriz porque necesita el catálogo de
    //    permisos ya persistido, y con lista cerrada porque §10 es una lista cerrada.
    await FieldTechnicianRoleSeeder.SeedAsync(securityDbContext, roleManager, platformDb);
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}
app.UseCors("AllowVite");
app.UseStaticFiles();

// Must run before the exception middleware so that CultureInfo.CurrentCulture /
// CurrentUICulture are already set when problem+json bodies are localized.
app.UseRequestLocalization();

app.UseRateLimiter();

app.UseMiddleware<AssetHub.Api.Middleware.ExceptionHandlingMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TenantResolutionMiddleware>();

// La idempotencia necesita TenantId y UserId ya resueltos, por eso va después de
// TenantResolutionMiddleware y antes de MapControllers.
app.UseMiddleware<AssetHub.Api.Middleware.IdempotencyMiddleware>();

app.MapControllers();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/v1/ping", () => Results.Ok(new { message = "pong" }));

// Claves públicas del lease offline (022 §6.2). Anónimo por diseño —no hay secretos acá— y
// fuera de un controlador para que no lo alcance ninguna convención de [Authorize].
app.MapGet(
    AssetHub.Infrastructure.Security.OfflineLeaseKeyRing.JwksPath,
    (AssetHub.Application.Interfaces.IOfflineLeaseKeyProvider keys, HttpContext context) =>
    {
        context.Response.Headers.CacheControl =
            AssetHub.Infrastructure.Security.OfflineLeaseKeyRing.JwksCacheControl;
        return Results.Ok(keys.GetPublicJwks());
    });

app.Run();

/// <summary>
/// Popula la matriz RolePermissions (por tenant) para cada tenant que no
/// tenga asignaciones. Definiciones default: Tenant Admin/admin = todo;
/// Asset Manager = assets full + lecturas; Technician = ejecucion;
/// Viewer = solo :read.
/// </summary>
public static class RolePermissionMatrixSeeder
{
    public static async Task SeedAsync(
        SecurityDbContext securityDb, PlatformDbContext platformDb)
    {
        var tenants = await platformDb.Tenants.ToListAsync();
        if (tenants.Count == 0) return;

        var allPermissions = await securityDb.Permissions.ToListAsync();
        var permissionsByCode = allPermissions.ToDictionary(p => p.Code);
        var roles = await securityDb.Roles.ToListAsync();
        var roleByName = roles.ToDictionary(r => r.Name ?? string.Empty);

        foreach (var tenant in tenants)
        {
            var existingAssignments = await securityDb.RolePermissions
                .Where(rp => rp.TenantId == tenant.Id)
                .ToListAsync();

            var allCodes = allPermissions.Select(p => p.Code).ToList();

            void AddRole(string roleName, IEnumerable<string> codes)
            {
                if (!roleByName.TryGetValue(roleName, out var role)) return;
                foreach (var code in codes)
                {
                    if (permissionsByCode.TryGetValue(code, out var perm))
                    {
                        var alreadyAssigned = existingAssignments.Any(a => a.RoleId == role.Id && a.PermissionId == perm.Id);
                        if (!alreadyAssigned)
                        {
                            securityDb.RolePermissions.Add(new AssetHub.Domain.Security.RolePermission
                            {
                                TenantId = tenant.Id,
                                RoleId = role.Id,
                                PermissionId = perm.Id
                            });
                        }
                    }
                }
            }

            // Tenant Admin y admin: todos los permisos
            AddRole("Tenant Admin", allCodes);
            AddRole("admin", allCodes);

            // Viewer: solo permisos :read + finanzas lectura
            AddRole("Viewer", allCodes.Where(c => c.EndsWith(":read") || c.EndsWith("finance:read") || c.EndsWith("depreciation:read") || c.EndsWith("value-adjustment:read") || c.EndsWith("disposal:read") || c.EndsWith("custody:read") || c.EndsWith("capitalization:read")));

            // Asset Manager: assets full + mantenimiento lectura + tareas lectura + analytics + finanzas lectura
            AddRole("Asset Manager", allCodes.Where(c =>
                c.StartsWith("assets") || c.StartsWith("asset-templates") ||
                c.StartsWith("geo:") || c.StartsWith("analytics") || c.StartsWith("predictions") ||
                c.StartsWith("entity-types") || c.StartsWith("catalogs") || c.StartsWith("catalog-items") ||
                c == "incidents:read" || c == "maintenance:read" || c == "maintenance-parts:read" ||
                c == "tasks:read" || c == "employees:read" || c == "teams:read" ||
                c == "preventive-plans:read" || c == "warehouses:read" || c == "stock:read" ||
                c == "transactions:read" || c == "inventory:read" || c == "tasks-board:read" ||
                c == "task-status:read" || c == "communication-templates:read" ||
                c.EndsWith("finance:read") || c.EndsWith("depreciation:read") || c.EndsWith("disposal:read") ||
                c.EndsWith("custody:read") || c.EndsWith("capitalization:read")));

            // Technician: ejecucion de mantenimiento y tareas + capitalización
            AddRole("Technician", allCodes.Where(c =>
                c.StartsWith("incidents:") || c.StartsWith("maintenance") ||
                c.StartsWith("tasks:") || c.StartsWith("task-status") || c.StartsWith("tasks-board") ||
                c == "assets:read" || c == "assets:attachments" || c == "assets-properties:read" ||
                c == "geo:read" || c == "employees:read" || c == "teams:read" ||
                c == "warehouses:read" || c == "stock:read" || c == "transactions:read" ||
                c == "preventive-plans:read" || c == "inventory:read" ||
                c == "assets.capitalization:propose"));
        }

        await securityDb.SaveChangesAsync();
    }
}

/// <summary>
/// Siembra el rol de campo (022 T074). Es idempotente en los tres niveles que toca:
/// catálogo de permisos (las filas de <see cref="FieldTechnicianRole.Permissions"/>),
/// definición del rol y matriz <c>RolePermissions</c> por tenant.
///
/// Va separado de <see cref="RolePermissionMatrixSeeder"/> a propósito: aquél siembra los
/// roles base del sistema por rango de códigos ("todo lo que empieza con <c>tasks:</c>"),
/// y el rol de campo necesita una lista **cerrada**. Una lista por rango le daría
/// <c>tasks:delete</c> y se rompería la restricción de §10 sin que nadie lo note.
/// </summary>
public static class FieldTechnicianRoleSeeder
{
    public static async Task SeedAsync(
        SecurityDbContext securityDb,
        RoleManager<ApplicationRole> roleManager,
        PlatformDbContext platformDb)
    {
        // 1. Permisos: el arranque en Development ya siembra el catálogo completo (1b), pero
        //    los tests llaman a este seeder sobre una base vacía. Sin este paso, la matriz
        //    saldría sin filas y el rol quedaría con permisos "que existen en el código"
        //    pero no en la base, que es la peor combinación posible.
        var existingCodes = await securityDb.Permissions.Select(p => p.Code).ToListAsync();
        var catalogByCode = PermissionCatalog.All.ToDictionary(p => p.Code);

        var missing = FieldTechnicianRole.Permissions
            .Where(code => !existingCodes.Contains(code) && catalogByCode.ContainsKey(code))
            .Select(code => catalogByCode[code])
            .Select(def => new Permission
            {
                Id = Guid.NewGuid(),
                Code = def.Code,
                Description = def.Description,
                Module = def.Module,
                PlanModule = def.PlanModule
            })
            .ToList();

        if (missing.Count > 0)
        {
            securityDb.Permissions.AddRange(missing);
            await securityDb.SaveChangesAsync();
        }

        // 2. Rol: el nombre es el contrato con el cliente de campo, así que se busca por
        //    nombre. Si un tenant lo borró, se recrea: sin rol no hay restricción ni permisos.
        var role = await roleManager.FindByNameAsync(FieldTechnicianRole.Name);
        if (role is null)
        {
            role = new ApplicationRole
            {
                Id = Guid.NewGuid(),
                Name = FieldTechnicianRole.Name,
                Description = FieldTechnicianRole.Description,
                IsSystemDefault = true,
                TenantId = null
            };

            var created = await roleManager.CreateAsync(role);
            if (!created.Succeeded)
            {
                throw new InvalidOperationException(
                    $"Could not seed role '{FieldTechnicianRole.Name}': " +
                    string.Join("; ", created.Errors.Select(e => e.Description)));
            }
        }

        // 3. Matriz por tenant: aditiva, nunca quita lo que un admin agregó a mano.
        var permissionsByCode = await securityDb.Permissions
            .Where(p => FieldTechnicianRole.Permissions.Contains(p.Code))
            .ToDictionaryAsync(p => p.Code);

        var tenants = await platformDb.Tenants.Select(t => t.Id).ToListAsync();
        if (tenants.Count == 0)
        {
            return;
        }

        var assigned = await securityDb.RolePermissions
            .Where(rp => rp.RoleId == role.Id && tenants.Contains(rp.TenantId))
            .Select(rp => new { rp.TenantId, rp.PermissionId })
            .ToListAsync();

        var added = false;
        foreach (var tenantId in tenants)
        {
            foreach (var code in FieldTechnicianRole.Permissions)
            {
                if (!permissionsByCode.TryGetValue(code, out var permission))
                {
                    // Un código del rol que no está en el catálogo es un error de
                    // programación (typo en FieldTechnicianRole), no un estado válido.
                    throw new InvalidOperationException(
                        $"Permission '{code}' of role '{FieldTechnicianRole.Name}' is not in the permission catalog.");
                }

                if (assigned.Any(a => a.TenantId == tenantId && a.PermissionId == permission.Id))
                {
                    continue;
                }

                securityDb.RolePermissions.Add(new RolePermission
                {
                    TenantId = tenantId,
                    RoleId = role.Id,
                    PermissionId = permission.Id
                });

                added = true;
            }
        }

        if (added)
        {
            await securityDb.SaveChangesAsync();
        }
    }
}

public partial class Program;
