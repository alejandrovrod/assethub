using System;
using System.Collections.Generic;

namespace AssetHub.Application.Common.Exceptions;

/// <summary>
/// La respuesta del técnico no valida contra el <c>schemaJson</c> del checklist.
///
/// Se mapea a <c>422</c> (no <c>400</c>) por la misma razón que
/// <see cref="ValidationException"/>: el JSON está bien formado y el request es
/// procesable; lo que no cumple es el contrato del formulario. Devuelve
/// <c>fieldErrors</c> en vez de un mapa <c>errors</c> porque el cliente necesita
/// pintar el error junto al ítem (<c>field</c> = <c>item_3</c>) y el contrato de la PWA
/// ya define ese shape.
/// </summary>
public class ChecklistValidationException : Exception
{
    public const string ErrorCode = "checklist_validation_failed";

    public ChecklistValidationException(IReadOnlyList<ChecklistFieldError> fieldErrors)
        : base("The checklist response does not match its schema.")
    {
        FieldErrors = fieldErrors;
    }

    public string Code => ErrorCode;

    public IReadOnlyList<ChecklistFieldError> FieldErrors { get; }
}

/// <summary>
/// Un error de validación anclado a un campo del formulario.
/// <paramref name="Field"/> es la clave del esquema (<c>item_0</c>) o
/// <c>responseJson</c> si el problema es el cuerpo entero.
/// </summary>
public sealed record ChecklistFieldError(string Field, string Message);
