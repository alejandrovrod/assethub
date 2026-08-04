using System;
using System.Text.Json;
using System.Threading.Tasks;
using AssetHub.Domain.Exceptions;
using Microsoft.AspNetCore.Http;

namespace AssetHub.Api.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;

    public ExceptionHandlingMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (DomainException ex)
        {
            context.Response.ContentType = "application/problem+json";
            
            int statusCode = StatusCodes.Status400BadRequest;
            if (ex is PlanLimitExceededException) statusCode = StatusCodes.Status402PaymentRequired;
            if (ex is ModuleNotEnabledException) statusCode = StatusCodes.Status403Forbidden;

            context.Response.StatusCode = statusCode;

            var problem = new
            {
                type = "https://assethub.app/docs/errors/" + ex.Code,
                title = ex.Message,
                status = statusCode,
                code = ex.Code
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(problem));
        }
        catch (Exception ex)
        {
            // Log real va aqui
            context.Response.ContentType = "application/problem+json";
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            var detail = ex.Message;
            if (ex.InnerException != null)
            {
                detail += " Inner: " + ex.InnerException.Message;
            }
            var result = JsonSerializer.Serialize(new { title = "Ocurrió un error interno en el servidor.", status = 500, detail = detail });
            await context.Response.WriteAsync(result);
        }
    }
}
