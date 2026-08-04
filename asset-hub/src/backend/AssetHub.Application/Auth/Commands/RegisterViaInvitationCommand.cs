using System.Threading;
using System.Threading.Tasks;
using MediatR;

namespace AssetHub.Application.Auth.Commands;

public record RegisterViaInvitationCommand(string InvitationToken, string Password, string FullName) : IRequest<bool>;

public class RegisterViaInvitationCommandHandler : IRequestHandler<RegisterViaInvitationCommand, bool>
{
    public Task<bool> Handle(RegisterViaInvitationCommand request, CancellationToken cancellationToken)
    {
        // TODO: Create user, link roles, mark invitation as accepted.
        return Task.FromResult(true);
    }
}
