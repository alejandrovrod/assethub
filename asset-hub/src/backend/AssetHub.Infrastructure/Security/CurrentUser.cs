using System;
using System.Security.Claims;
using AssetHub.Application.Interfaces;
using Microsoft.AspNetCore.Http;

namespace AssetHub.Infrastructure.Security;

public class CurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUser(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid? Id
    {
        get
        {
            var idClaim = _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return Guid.TryParse(idClaim, out var id) ? id : null;
        }
    }

    /// <summary>
    /// Delega en <c>ClaimsPrincipal.IsInRole</c> para que el rol salga de los claims
    /// emitidos en el token (vía <c>RoleClaimType</c>), no de una consulta a la base.
    /// </summary>
    public bool IsInRole(string role) =>
        !string.IsNullOrWhiteSpace(role) && _httpContextAccessor.HttpContext?.User?.IsInRole(role) == true;
}
