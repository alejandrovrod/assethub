using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using AssetHub.Api.Http;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Application.Resources;
using AssetHub.Domain.Exceptions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;

namespace AssetHub.Api.Middleware;

/// <summary>
/// Turns unhandled exceptions into RFC 7807 problem+json responses whose
/// <c>title</c>/<c>detail</c> are resolved from the shared message catalog using
/// the culture of the current request (set by UseRequestLocalization from the
/// Accept-Language header).
///
/// Resolution rules:
/// <list type="bullet">
///   <item><see cref="DomainException"/> → its <c>ResourceKey</c> (+ args) when present, otherwise <c>Message</c>.</item>
///   <item>Any other exception → <c>Message</c>, unless the message happens to be a
///   catalog key, in which case the catalog wins. That convention lets throw sites
///   localize by throwing the key instead of a hardcoded sentence.</item>
/// </list>
/// </summary>
public class ExceptionHandlingMiddleware
{
    private const string DocsBase = "https://assethub.app/docs/errors/";

    private readonly RequestDelegate _next;
    private readonly IStringLocalizer<SharedResource> _localizer;

    public ExceptionHandlingMiddleware(RequestDelegate next, IStringLocalizer<SharedResource> localizer)
    {
        _next = next;
        _localizer = localizer;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (InsufficientStockException ex)
        {
            // 409, no 422: el payload es válido y la regla se respetó; lo que falta son
            // unidades. El cliente no debe corregir el request ni reintentarlo igual:
            // debe resolver con las alternativas o pedir menos cantidad.
            await WriteProblemAsync(
                context,
                StatusCodes.Status409Conflict,
                "insufficient_stock",
                Title("Error_InsufficientStock", "There is not enough stock for this operation."),
                ex.Code,
                detail: Localize(null, ex.Message, null),
                errors: null,
                extensions: new Dictionary<string, object?>
                {
                    ["available"] = ex.Available,
                    ["requested"] = ex.Requested,
                    ["alternatives"] = ex.Alternatives
                        .Select(a => new
                        {
                            warehouseId = a.WarehouseId,
                            warehouseName = a.WarehouseName,
                            catalogItemId = a.CatalogItemId,
                            quantityOnHand = a.QuantityOnHand,
                        })
                        .ToList(),
                });
        }
        catch (InvalidTransitionException ex)
        {
            // 409 con contexto, no 422: el cliente offline necesita `allowedTransitions`
            // para corregir el intento sin releer el recurso. Va antes que DomainException
            // porque hereda de ella.
            await WriteProblemAsync(
                context,
                StatusCodes.Status409Conflict,
                "invalid_transition",
                Title("Error_InvalidTransition", "The resource cannot move to that state."),
                ex.Code,
                detail: Localize(ex.ResourceKey, ex.Message, ex.Args),
                errors: null,
                extensions: new Dictionary<string, object?>
                {
                    ["currentState"] = ex.CurrentState,
                    ["allowedTransitions"] = ex.AllowedTransitions.ToList(),
                });
        }
        catch (DomainException ex)
        {
            // ValidationException is a DomainException: handle it first so its
            // field errors are surfaced alongside the localized summary.
            if (ex is ValidationException validation)
            {
                await WriteProblemAsync(
                    context,
                    StatusCodes.Status400BadRequest,
                    "validation",
                    Title("Error_Validation", "The submitted data is not valid."),
                    validation.Code,
                    detail: JoinErrors(validation),
                    errors: validation.Errors);
                return;
            }

            await WriteProblemAsync(
                context,
                GetStatusCode(ex),
                ex.Code,
                Localize(ex.ResourceKey, ex.Message, ex.Args),
                ex.Code,
                detail: null,
                errors: null);
        }
        catch (ConcurrencyException ex)
        {
            // 412, no 422: el request era válido cuando el cliente lo armó; lo que falló
            // es la base sobre la que se armó (la versión). El cliente reintenta después
            // de reconciliar, no corrige el payload.
            if (!string.IsNullOrEmpty(ex.CurrentETag))
            {
                context.Response.Headers.ETag = ETagHelper.ToHeader(ex.CurrentETag);
            }

            await WriteProblemAsync(
                context,
                StatusCodes.Status412PreconditionFailed,
                "concurrency",
                Title("Error_Concurrency", "The resource changed since you last read it."),
                ex.Code,
                detail: Localize(null, ex.Message, null),
                errors: null,
                extensions: BuildConcurrencyExtensions(ex));
        }
        catch (DbUpdateConcurrencyException)
        {
            // Red de seguridad: el UPDATE afectó 0 filas porque la versión cambió entre
            // el SELECT y el UPDATE del propio handler. No hay estado actual cargado
            // confiable, así que el payload es mínimo y el cliente relee.
            await WriteProblemAsync(
                context,
                StatusCodes.Status412PreconditionFailed,
                "concurrency",
                Title("Error_Concurrency", "The resource changed since you last read it."),
                ConcurrencyException.ErrorCode,
                detail: Title("Error_ConcurrencyRetry", "Reload the resource and retry the operation."),
                errors: null);
        }
        catch (ChecklistValidationException ex)
        {
            await WriteProblemAsync(
                context,
                StatusCodes.Status422UnprocessableEntity,
                "checklist_validation",
                Title("Error_ChecklistValidation", "The checklist response does not match its schema."),
                ex.Code,
                detail: Localize(null, ex.Message, null),
                errors: null,
                extensions: new Dictionary<string, object?>
                {
                    ["fieldErrors"] = ex.FieldErrors
                        .Select(e => new { field = e.Field, message = e.Message })
                        .ToList(),
                });
        }
        catch (InvalidFieldAppSettingsException ex)
        {
            // 422, no 400: el request del técnico es válido; lo que está mal es la política
            // del tenant. El cliente no debe reintentar ni corregir nada: el arreglo es de
            // configuración, y `offlineLeaseHours` le dice a quien administra qué número
            // corregir sin abrir la base.
            await WriteProblemAsync(
                context,
                StatusCodes.Status422UnprocessableEntity,
                "field_app_settings",
                Title("Error_InvalidFieldAppSettings", "The field app policy of this tenant is not valid."),
                ex.Code,
                detail: Localize(ex.ResourceKey, ex.Message, ex.Args),
                errors: null,
                extensions: new Dictionary<string, object?>
                {
                    ["offlineLeaseHours"] = ex.OfflineLeaseHours,
                    ["minOfflineLeaseHours"] = ex.Min,
                    ["maxOfflineLeaseHours"] = ex.Max,
                });
        }
        catch (InvalidOperationException ex) when (!ex.Message.Contains("A second operation"))
        {
            // Domain-rule violations thrown by command handlers (e.g. invalid
            // state transitions, missing required data). Client error, not failure.
            await WriteProblemAsync(
                context,
                StatusCodes.Status422UnprocessableEntity,
                "domain_rule",
                Title("Error_DomainRule", "The request does not comply with the business rules."),
                code: null,
                detail: Localize(null, ex.Message, null),
                errors: null);
        }
        catch (ArgumentException ex)
        {
            await WriteProblemAsync(
                context,
                StatusCodes.Status400BadRequest,
                "validation",
                Title("Error_Validation", "The submitted data is not valid."),
                code: null,
                detail: Localize(null, ex.Message, null),
                errors: null);
        }
        catch (UnauthorizedAccessException ex)
        {
            // Mapped to 403 (not 401) on purpose: in this codebase it signals a
            // missing/invalid tenant or missing permission on an already
            // authenticated request. Returning 401 would trigger the SPA's
            // automatic logout-on-401 interceptor.
            await WriteProblemAsync(
                context,
                StatusCodes.Status403Forbidden,
                "forbidden",
                Title("Error_Forbidden", "You do not have permission to perform this action."),
                code: null,
                detail: Localize(null, ex.Message, null),
                errors: null);
        }
        catch (Exception ex)
        {
            await WriteProblemAsync(
                context,
                StatusCodes.Status500InternalServerError,
                "internal_error",
                Title("Error_InternalServerError", "An internal server error occurred."),
                code: null,
                // Intentionally kept: existing clients surface `detail`. Replace with a
                // sanitized message once server-side logging is wired to a sink.
                detail: BuildInternalDetail(ex),
                errors: null);
        }
    }

