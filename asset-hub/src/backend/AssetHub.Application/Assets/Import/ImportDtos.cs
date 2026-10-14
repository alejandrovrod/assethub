using System;
using System.Collections.Generic;
using System.Text.Json;

namespace AssetHub.Application.Assets.Import;

public record ImportRowError(int RowNumber, string Code, string? Field, string Message);

public record ImportRowPreview(
    int RowNumber,
    string Code,
    string Name,
    string State,
    string? ParentCode,
    Dictionary<string, JsonElement> Properties);

public record ImportValidationResult(
    int TotalRows,
    int ValidRows,
    int InvalidRows,
    bool HasErrors,
    List<ImportRowError> Errors,
    List<ImportRowPreview> Preview);

public record ImportExecutionResult(
    bool Success,
    int TotalProcessed,
    int ImportedCount,
    int FailedCount,
    List<Guid> ImportedAssetIds);

public class ImportValidationException : Exception
{
    public ImportValidationResult Result { get; }

    public ImportValidationException(ImportValidationResult result)
        : base("La validación de importación contiene errores.")
    {
        Result = result;
    }
}
