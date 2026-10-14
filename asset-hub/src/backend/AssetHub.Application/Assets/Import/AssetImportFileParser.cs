using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClosedXML.Excel;

namespace AssetHub.Application.Assets.Import;

/// <summary>
/// Parsea archivos de importación (.csv / .xlsx) a headers + filas.
/// Los headers se normalizan con Trim. Las filas se indexan desde 1 (primera fila de datos = 1).
/// </summary>
public static class AssetImportFileParser
{
    public static async Task<(List<string> Headers, List<Dictionary<string, string?>> Rows)> ParseAsync(
        Stream stream,
        string fileName,
        CancellationToken cancellationToken = default)
    {
        var ext = Path.GetExtension(fileName ?? string.Empty).ToLowerInvariant();
        return ext switch
        {
            ".csv" => await ParseCsvAsync(stream, cancellationToken),
            ".xlsx" or ".xls" => ParseXlsx(stream),
            _ => throw new InvalidDataException($"Extensión de archivo no soportada: '{ext}'. Use .csv o .xlsx.")
        };
    }

    private static (List<string> Headers, List<Dictionary<string, string?>> Rows) ParseXlsx(Stream stream)
    {
        try
        {
            using var workbook = new XLWorkbook(stream);
            var worksheet = workbook.Worksheets.FirstOrDefault(w =>
                    string.Equals(w.Name, "Activos", StringComparison.OrdinalIgnoreCase))
                ?? workbook.Worksheets.FirstOrDefault()
                ?? throw new InvalidDataException("El archivo xlsx no contiene hojas.");

            var headerCells = worksheet.FirstRowUsed()?.CellsUsed().ToList()
                ?? throw new InvalidDataException("El archivo no contiene encabezados.");
            var headers = headerCells.Select(c => c.GetString().Trim()).ToList();
            if (headers.All(string.IsNullOrWhiteSpace))
                throw new InvalidDataException("El archivo no contiene encabezados.");

            var lastRow = worksheet.LastRowUsed()?.RowNumber() ?? 1;
            var rows = new List<Dictionary<string, string?>>();
            for (var r = 2; r <= lastRow; r++)
            {
                var values = new string?[headers.Count];
                var allEmpty = true;
                for (var c = 0; c < headers.Count; c++)
                {
                    var v = worksheet.Cell(r, c + 1).GetString();
                    values[c] = string.IsNullOrWhiteSpace(v) ? null : v;
                    if (values[c] != null) allEmpty = false;
                }
                if (allEmpty) continue;
                var dict = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
                for (var c = 0; c < headers.Count; c++)
                    dict[headers[c]] = values[c];
                rows.Add(dict);
            }

            return (headers, rows);
        }
        catch (InvalidDataException)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"No se pudo leer el archivo xlsx: {ex.Message}", ex);
        }
    }

    private static async Task<(List<string> Headers, List<Dictionary<string, string?>> Rows)> ParseCsvAsync(
        Stream stream,
        CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: true);
        var content = await reader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(content))
            throw new InvalidDataException("El archivo CSV está vacío.");

        var delimiter = DetectDelimiter(content);
        var records = SplitRecords(content, delimiter);
        if (records.Count == 0 || records[0].All(string.IsNullOrWhiteSpace))
            throw new InvalidDataException("El archivo CSV no contiene encabezados.");

        var headers = records[0].Select(h => (h ?? string.Empty).Trim()).ToList();
        var rows = new List<Dictionary<string, string?>>();
        for (var i = 1; i < records.Count; i++)
        {
            var fields = records[i];
            if (fields.All(string.IsNullOrWhiteSpace)) continue;
            var dict = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            for (var c = 0; c < headers.Count; c++)
            {
                var v = c < fields.Count ? fields[c] : null;
                dict[headers[c]] = string.IsNullOrWhiteSpace(v) ? null : v;
            }
            rows.Add(dict);
        }

        return (headers, rows);
    }

    private static char DetectDelimiter(string content)
    {
        var firstLineEnd = content.IndexOfAny(new[] { '\r', '\n' });
        var firstLine = firstLineEnd < 0 ? content : content.Substring(0, firstLineEnd);
        var commas = firstLine.Count(c => c == ',');
        var semicolons = firstLine.Count(c => c == ';');
        if (semicolons > commas) return ';';
        return ',';
    }

    private static List<List<string?>> SplitRecords(string content, char delimiter)
    {
        var records = new List<List<string?>>();
        var current = new List<string?>();
        var field = new StringBuilder();
        var inQuotes = false;
        var fieldHasContent = false;

        void EndField()
        {
            current.Add(fieldHasContent || field.Length > 0 ? field.ToString() : null);
            field.Clear();
            fieldHasContent = false;
        }

        for (var i = 0; i < content.Length; i++)
        {
            var ch = content[i];
            if (inQuotes)
            {
                if (ch == '"')
                {
                    if (i + 1 < content.Length && content[i + 1] == '"')
                    {
                        field.Append('"');
                        fieldHasContent = true;
                        i++;
                    }
                    else
                    {
                        inQuotes = false;
                    }
                }
                else
                {
                    field.Append(ch);
                    if (!char.IsWhiteSpace(ch)) fieldHasContent = true;
                    else if (field.Length > 0) fieldHasContent = true;
                }
            }
            else if (ch == '"')
            {
                inQuotes = true;
                fieldHasContent = true;
            }
            else if (ch == delimiter)
            {
                EndField();
            }
            else if (ch == '\r' || ch == '\n')
            {
                EndField();
                records.Add(current);
                current = new List<string?>();
                if (ch == '\r' && i + 1 < content.Length && content[i + 1] == '\n') i++;
            }
            else
            {
                field.Append(ch);
                if (!char.IsWhiteSpace(ch)) fieldHasContent = true;
                else if (field.Length > 0 && field.ToString().Trim().Length > 0) fieldHasContent = true;
            }
        }
        EndField();
        records.Add(current);

        return records;
    }
}
