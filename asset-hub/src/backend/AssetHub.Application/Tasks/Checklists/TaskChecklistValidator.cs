using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Common.Exceptions;
using NJsonSchema;
using NJsonSchema.Validation;

namespace AssetHub.Application.Tasks.Checklists;

/// <summary>
/// Valida la respuesta del técnico contra el snapshot <c>schemaJson</c> del checklist.
///
/// La validación es server-side y no negociable: el cliente valida con Ajv para dar
/// feedback inmediato, pero un cliente offline puede estar desactualizado (o haber sido
/// modificado). El servidor no confía en que el form haya validado nada.
/// </summary>
public static class TaskChecklistValidator
{
    /// <summary>
    /// Devuelve la lista de errores por campo; vacía si la respuesta es válida.
    /// No lanza por datos del cliente: los errores se devuelven para que el handler
    /// decida el código HTTP.
    /// </summary>
    public static async Task<IReadOnlyList<ChecklistFieldError>> ValidateAsync(
        string schemaJson,
        string responseJson,
        CancellationToken cancellationToken = default)
    {
        if (!TryCanonicalizeObject(responseJson, out var canonical, out var parseError))
        {
            return new[] { new ChecklistFieldError("responseJson", parseError!) };
        }

        // Un snapshot corrupto es un bug del servidor, no del cliente: se deja
        // explotar (500) en vez de disfrazarlo de 422 y culpar al técnico.
        var schema = await JsonSchema.FromJsonAsync(schemaJson, cancellationToken);

        var errors = schema.Validate(canonical!);
        if (errors.Count == 0)
        {
            return Array.Empty<ChecklistFieldError>();
        }

        var result = new List<ChecklistFieldError>(errors.Count);
        var seen = new HashSet<string>(StringComparer.Ordinal);

        foreach (var error in errors)
        {
            var field = ResolveField(error);
            var message = Describe(error.Kind);

            // NJsonSchema puede reportar el mismo problema por dos caminos
            // (allOf/anyOf o required + property): al cliente le sirve uno.
            if (seen.Add(field + "\u0000" + message))
            {
                result.Add(new ChecklistFieldError(field, message));
            }
        }

        return result;
    }

    /// <summary>
    /// Devuelve el JSON ya parseado y re-serializado sin indentación. Se valida y se
    /// persiste esa forma canónica: dos payloads semánticamente iguales se guardan
    /// idénticos, y el texto guardado no depende de cómo lo formateó el cliente.
    /// </summary>
    public static bool TryCanonicalizeObject(string? json, out string? canonical, out string? error)
    {
        canonical = null;
        error = null;

        if (string.IsNullOrWhiteSpace(json))
        {
            error = "The response is required.";
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                error = "The response must be a JSON object.";
                return false;
            }

            canonical = JsonSerializer.Serialize(document.RootElement, CanonicalOptions);
            return true;
        }
        catch (JsonException)
        {
            error = "The response is not valid JSON.";
            return false;
        }
    }

    private static readonly JsonSerializerOptions CanonicalOptions = new()
    {
        WriteIndented = false,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>
    /// El campo es la clave del esquema (<c>item_3</c>). NJsonSchema entrega el camino
    /// como JSON Pointer (<c>#/item_3</c>) y, en algunos errores de objeto, sólo
    /// <see cref="ValidationError.Property"/>.
    /// </summary>
    private static string ResolveField(ValidationError error)
    {
        var path = error.Path;

        if (!string.IsNullOrWhiteSpace(path) && path is not "#" and not "#/")
        {
            var pointer = path!.StartsWith("#/", StringComparison.Ordinal) ? path[2..] : path.TrimStart('#', '/');
            if (pointer.Length > 0)
            {
                return UnescapePointer(pointer);
            }
        }

        return string.IsNullOrWhiteSpace(error.Property) ? "responseJson" : error.Property!;
    }

    private static string UnescapePointer(string pointer)
        => pointer.Replace("~1", "/").Replace("~0", "~");

    private static string Describe(ValidationErrorKind kind) => kind switch
    {
        ValidationErrorKind.PropertyRequired => "This field is required.",
        ValidationErrorKind.BooleanExpected => "Expected true or false.",
        ValidationErrorKind.NoAdditionalPropertiesAllowed => "Unknown field for this checklist.",
        ValidationErrorKind.ObjectExpected => "Expected an object.",
        ValidationErrorKind.StringExpected => "Expected a string.",
        ValidationErrorKind.NumberExpected => "Expected a number.",
        ValidationErrorKind.IntegerExpected => "Expected an integer.",
        ValidationErrorKind.ArrayExpected => "Expected an array.",
        ValidationErrorKind.NullExpected => "Expected null.",
        ValidationErrorKind.NotInEnumeration => "Value is not one of the allowed options.",
        ValidationErrorKind.StringTooShort => "Value is too short.",
        ValidationErrorKind.StringTooLong => "Value is too long.",
        ValidationErrorKind.PatternMismatch => "Value does not match the required pattern.",
        _ => "Value does not match the checklist schema.",
    };
}
