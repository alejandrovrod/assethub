using System.Text;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Tenancy.Commands;
using AssetHub.Domain.Security;
using AssetHub.Infrastructure.Billing;
using AssetHub.Infrastructure.Middleware;
using AssetHub.Infrastructure.Persistence;
using AssetHub.Infrastructure.Security;
using AssetHub.Api.Configuration;
using AssetHub.Infrastructure.Tenancy;
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
    });
builder.Services.AddOpenApi();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowVite", builder =>
    {
        builder.WithOrigins("http://localhost:5173", "http://localhost:4173", "http://localhost:5174")
               .SetIsOriginAllowed(origin => new Uri(origin).Host.EndsWith("localhost"))
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
    .AddDefaultTokenProviders();

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

builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssemblyContaining<CheckSlugCommand>());
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
builder.Services.AddScoped<IUsageTracker, UsageTracker>();
builder.Services.AddScoped<ICatalogUsageChecker, AssetHub.Infrastructure.Catalogs.DummyCatalogUsageChecker>();
builder.Services.AddScoped<IEntityTypeUsageChecker, AssetHub.Infrastructure.EntityTypes.DummyEntityTypeUsageChecker>();
builder.Services.AddScoped<IAssetTemplateUsageChecker, AssetHub.Infrastructure.AssetTemplates.DummyAssetTemplateUsageChecker>();
builder.Services.AddScoped<IAssetHierarchyService, AssetHub.Infrastructure.Services.AssetHierarchyService>();
builder.Services.AddScoped<IInventoryPostingService, AssetHub.Infrastructure.Services.InventoryPostingService>();
builder.Services.AddScoped<IFileStorageService, AssetHub.Infrastructure.Storage.LocalDiskFileStorageService>();
builder.Services.AddScoped<IEmailService, AssetHub.Infrastructure.Services.Email.SmtpEmailService>();
builder.Services.AddHostedService<AssetHub.Api.Workers.PreventivePlanSchedulerService>();

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
    
    // 1. Seed Roles
    var roles = new[] { "admin", "Tenant Admin", "Asset Manager", "Technician" };
    foreach (var role in roles)
    {
        if (!await roleManager.RoleExistsAsync(role))
        {
            await roleManager.CreateAsync(new ApplicationRole { Name = role, NormalizedName = role.ToUpper() });
        }
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
            new AssetHub.Domain.Tenancy.Plan { Code = "enterprise", Name = "Enterprise", PriceMonthly = 199, PriceYearly = 1990, MaxAssets = 100000, MaxUsers = 500, MaxStorageMB = 500000, IsPublic = false, EnabledModules = "[\"assets\", \"maintenance\", \"advanced\"]" }
        );
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
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseCors("AllowVite");

app.UseRateLimiter();

app.UseMiddleware<AssetHub.Api.Middleware.ExceptionHandlingMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TenantResolutionMiddleware>();

app.MapControllers();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/v1/ping", () => Results.Ok(new { message = "pong" }));

app.Run();

public partial class Program;
