using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using ClosedXML.Excel;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Assets.Import;

public record DownloadImportTemplateQuery(Guid AssetTemplateId, string Format)
    : IRequest<(byte[] Content, string ContentType, string FileName)>;

public class DownloadImportTemplateQueryHandler
    : IRequestHandler<DownloadImportTemplateQuery, (byte[] Content, string ContentType, string FileName)>
{
    private sealed record ColumnHeaderDef(string DisplayHeader, string CanonicalField, string? Description, bool IsRequired);

    private static readonly List<ColumnHeaderDef> FixedHeadersDef = new()
    {
        new("Código *", "Code", "Requerido. Identificador único del activo en el tenant.", true),
        new("Nombre del Activo *", "Name", "Requerido. Nombre descriptivo del activo.", true),
        new("Código Activo Padre", "ParentCode", "Opcional. Código del activo padre (debe existir en la base de datos o en una fila previa).", false),
        new("Estado Inicial", "State", "Opcional. Si se omite se asigna el estado inicial del ciclo de vida.", false),
        new("Fecha de Instalación (AAAA-MM-DD)", "InstalledAt", "Opcional. Formato recomendado: AAAA-MM-DD (ej: 2024-05-15). También admite DD/MM/AAAA.", false),
        new("Fecha Puesta en Marcha (AAAA-MM-DD)", "CommissionedAt", "Opcional. Formato recomendado: AAAA-MM-DD (ej: 2024-06-01). Debe ser >= Fecha de Instalación.", false),
        new("Índice de Condición", "ConditionIndex", "Opcional. Valor numérico de 0 a 100.", false),
        new("Latitud", "Latitude", "Opcional. Coordenada WGS84 (-90 a 90).", false),
        new("Longitud", "Longitude", "Opcional. Coordenada WGS84 (-180 a 180).", false)
    };

    private readonly ITenantDbContext _db;
    private readonly ITenantResolver _tenantResolver;

    public DownloadImportTemplateQueryHandler(ITenantDbContext db, ITenantResolver tenantResolver)
    {
        _db = db;
        _tenantResolver = tenantResolver;
    }

    public async Task<(byte[] Content, string ContentType, string FileName)> Handle(
        DownloadImportTemplateQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantResolver.GetCurrentTenantId()
            ?? throw new UnauthorizedAccessException("Tenant no resuelto.");

        var template = await _db.AssetTemplates
            .FirstOrDefaultAsync(t => t.Id == request.AssetTemplateId
                && (t.TenantId == tenantId || t.TenantId == null)
                && t.IsActive, cancellationToken);
        if (template == null)
            throw new KeyNotFoundException("Plantilla no encontrada o inactiva.");

        var format = (request.Format ?? "xlsx").Trim().ToLowerInvariant();
        var (schemaProps, schemaRequired) = ImportSchemaHelper.Parse(template.SchemaJson);

        var columns = new List<ColumnHeaderDef>(FixedHeadersDef);
        foreach (var prop in schemaProps.Values.OrderBy(p => p.Title ?? p.Name, StringComparer.OrdinalIgnoreCase))
        {
            var isReq = schemaRequired.Contains(prop.Name);
            var title = !string.IsNullOrWhiteSpace(prop.Title) ? prop.Title : prop.Name;
            var display = isReq ? $"{title} *" : title;
            var desc = $"Campo dinámico '{prop.Name}' ({string.Join("/", prop.Types)}). {(isReq ? "Requerido." : "Opcional.")}";
            columns.Add(new ColumnHeaderDef(display, prop.Name, desc, isReq));
        }

        var fileBase = "plantilla_" + SanitizeFileName(string.IsNullOrWhiteSpace(template.Code) ? template.Id.ToString("N") : template.Code);

        // Obtener ítems de catálogos necesarios para las columnas dinámicas
        var catalogCodes = schemaProps.Values
            .Where(p => !string.IsNullOrWhiteSpace(p.CatalogCode))
            .Select(p => p.CatalogCode!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var catalogData = new Dictionary<string, List<(string Code, string Label)>>(StringComparer.OrdinalIgnoreCase);
        if (catalogCodes.Count > 0)
        {
            var catalogs = await _db.Catalogs
                .Where(c => catalogCodes.Contains(c.Code) && (c.TenantId == tenantId || c.TenantId == null))
                .Select(c => new { c.Id, c.Code })
                .ToListAsync(cancellationToken);

            var catIds = catalogs.Select(c => c.Id).ToList();
            if (catIds.Count > 0)
            {
                var items = await _db.CatalogItems
                    .Include(ci => ci.Translations)
                    .Where(ci => catIds.Contains(ci.CatalogId) && !ci.IsDeleted && (ci.TenantId == tenantId || ci.TenantId == null))
                    .ToListAsync(cancellationToken);

                foreach (var cat in catalogs)
                {
                    var catItems = items
                        .Where(i => i.CatalogId == cat.Id)
                        .OrderBy(i => i.Order)
                        .ThenBy(i => i.Code)
                        .Select(i => (
                            Code: i.Code,
                            Label: i.Translations.FirstOrDefault(t => !string.IsNullOrWhiteSpace(t.Label))?.Label ?? i.Code
                        ))
                        .ToList();

                    catalogData[cat.Code] = catItems;
                }
            }
        }

        return format switch
        {
            "xlsx" => (BuildXlsx(columns, schemaProps, template.LifecycleStates.States.Keys.ToList(), catalogData), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileBase + ".xlsx"),
            "csv" => (BuildCsv(columns.Select(c => c.DisplayHeader).ToList()), "text/csv", fileBase + ".csv"),
            _ => throw new ArgumentException($"Formato no soportado: '{request.Format}'. Use xlsx o csv.", nameof(request.Format))
        };
    }

    private static byte[] BuildXlsx(
        List<ColumnHeaderDef> columns,
        Dictionary<string, SchemaPropertyInfo> schemaProps,
        List<string> states,
        Dictionary<string, List<(string Code, string Label)>> catalogData)
    {
        using var workbook = new XLWorkbook();
        var ws = workbook.AddWorksheet("Activos");

        // Hoja auxiliar de Catálogos si existen catálogos cargados
        IXLWorksheet? wsCatalogs = null;
        var catalogColumnRanges = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        if (catalogData.Count > 0)
        {
            wsCatalogs = workbook.AddWorksheet("Catalogos");
            var colIdx = 1;
            foreach (var kvp in catalogData.OrderBy(k => k.Key))
            {
                var catCode = kvp.Key;
                var items = kvp.Value;
                if (items.Count == 0) continue;

                // Encabezados: [Código (catCode), Descripción / Etiqueta]
                var headerCode = wsCatalogs.Cell(1, colIdx);
                headerCode.Value = $"{catCode} (Código)";
                headerCode.Style.Font.Bold = true;
                headerCode.Style.Fill.BackgroundColor = XLColor.FromHtml("#E2E8F0");

                var headerLabel = wsCatalogs.Cell(1, colIdx + 1);
                headerLabel.Value = $"{catCode} (Etiqueta)";
                headerLabel.Style.Font.Bold = true;
                headerLabel.Style.Fill.BackgroundColor = XLColor.FromHtml("#F1F5F9");

                for (var r = 0; r < items.Count; r++)
                {
                    wsCatalogs.Cell(r + 2, colIdx).Value = items[r].Code;
                    wsCatalogs.Cell(r + 2, colIdx + 1).Value = items[r].Label;
                }

                // Guardar rango de códigos para la lista de validación (ej. Catalogos!$A$2:$A$15)
                var colLetter = wsCatalogs.Column(colIdx).ColumnLetter();
                catalogColumnRanges[catCode] = $"Catalogos!${colLetter}$2:${colLetter}${items.Count + 1}";
                colIdx += 2; // Avanzar 2 columnas (código + etiqueta)
            }
            wsCatalogs.Columns().AdjustToContents();
        }

        for (var c = 0; c < columns.Count; c++)
        {
            var colDef = columns[c];
            var colIndex = c + 1;
            var cell = ws.Cell(1, colIndex);
            cell.Value = colDef.DisplayHeader;
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#F1F5F9");
            if (!string.IsNullOrWhiteSpace(colDef.Description))
            {
                cell.GetComment().AddText(colDef.Description);
            }

            // Aplicar validaciones de datos (Dropdowns) para las filas 2 a 1000
            var rowsRange = ws.Range(2, colIndex, 1000, colIndex);

            // Formato de celda para Fechas (ej: InstalledAt, CommissionedAt o dynamic date)
            var isDateField = colDef.CanonicalField.Equals("InstalledAt", StringComparison.OrdinalIgnoreCase) ||
                              colDef.CanonicalField.Equals("CommissionedAt", StringComparison.OrdinalIgnoreCase) ||
                              (schemaProps.TryGetValue(colDef.CanonicalField, out var dProp) &&
                               (string.Equals(dProp.Format, "date", StringComparison.OrdinalIgnoreCase) ||
                                string.Equals(dProp.Format, "date-time", StringComparison.OrdinalIgnoreCase)));

            if (isDateField)
            {
                rowsRange.Style.DateFormat.Format = "yyyy-mm-dd";
            }

            // 1. Estados
            if (colDef.CanonicalField.Equals("State", StringComparison.OrdinalIgnoreCase) && states.Count > 0)
            {
                var stateList = string.Join(",", states);
                if (stateList.Length <= 255)
                {
                    rowsRange.CreateDataValidation().List($"\"{stateList}\"", true);
                }
            }
            // 2. Propiedades dinámicas
            else if (schemaProps.TryGetValue(colDef.CanonicalField, out var propInfo))
            {
                // Enums estáticos
                if (propInfo.EnumOptions.Count > 0)
                {
                    var enumList = string.Join(",", propInfo.EnumOptions);
                    if (enumList.Length <= 255)
                    {
                        rowsRange.CreateDataValidation().List($"\"{enumList}\"", true);
                    }
                }
                // Catálogos dinámicos referenciando la hoja 'Catalogos'
                else if (!string.IsNullOrWhiteSpace(propInfo.CatalogCode) &&
                         catalogColumnRanges.TryGetValue(propInfo.CatalogCode, out var rangeFormula))
                {
                    rowsRange.CreateDataValidation().List(rangeFormula, true);
                }
            }
        }
        ws.SheetView.FreezeRows(1);
        ws.Columns().AdjustToContents();

        var help = workbook.AddWorksheet("Ayuda");
        help.Cell(1, 1).Value = "Columna Visible";
        help.Cell(1, 2).Value = "Nombre Técnico / Clave";
        help.Cell(1, 3).Value = "Descripción / Valores admitidos";
        help.Range(1, 1, 1, 3).Style.Font.Bold = true;
        help.Range(1, 1, 1, 3).Style.Fill.BackgroundColor = XLColor.FromHtml("#E2E8F0");
        
        var row = 2;
        foreach (var col in columns)
        {
            help.Cell(row, 1).Value = col.DisplayHeader;
            help.Cell(row, 2).Value = col.CanonicalField;

            string desc;
            if (col.CanonicalField.Equals("State", StringComparison.OrdinalIgnoreCase))
            {
                desc = "Opcional. Estados válidos: " + (states.Count > 0 ? string.Join(", ", states) : "(sin estados específicos)");
            }
            else if (schemaProps.TryGetValue(col.CanonicalField, out var pInfo))
            {
                if (pInfo.EnumOptions.Count > 0)
                {
                    desc = $"Lista estática. Opciones: {string.Join(", ", pInfo.EnumOptions)}.";
                }
                else if (!string.IsNullOrWhiteSpace(pInfo.CatalogCode))
                {
                    desc = $"Catálogo '{pInfo.CatalogCode}'. Puede ingresar el código o la etiqueta visible (consulte la hoja 'Catalogos').";
                }
                else if (string.Equals(pInfo.Format, "data-url", StringComparison.OrdinalIgnoreCase))
                {
                    desc = "Archivo / Imagen. Ingrese una URL accesible (http/https), ruta relativa del archivo o Base64 Data URI.";
                }
                else
                {
                    desc = col.Description ?? string.Empty;
                }
            }
            else
            {
                desc = col.Description ?? string.Empty;
            }

            help.Cell(row, 3).Value = desc;
            row++;
        }
        help.Columns().AdjustToContents();

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }

    private static byte[] BuildCsv(List<string> headers)
    {
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(",", headers.Select(EscapeCsv)));
        // Fila de ejemplo vacía (solo separadores).
        sb.AppendLine(string.Join(",", headers.Select(_ => string.Empty)));
        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    private static string EscapeCsv(string value)
    {
        if (value.Contains(',') || value.Contains('"') || value.Contains('\n'))
            return "\"" + value.Replace("\"", "\"\"") + "\"";
        return value;
    }

    private static string SanitizeFileName(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var sb = new StringBuilder();
        foreach (var ch in value.Trim().ToLowerInvariant())
            sb.Append(invalid.Contains(ch) || char.IsWhiteSpace(ch) ? '_' : ch);
        var result = sb.ToString().Trim('_');
        return string.IsNullOrWhiteSpace(result) ? "template" : result;
    }
}
