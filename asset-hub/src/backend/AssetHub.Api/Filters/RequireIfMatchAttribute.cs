using System;
using System.Threading.Tasks;
using AssetHub.Api.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace AssetHub.Api.Filters;

/// <summary>
/// Exige el header <c>If-Match</c> en endpoints de escritura sobre recursos versionados.
///
/// Sin esto, "actualizar" es en realidad "sobrescribir con lo último que llegó": el
/// cliente offline que estuvo tres horas sin red pisa sin enterarse el trabajo de otro.
/// El costo de exigirlo es que el cliente tiene que mandar la versión; el costo de no
/// exigirlo es pérdida silenciosa de datos.
///
/// Códigos:
/// <list type="bullet">
///   <item><c>428 precondition_required</c> — falta el header.</item>
///   <item><c>400 invalid_if_match</c> — el header está mal formado.</item>
/// </list>
///
/// El valor decodificado queda en <c>HttpContext.Items</c> y el controller lo pasa al
/// command. La comparación real vive en el handler, que sí conoce el estado actual.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class RequireIfMatchAttribute : Attribute, IAsyncActionFilter
{
    public const string ItemKey = "AssetHub.IfMatch";

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var result = ETagHelper.Parse(context.HttpContext.Request.Headers.IfMatch.ToString());

        switch (result.Kind)
        {
            case IfMatchKind.Missing:
                context.Result = Problem(
                    StatusCodes.Status428PreconditionRequired,
                    "precondition_required",
                    "If-Match header required",
                    "This operation requires an If-Match header with the ETag of the version you are updating.");
                return;

            case IfMatchKind.Invalid:
                context.Result = Problem(
                    StatusCodes.Status400BadRequest,
                    "invalid_if_match",
                    "Invalid If-Match header",
                    result.Error);
                return;

            default:
                context.HttpContext.Items[ItemKey] = result;
                break;
        }

        await next();
    }

    /// <summary>
    /// Versión esperada por el cliente. <c>null</c> para <c>If-Match: *</c> ("cualquier
    /// versión vigente") — quien llama decide si ese caso es aceptable.
    /// </summary>
    public static byte[]? GetExpectedVersion(HttpContext context)
        => context.Items.TryGetValue(ItemKey, out var value) && value is IfMatchResult result
            ? result.Version
            : null;

    private static ObjectResult Problem(int status, string code, string title, string? detail)
    {
        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
            Type = "https://assethub.app/docs/errors/" + code,
        };

        problem.Extensions["code"] = code;

        return new ObjectResult(problem)
        {
            StatusCode = status,
            ContentTypes = { "application/problem+json" },
        };
    }
}
