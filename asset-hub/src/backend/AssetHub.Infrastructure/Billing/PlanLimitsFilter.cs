using System;
using System.Linq;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.Tenancy;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;

namespace AssetHub.Infrastructure.Billing;

public class PlanLimitsFilter : IAsyncActionFilter
{
    private readonly string[] _requiredModules;
    private readonly string? _limitToCheck;

    public PlanLimitsFilter(string[] requiredModules, string? limitToCheck = null)
    {
        _requiredModules = requiredModules;
        _limitToCheck = limitToCheck;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var tenantResolver = context.HttpContext.RequestServices.GetRequiredService<ITenantResolver>();
        var tenant = tenantResolver.GetCurrentTenant();

        if (tenant == null)
        {
            await next();
            return;
        }

        // 1. Validar módulos habilitados (Simulado para el mock. En real leería del Plan real).
        // var plan = ObtenerPlan(tenant.PlanId);
        // var enabledModules = JsonSerializer.Deserialize<List<string>>(plan.EnabledModules);
        var enabledModules = new[] { "core", "maintenance" }; // Dummy
        
        foreach (var req in _requiredModules)
        {
            if (!enabledModules.Contains(req))
            {
                context.Result = new ObjectResult(new
                {
                    code = "module_not_enabled",
                    title = $"El módulo '{req}' no está habilitado."
                }) { StatusCode = 403 };
                return;
            }
        }

        // 2. Validar límite (ej. MaxUsers, MaxAssets) solo en endpoints de creación (POST)
        if (!string.IsNullOrEmpty(_limitToCheck))
        {
            var usageTracker = context.HttpContext.RequestServices.GetRequiredService<IUsageTracker>();
            
            if (_limitToCheck == "MaxUsers")
            {
                var users = await usageTracker.GetCurrentUsersCountAsync();
                var maxUsers = 10; // Dummy
                if (users >= maxUsers)
                {
                    context.Result = new ObjectResult(new
                    {
                        code = "plan_limit_exceeded",
                        title = "Límite de usuarios excedido."
                    }) { StatusCode = 402 };
                    return;
                }
            }
        }

        await next();
    }
}

// Atributo para usar en controladores
public class RequirePlanLimitsAttribute : TypeFilterAttribute
{
    public RequirePlanLimitsAttribute(string requiredModule, string? limitToCheck = null) 
        : base(typeof(PlanLimitsFilter))
    {
        Arguments = new object[] { new[] { requiredModule }, limitToCheck };
    }
}