    private static IReadOnlyDictionary<string, object?>? BuildConcurrencyExtensions(ConcurrencyException ex)
    {
        var extensions = new Dictionary<string, object?>();

        if (!string.IsNullOrEmpty(ex.CurrentState))
        {
            extensions["currentState"] = ex.CurrentState;
        }

        if (ex.AllowedTransitions is { Count: > 0 })
        {
            extensions["allowedTransitions"] = ex.AllowedTransitions;
        }

        if (!string.IsNullOrEmpty(ex.CurrentETag))
        {
            extensions["currentETag"] = ex.CurrentETag;
        }

        return extensions.Count == 0 ? null : extensions;
    }

    private static int GetStatusCode(DomainException ex) => ex switch
    {
        PlanLimitExceededException => StatusCodes.Status402PaymentRequired,
        ModuleNotEnabledException => StatusCodes.Status403Forbidden,
        NotFoundException => StatusCodes.Status404NotFound,
        ValidationException => StatusCodes.Status400BadRequest,
        InvalidTransitionException => StatusCodes.Status409Conflict,
        ConflictException => StatusCodes.Status409Conflict,
        AssetTemplateInUseException => StatusCodes.Status409Conflict,
        BusinessEntityTypeInUseException => StatusCodes.Status409Conflict,
        _ => StatusCodes.Status400BadRequest
    };

