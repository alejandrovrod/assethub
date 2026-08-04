using System;

namespace AssetHub.Domain.Security;

public class UserInvitation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = string.Empty;
    public Guid RoleId { get; set; }
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime? AcceptedAt { get; set; }
}
