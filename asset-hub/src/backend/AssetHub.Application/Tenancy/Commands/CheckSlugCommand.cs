using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using MediatR;

namespace AssetHub.Application.Tenancy.Commands;

public record CheckSlugCommand(string Slug) : IRequest<CheckSlugResult>;

public record CheckSlugResult(bool Available);

public class CheckSlugCommandHandler : IRequestHandler<CheckSlugCommand, CheckSlugResult>
{
    private static readonly Regex SlugRegex = new(@"^[a-z0-9][a-z0-9-]{2,62}$", RegexOptions.Compiled);
    private static readonly string[] ReservedSlugs = { "www", "api", "app", "admin", "support" };

    public Task<CheckSlugResult> Handle(CheckSlugCommand request, CancellationToken cancellationToken)
    {
        var slug = request.Slug?.ToLowerInvariant() ?? string.Empty;

        if (!SlugRegex.IsMatch(slug))
        {
            return Task.FromResult(new CheckSlugResult(false));
        }

        if (Array.Exists(ReservedSlugs, rs => rs == slug))
        {
            return Task.FromResult(new CheckSlugResult(false));
        }

        // TODO: Inyectar DbContext y verificar contra DB si el slug ya existe.
        // Por ahora retornamos true.
        return Task.FromResult(new CheckSlugResult(true));
    }
}
