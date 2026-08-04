using System;
using Microsoft.AspNetCore.Identity;

namespace AssetHub.Domain.Security;

public class ApplicationRole : IdentityRole<Guid>
{
    public Guid? TenantId { get; set; }
}