    private async Task WriteProblemAsync(
        HttpContext context,
        int statusCode,
        string type,
        string title,
        string? code,
        string? detail,
        IReadOnlyDictionary<string, string[]>? errors,
        IReadOnlyDictionary<string, object?>? extensions = null)
    {
        // Deliberately not calling Response.Clear(): it would wipe the
        // Content-Language header that UseRequestLocalization already set.
        context.Response.ContentType = "application/problem+json; charset=utf-8";
        context.Response.StatusCode = statusCode;

        var problem = new Dictionary<string, object?>
        {
            ["type"] = DocsBase + type,
            ["title"] = title,
            ["status"] = statusCode
        };

        if (code is not null) problem["code"] = code;
        if (!string.IsNullOrEmpty(detail)) problem["detail"] = detail;
        if (errors is { Count: > 0 }) problem["errors"] = errors;
        if (extensions is { Count: > 0 })
        {
            foreach (var (key, value) in extensions)
            {
                if (value is not null)
                {
                    problem[key] = value;
                }
            }
        }

        await context.Response.WriteAsync(JsonSerializer.Serialize(problem, JsonOptions));
    }

    /// <summary>
    /// The stock System.Text.Json encoder turns accents and apostrophes into
    /// \uXXXX sequences. Bodies are consumed as JSON (never inlined into HTML),
    /// so relaxed escaping keeps the messages human-readable on the wire.
    /// </summary>
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private string Title(string key, string fallback) => Localize(key, fallback, null);

    /// <summary>
    /// Resolves <paramref name="key"/> from the shared catalog for the culture of
    /// the current request; falls back to <paramref name="fallback"/> when the key
    /// has no entry yet.
    /// </summary>
    private string Localize(string? key, string fallback, object[]? args)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return ResolveMessage(fallback);
        }

        var localized = _localizer[key];
        if (localized.ResourceNotFound)
        {
            return fallback;
        }

        return Format(localized.Value, args);
    }

    /// <summary>
    /// Convention-based resolution: a thrown message that is a catalog key is
    /// replaced by its localized value, otherwise it is returned untouched.
    /// </summary>
    private string ResolveMessage(string? message)
    {
        if (string.IsNullOrWhiteSpace(message)) return message ?? string.Empty;

        var localized = _localizer[message];
        return localized.ResourceNotFound ? message : localized.Value;
    }

    private static string Format(string template, object[]? args)
    {
        if (args is not { Length: > 0 }) return template;
        try
        {
            return string.Format(System.Globalization.CultureInfo.CurrentCulture, template, args);
        }
        catch (FormatException)
        {
            // A malformed catalog entry must never mask the original error.
            return template;
        }
    }

    private string JoinErrors(ValidationException validation)
    {
        var messages = validation.AllMessages().Select(m => Localize(null, m, null)).ToList();
        return messages.Count == 0
            ? Title("Error_Validation", "The submitted data is not valid.")
            : string.Join(" ", messages);
    }

    private static string BuildInternalDetail(Exception ex)
    {
        var detail = ex.Message;
        if (ex.InnerException is not null)
        {
            detail += " Inner: " + ex.InnerException.Message;
        }

        return detail;
    }
}
