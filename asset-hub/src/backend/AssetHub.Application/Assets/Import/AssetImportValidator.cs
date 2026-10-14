using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Domain.AssetTemplates;
using Microsoft.EntityFrameworkCore;
using NJsonSchema;

namespace AssetHub.Application.Assets.Import;

public sealed class ParsedRow
{
    public int RowNumber { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? ParentCode { get; set; }
    public string State { get; set; } = string.Empty;
    public DateTime? InstalledAt { get; set; }
    public DateTime? CommissionedAt { get; set; }
    public decimal? ConditionIndex { get; set; }
    public double? Lat { get; set; }
    public double? Lon { get; set; }
    public string PropertiesJson { get; set; } = "{}";
    public DateTime EffectiveEventAt { get; set; }
}

internal sealed record SchemaPropertyInfo(
    string Name,
    string? Title,
    List<string> Types,
    string? ItemType,
    string? Format,
    string? CatalogCode,
    List<string> EnumOptions
);

internal static class ImportSchemaHelper
{
    public static (Dictionary<string, SchemaPropertyInfo> Properties, HashSet<string> Required) Parse(string? schemaJson)
    {
        var props = new Dictionary<string, SchemaPropertyInfo>(StringComparer.OrdinalIgnoreCase);
        var required = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(schemaJson)) return (props, required);

        try
        {
            using var doc = JsonDocument.Parse(schemaJson);
            var root = doc.RootElement;
            
            void ProcessProperty(string propName, JsonElement propVal)
            {
                var types = new List<string>();
                string? itemType = null;
                string? title = null;
                string? format = null;
                string? catalogCode = null;
                var enumOptions = new List<string>();

                if (propVal.ValueKind == JsonValueKind.Object)
                {
                    if (propVal.TryGetProperty("title", out var titleEl) && titleEl.ValueKind == JsonValueKind.String)
                    {
                        var t = titleEl.GetString();
                        if (!string.IsNullOrWhiteSpace(t)) title = t.Trim();
                    }
                    if (propVal.TryGetProperty("format", out var formatEl) && formatEl.ValueKind == JsonValueKind.String)
                    {
                        format = formatEl.GetString();
                    }
                    if (propVal.TryGetProperty("catalogCode", out var catEl) && catEl.ValueKind == JsonValueKind.String)
                    {
                        catalogCode = catEl.GetString();
                    }
                    if (propVal.TryGetProperty("enum", out var enumEl) && enumEl.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var e in enumEl.EnumerateArray())
                        {
                            if (e.ValueKind == JsonValueKind.String && e.GetString() is { } es && es != "_empty_")
                                enumOptions.Add(es);
                        }
                    }
                    if (propVal.TryGetProperty("oneOf", out var oneOfEl) && oneOfEl.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var opt in oneOfEl.EnumerateArray())
                        {
                            if (opt.ValueKind == JsonValueKind.Object)
                            {
                                if (opt.TryGetProperty("catalogCode", out var cCode) && cCode.ValueKind == JsonValueKind.String)
                                    catalogCode ??= cCode.GetString();

                                if (opt.TryGetProperty("const", out var constVal) && constVal.ValueKind == JsonValueKind.String)
                                {
                                    var cv = constVal.GetString();
                                    if (!string.IsNullOrWhiteSpace(cv) && cv != "_empty_")
                                        enumOptions.Add(cv);
                                }
                                else if (opt.TryGetProperty("title", out var titleVal) && titleVal.ValueKind == JsonValueKind.String)
                                {
                                    var tv = titleVal.GetString();
                                    if (!string.IsNullOrWhiteSpace(tv) && tv != "_empty_")
                                        enumOptions.Add(tv);
                                }
                            }
                        }
                    }
                    if (propVal.TryGetProperty("type", out var typeEl))
                    {
                        if (typeEl.ValueKind == JsonValueKind.String)
                            types.Add(typeEl.GetString() ?? "string");
                        else if (typeEl.ValueKind == JsonValueKind.Array)
                            foreach (var t in typeEl.EnumerateArray())
                                if (t.ValueKind == JsonValueKind.String && t.GetString() is { } s)
                                    types.Add(s);
                    }
                    if (propVal.TryGetProperty("items", out var itemsEl) && itemsEl.ValueKind == JsonValueKind.Object)
                    {
                        if (itemsEl.TryGetProperty("type", out var itemTypeEl) && itemTypeEl.ValueKind == JsonValueKind.String)
                            itemType = itemTypeEl.GetString();
                        if (itemsEl.TryGetProperty("format", out var itemFormatEl) && itemFormatEl.ValueKind == JsonValueKind.String)
                            format ??= itemFormatEl.GetString();
                    }
                }
                if (types.Count == 0) types.Add("string");
                props[propName] = new SchemaPropertyInfo(propName, title, types, itemType, format, catalogCode, enumOptions);
            }

            if (root.TryGetProperty("properties", out var properties) && properties.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in properties.EnumerateObject())
                {
                    ProcessProperty(prop.Name, prop.Value);
                }
            }

            // También considerar propiedades anidadas en dependencies (RJSF)
            if (root.TryGetProperty("dependencies", out var dependencies) && dependencies.ValueKind == JsonValueKind.Object)
            {
                foreach (var dep in dependencies.EnumerateObject())
                {
                    if (dep.Value.TryGetProperty("oneOf", out var oneOf) && oneOf.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var branch in oneOf.EnumerateArray())
                        {
                            if (branch.TryGetProperty("properties", out var branchProps) && branchProps.ValueKind == JsonValueKind.Object)
                            {
                                foreach (var p in branchProps.EnumerateObject())
                                {
                                    if (!props.ContainsKey(p.Name))
                                    {
                                        ProcessProperty(p.Name, p.Value);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (root.TryGetProperty("required", out var requiredEl) && requiredEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var r in requiredEl.EnumerateArray())
                    if (r.ValueKind == JsonValueKind.String && r.GetString() is { } s)
                        required.Add(s);
            }
        }
        catch (JsonException)
        {
            // Schema inválido: se ignora el detalle dinámico.
        }

        return (props, required);
    }
}

public static class AssetImportValidator
{
    private static readonly string[] DateFormats =
    {
        "yyyy-MM-dd", "yyyy-MM-dd HH:mm:ss", "yyyy-MM-ddTHH:mm:ss", "yyyy-MM-ddTHH:mm:ssZ",
        "dd/MM/yyyy", "dd/MM/yyyy HH:mm:ss", "MM/dd/yyyy", "dd-MM-yyyy", "yyyy/MM/dd"
    };

    /// <summary>Normaliza un header: Trim + quita el marcador '*' de requerido de la plantilla.</summary>
    public static string NormalizeHeader(string header)
    {
        var h = (header ?? string.Empty).Trim();
        if (h.EndsWith("*")) h = h.Substring(0, h.Length - 1).Trim();
        return h;
    }

    public static async Task<(List<ParsedRow> ValidRows, List<ImportRowError> Errors)> ValidateRowsAsync(
        ITenantDbContext db,
        AssetTemplate template,
        Guid tenantId,
        List<string> headers,
        List<Dictionary<string, string?>> rows,
        Dictionary<string, string>? columnMappings,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var validRows = new List<ParsedRow>();
        var errors = new List<ImportRowError>();
        var mappings = columnMappings ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        // Diccionario de sinónimos de campos fijos para soportar encabezados en español o inglés amigable
        var fixedSynonyms = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Code"] = "Code", ["Codigo"] = "Code", ["Código"] = "Code", ["Código del Activo"] = "Code", ["Codigo del Activo"] = "Code",
            ["Name"] = "Name", ["Nombre"] = "Name", ["Nombre del Activo"] = "Name",
            ["ParentCode"] = "ParentCode", ["Codigo Padre"] = "ParentCode", ["Código Padre"] = "ParentCode", ["Código Activo Padre"] = "ParentCode", ["Codigo Activo Padre"] = "ParentCode",
            ["State"] = "State", ["Estado"] = "State", ["Estado Inicial"] = "State",
            ["InstalledAt"] = "InstalledAt", ["Fecha de Instalacion"] = "InstalledAt", ["Fecha de Instalación"] = "InstalledAt", ["Fecha Instalacion"] = "InstalledAt", ["Fecha Instalación"] = "InstalledAt", ["Fecha de Instalación (AAAA-MM-DD)"] = "InstalledAt", ["Fecha de Instalacion (AAAA-MM-DD)"] = "InstalledAt",
            ["CommissionedAt"] = "CommissionedAt", ["Fecha de Puesta en Marcha"] = "CommissionedAt", ["Fecha Puesta en Marcha"] = "CommissionedAt", ["Puesta en Marcha"] = "CommissionedAt", ["Fecha Puesta en Marcha (AAAA-MM-DD)"] = "CommissionedAt", ["Fecha de Puesta en Marcha (AAAA-MM-DD)"] = "CommissionedAt",
            ["ConditionIndex"] = "ConditionIndex", ["Indice de Condicion"] = "ConditionIndex", ["Índice de Condición"] = "ConditionIndex", ["Condicion"] = "ConditionIndex", ["Condición"] = "ConditionIndex",
            ["Latitude"] = "Latitude", ["Latitud"] = "Latitude", ["Lat"] = "Latitude",
            ["Longitude"] = "Longitude", ["Longitud"] = "Longitude", ["Lon"] = "Longitude", ["Lng"] = "Longitude"
        };

        var (schemaProps, schemaRequired) = ImportSchemaHelper.Parse(template.SchemaJson);

        // Mapa dinámico para resolver Title o Name -> SchemaPropertyInfo
        var dynamicLookup = new Dictionary<string, SchemaPropertyInfo>(StringComparer.OrdinalIgnoreCase);
        foreach (var prop in schemaProps.Values)
        {
            dynamicLookup[prop.Name] = prop;
            if (!string.IsNullOrWhiteSpace(prop.Title))
            {
                dynamicLookup[prop.Title] = prop;
            }
        }

        // Índice: campo canónico -> header original.
        var fieldToHeader = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var h in headers)
        {
            var mapped = mappings.TryGetValue(h, out var m) && !string.IsNullOrWhiteSpace(m) ? m : h;
            var field = NormalizeHeader(mapped);
            if (string.IsNullOrWhiteSpace(field)) continue;

            // 1. ¿Es campo fijo por sinónimo?
            if (fixedSynonyms.TryGetValue(field, out var canonicalFixed))
            {
                if (!fieldToHeader.ContainsKey(canonicalFixed))
                    fieldToHeader[canonicalFixed] = h;
            }
            // 2. ¿Es campo dinámico por Name o Title?
            else if (dynamicLookup.TryGetValue(field, out var propInfo))
            {
                if (!fieldToHeader.ContainsKey(propInfo.Name))
                    fieldToHeader[propInfo.Name] = h;
            }
            else
            {
                if (!fieldToHeader.ContainsKey(field))
                    fieldToHeader[field] = h;
            }
        }

        string? Get(Dictionary<string, string?> row, string field)
        {
            if (!fieldToHeader.TryGetValue(field, out var header)) return null;
            if (!row.TryGetValue(header, out var v)) return null;
            return string.IsNullOrWhiteSpace(v) ? null : v.Trim();
        }

        JsonSchema? jsonSchema = null;
        if (!string.IsNullOrWhiteSpace(template.SchemaJson))
        {
            try { jsonSchema = await JsonSchema.FromJsonAsync(template.SchemaJson, cancellationToken); }
            catch { jsonSchema = null; }
        }

        // Cargar ítems de los catálogos referenciados en la plantilla
        var catalogCodes = schemaProps.Values
            .Where(p => !string.IsNullOrWhiteSpace(p.CatalogCode))
            .Select(p => p.CatalogCode!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // catalogCode -> (canonicalCode/label -> canonicalCode)
        var catalogResolvers = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        if (catalogCodes.Count > 0)
        {
            var catalogs = await db.Catalogs
                .Where(c => catalogCodes.Contains(c.Code) && (c.TenantId == tenantId || c.TenantId == null))
                .Select(c => new { c.Id, c.Code })
                .ToListAsync(cancellationToken);

            var catalogIds = catalogs.Select(c => c.Id).ToList();
            if (catalogIds.Count > 0)
            {
                var items = await db.CatalogItems
                    .Include(ci => ci.Translations)
                    .Where(ci => catalogIds.Contains(ci.CatalogId) && !ci.IsDeleted && (ci.TenantId == tenantId || ci.TenantId == null))
                    .ToListAsync(cancellationToken);

                foreach (var cat in catalogs)
                {
                    var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    var catItems = items.Where(i => i.CatalogId == cat.Id);
                    foreach (var itm in catItems)
                    {
                        map[itm.Code] = itm.Code;
                        foreach (var tr in itm.Translations)
                        {
                            if (!string.IsNullOrWhiteSpace(tr.Label))
                                map[tr.Label.Trim()] = itm.Code;
                        }
                    }
                    catalogResolvers[cat.Code] = map;
                }
            }
        }

        // Códigos y padres involucrados (normalizados upper) para consultas acotadas.
        var fileCodes = rows
            .Select((r, i) => Get(r, "Code"))
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Select(c => c!.ToUpperInvariant())
            .Distinct()
            .ToList();
        var dbCodeSet = fileCodes.Count == 0
            ? new HashSet<string>()
            : new HashSet<string>(
                (await db.Assets
                    .Where(a => a.TenantId == tenantId && fileCodes.Contains(a.Code.ToUpper()))
                    .Select(a => a.Code)
                    .ToListAsync(cancellationToken))
                .Select(c => c.Trim().ToUpperInvariant()));

        var parentCodes = rows
            .Select(r => Get(r, "ParentCode"))
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Select(c => c!.Trim().ToUpperInvariant())
            .Distinct()
            .ToList();
        var dbParents = parentCodes.Count == 0
            ? new Dictionary<string, (Guid Id, List<Guid> AllowedChildTemplateIds)>()
            : (await db.Assets
                    .Include(a => a.AssetTemplate)
                    .Where(a => a.TenantId == tenantId && !a.IsDeleted && parentCodes.Contains(a.Code.ToUpper()))
                    .Select(a => new
                    {
                        Code = a.Code,
                        a.Id,
                        Allowed = a.AssetTemplate != null ? a.AssetTemplate.AllowedChildTemplateIds : new List<Guid>()
                    })
                    .ToListAsync(cancellationToken))
                .GroupBy(a => a.Code.Trim().ToUpperInvariant())
                .ToDictionary(g => g.Key, g => (g.First().Id, g.First().Allowed));

        // Mapa código -> ParentCode de todo el archivo (para detección de ciclos).
        var fileLinks = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in rows)
        {
            var c = Get(r, "Code");
            var p = Get(r, "ParentCode");
            if (!string.IsNullOrWhiteSpace(c) && !string.IsNullOrWhiteSpace(p))
                fileLinks[c!.Trim()] = p!.Trim();
        }

        var seenCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var validByCode = new Dictionary<string, ParsedRow>(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < rows.Count; i++)
        {
            var rowNumber = i + 1;
            var row = rows[i];
            var rowErrors = new List<ImportRowError>();
            void AddError(string code, string? field, string message) =>
                rowErrors.Add(new ImportRowError(rowNumber, code, field, message));

            var code = Get(row, "Code");
            var name = Get(row, "Name");
            var parentCode = Get(row, "ParentCode");
            var stateRaw = Get(row, "State");
            var installedRaw = Get(row, "InstalledAt");
            var commissionedRaw = Get(row, "CommissionedAt");
            var conditionRaw = Get(row, "ConditionIndex");
            var latRaw = Get(row, "Latitude");
            var lonRaw = Get(row, "Longitude");

            // Code: requerido + único (DB + archivo).
            if (string.IsNullOrWhiteSpace(code))
            {
                AddError("VAL-001", "Code", "El campo 'Code' es requerido.");
            }
            else if (dbCodeSet.Contains(code.Trim().ToUpperInvariant()))
            {
                AddError("VAL-001", "Code", $"El código '{code}' ya existe en la base de datos.");
            }
            else if (seenCodes.Contains(code.Trim()))
            {
                AddError("VAL-006", "Code", $"El código '{code}' está duplicado dentro del archivo.");
            }

            // Name: requerido.
            if (string.IsNullOrWhiteSpace(name))
                AddError("VAL-007", "Name", "El campo 'Name' es requerido.");

            // State: vacío => InitialState; si no, debe existir en LifecycleStates.States.
            var state = template.LifecycleStates.InitialState;
            if (!string.IsNullOrWhiteSpace(stateRaw))
            {
                var canonical = template.LifecycleStates.States.Keys
                    .FirstOrDefault(k => string.Equals(k, stateRaw, StringComparison.OrdinalIgnoreCase));
                if (canonical == null)
                    AddError("VAL-003", "State", $"El estado '{stateRaw}' no existe en el ciclo de vida de la plantilla.");
                else
                    state = canonical;
            }

            // Fechas.
            DateTime? installedAt = null;
            DateTime? commissionedAt = null;
            if (installedRaw != null)
            {
                if (!TryParseDate(installedRaw, out var d))
                    AddError("VAL-004", "InstalledAt", $"La fecha '{installedRaw}' no tiene un formato válido.");
                else if (d > now)
                    AddError("VAL-004", "InstalledAt", "La fecha 'InstalledAt' debe ser menor o igual a la fecha actual.");
                else
                    installedAt = d;
            }
            if (commissionedRaw != null)
            {
                if (!TryParseDate(commissionedRaw, out var d))
                    AddError("VAL-004", "CommissionedAt", $"La fecha '{commissionedRaw}' no tiene un formato válido.");
                else
                    commissionedAt = d;
            }
            if (installedAt.HasValue && commissionedAt.HasValue && commissionedAt.Value < installedAt.Value)
                AddError("VAL-004", "CommissionedAt", "La fecha 'CommissionedAt' debe ser mayor o igual a 'InstalledAt'.");

            // ConditionIndex 0-100 (soporta punto o coma decimal).
            decimal? conditionIndex = null;
            if (conditionRaw != null)
            {
                var clean = conditionRaw.Replace(',', '.');
                if (!decimal.TryParse(clean, NumberStyles.Number, CultureInfo.InvariantCulture, out var v))
                    AddError("VAL-005", "ConditionIndex", $"El valor '{conditionRaw}' no es un número válido.");
                else if (v < 0 || v > 100)
                    AddError("VAL-005", "ConditionIndex", "El campo 'ConditionIndex' debe estar entre 0 y 100.");
                else
                    conditionIndex = v;
            }

            // Geo WGS84: lat requiere lon y viceversa (soporta punto o coma decimal).
            double? lat = null;
            double? lon = null;
            if (latRaw != null || lonRaw != null)
            {
                if (latRaw == null || lonRaw == null)
                {
                    AddError("VAL-005", latRaw == null ? "Latitude" : "Longitude",
                        "Los campos 'Latitude' y 'Longitude' son requeridos en conjunto.");
                }
                else
                {
                    var cleanLat = latRaw.Replace(',', '.');
                    var cleanLon = lonRaw.Replace(',', '.');

                    if (!double.TryParse(cleanLat, NumberStyles.Float, CultureInfo.InvariantCulture, out var la))
                        AddError("VAL-005", "Latitude", $"El valor '{latRaw}' no es una latitud válida.");
                    else if (la < -90 || la > 90)
                        AddError("VAL-005", "Latitude", "La latitud debe estar entre -90 y 90 (WGS84).");
                    else
                        lat = la;

                    if (!double.TryParse(cleanLon, NumberStyles.Float, CultureInfo.InvariantCulture, out var lo))
                        AddError("VAL-005", "Longitude", $"El valor '{lonRaw}' no es una longitud válida.");
                    else if (lo < -180 || lo > 180)
                        AddError("VAL-005", "Longitude", "La longitud debe estar entre -180 y 180 (WGS84).");
                    else
                        lon = lo;
                }
            }

            // ParentCode: DB o filas previas válidas + AllowedChildTemplateIds + ciclos.
            if (!string.IsNullOrWhiteSpace(parentCode))
            {
                var p = parentCode.Trim();
                if (!string.IsNullOrWhiteSpace(code) && string.Equals(p, code.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    AddError("VAL-006", "ParentCode", "Un activo no puede ser su propio padre (referencia circular).");
                }
                else if (HasCircularReference(fileLinks, code?.Trim() ?? string.Empty, p))
                {
                    AddError("VAL-006", "ParentCode", $"La referencia al padre '{p}' genera una dependencia circular.");
                }
                else if (dbParents.TryGetValue(p.ToUpperInvariant(), out var dbParent))
                {
                    if (dbParent.Item2.Any() &&
                        !dbParent.Item2.Contains(template.Id))
                    {
                        AddError("VAL-002", "ParentCode",
                            $"El activo padre '{p}' no admite hijos de la plantilla actual (AllowedChildTemplateIds).");
                    }
                }
                else if (!validByCode.ContainsKey(p))
                {
                    AddError("VAL-002", "ParentCode", $"El activo padre '{p}' no existe en la base de datos ni en filas previas válidas del archivo.");
                }
                else
                {
                    // Padre intra-archivo: comparten plantilla; validar auto-compatibilidad.
                    if (template.AllowedChildTemplateIds.Any() &&
                        !template.AllowedChildTemplateIds.Contains(template.Id))
                    {
                        AddError("VAL-002", "ParentCode",
                            "La plantilla no admite jerarquía intra-archivo (AllowedChildTemplateIds no incluye la propia plantilla).");
                    }
                }
            }

            // Campos dinámicos -> PropertiesJson.
            var dynamicValues = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (var h in headers)
            {
                var mapped = mappings.TryGetValue(h, out var m) && !string.IsNullOrWhiteSpace(m) ? m : h;
                var field = NormalizeHeader(mapped);
                if (IsFixedField(field, fixedSynonyms)) continue;
                if (string.IsNullOrWhiteSpace(field)) continue;
                row.TryGetValue(h, out var rawValue);

                if (!dynamicLookup.TryGetValue(field, out var propInfo))
                {
                    if (!string.IsNullOrWhiteSpace(rawValue))
                        AddError("SCHEMA-ERR", field, $"La columna '{h}' no corresponde a ningún campo fijo ni a una propiedad del SchemaJson.");
                    continue;
                }

                if (string.IsNullOrWhiteSpace(rawValue))
                {
                    if (schemaRequired.Contains(propInfo.Name))
                        AddError("SCHEMA-ERR", propInfo.Title ?? propInfo.Name, $"El campo '{propInfo.Title ?? propInfo.Name}' es requerido según la plantilla.");
                    continue;
                }

                // Validar Enums estáticos
                if (propInfo.EnumOptions.Count > 0)
                {
                    var match = propInfo.EnumOptions.FirstOrDefault(e => string.Equals(e, rawValue.Trim(), StringComparison.OrdinalIgnoreCase));
                    if (match == null)
                    {
                        AddError("SCHEMA-ERR", propInfo.Title ?? propInfo.Name,
                            $"El valor '{rawValue}' no es válido para '{propInfo.Title ?? propInfo.Name}'. Opciones permitidas: {string.Join(", ", propInfo.EnumOptions)}.");
                        continue;
                    }
                    rawValue = match;
                }

                // Validar Catálogos dinámicos
                if (!string.IsNullOrWhiteSpace(propInfo.CatalogCode))
                {
                    if (catalogResolvers.TryGetValue(propInfo.CatalogCode, out var catResolver))
                    {
                        if (catResolver.TryGetValue(rawValue.Trim(), out var canonicalCode))
                        {
                            rawValue = canonicalCode;
                        }
                        else
                        {
                            AddError("SCHEMA-ERR", propInfo.Title ?? propInfo.Name,
                                $"El valor '{rawValue}' no existe en el catálogo '{propInfo.CatalogCode}'.");
                            continue;
                        }
                    }
                    else
                    {
                        AddError("SCHEMA-ERR", propInfo.Title ?? propInfo.Name,
                            $"El catálogo '{propInfo.CatalogCode}' no está configurado en el sistema.");
                        continue;
                    }
                }

                // Validar Formato Media / Archivos / Imágenes (data-url)
                if (string.Equals(propInfo.Format, "data-url", StringComparison.OrdinalIgnoreCase))
                {
                    var v = rawValue.Trim();
                    var isHttpUrl = Uri.TryCreate(v, UriKind.Absolute, out var uriResult)
                                    && (uriResult.Scheme == Uri.UriSchemeHttp || uriResult.Scheme == Uri.UriSchemeHttps);
                    var isDataUri = v.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && v.Contains(";base64,");
                    var isRelativePath = v.StartsWith("/") || v.StartsWith("./") || v.StartsWith("~/")
                                         || v.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase)
                                         || v.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase)
                                         || v.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                                         || v.EndsWith(".webp", StringComparison.OrdinalIgnoreCase)
                                         || v.EndsWith(".svg", StringComparison.OrdinalIgnoreCase)
                                         || v.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase);

                    if (!isHttpUrl && !isDataUri && !isRelativePath)
                    {
                        AddError("SCHEMA-ERR", propInfo.Title ?? propInfo.Name,
                            $"El campo '{propInfo.Title ?? propInfo.Name}' debe ser una URL válida (http/https), una ruta relativa o un URI base64.");
                    }
                }

                dynamicValues[propInfo.Name] = ConvertValue(rawValue.Trim(), propInfo);
            }

            // Validar requeridos que no vinieron en los headers o vinieron vacíos
            foreach (var reqName in schemaRequired)
            {
                if (!dynamicValues.ContainsKey(reqName) || dynamicValues[reqName] == null || string.IsNullOrWhiteSpace(dynamicValues[reqName]?.ToString()))
                {
                    var label = schemaProps.TryGetValue(reqName, out var pInfo) && !string.IsNullOrWhiteSpace(pInfo.Title) ? pInfo.Title : reqName;
                    AddError("SCHEMA-ERR", label, $"El campo requerido '{label}' no fue provisto.");
                }
            }

            var propertiesJson = JsonSerializer.Serialize(dynamicValues);
            if (jsonSchema != null && dynamicValues.Count > 0)
            {
                var schemaErrors = jsonSchema.Validate(propertiesJson);
                foreach (var se in schemaErrors)
                    AddError("SCHEMA-ERR", se.Path ?? se.Property,
                        $"Campo '{se.Property ?? se.Path}': {se.Kind}".Trim());
            }
            else if (jsonSchema != null && schemaRequired.Count > 0)
            {
                var schemaErrors = jsonSchema.Validate(propertiesJson);
                foreach (var se in schemaErrors)
                    AddError("SCHEMA-ERR", se.Path ?? se.Property,
                        $"Campo '{se.Property ?? se.Path}': {se.Kind}".Trim());
            }

            errors.AddRange(rowErrors);
            if (!string.IsNullOrWhiteSpace(code))
                seenCodes.Add(code.Trim());

            if (rowErrors.Count == 0)
            {
                var parsed = new ParsedRow
                {
                    RowNumber = rowNumber,
                    Code = code!.Trim(),
                    Name = name!.Trim(),
                    ParentCode = string.IsNullOrWhiteSpace(parentCode) ? null : parentCode.Trim(),
                    State = state,
                    InstalledAt = installedAt,
                    CommissionedAt = commissionedAt,
                    ConditionIndex = conditionIndex,
                    Lat = lat,
                    Lon = lon,
                    PropertiesJson = propertiesJson,
                    EffectiveEventAt = commissionedAt ?? installedAt ?? now
                };
                validRows.Add(parsed);
                validByCode[parsed.Code] = parsed;
            }
        }

        return (validRows, errors);
    }

    private static bool IsFixedField(string field, Dictionary<string, string> fixedSynonyms) =>
        fixedSynonyms.ContainsKey(field)
        || field.Equals("Code", StringComparison.OrdinalIgnoreCase)
        || field.Equals("Name", StringComparison.OrdinalIgnoreCase)
        || field.Equals("ParentCode", StringComparison.OrdinalIgnoreCase)
        || field.Equals("State", StringComparison.OrdinalIgnoreCase)
        || field.Equals("InstalledAt", StringComparison.OrdinalIgnoreCase)
        || field.Equals("CommissionedAt", StringComparison.OrdinalIgnoreCase)
        || field.Equals("ConditionIndex", StringComparison.OrdinalIgnoreCase)
        || field.Equals("Latitude", StringComparison.OrdinalIgnoreCase)
        || field.Equals("Longitude", StringComparison.OrdinalIgnoreCase);

    private static bool HasCircularReference(Dictionary<string, string> links, string code, string parentCode)
    {
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { code };
        var current = parentCode;
        while (!string.IsNullOrWhiteSpace(current))
        {
            if (visited.Contains(current)) return true;
            visited.Add(current);
            if (!links.TryGetValue(current, out var next)) return false;
            current = next;
        }
        return false;
    }

    private static bool TryParseDate(string raw, out DateTime value)
    {
        if (DateTime.TryParseExact(raw, DateFormats, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out value))
            return true;
        if (DateTime.TryParse(raw, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out value))
            return true;
        value = default;
        return false;
    }

    private static object? ConvertValue(string raw, SchemaPropertyInfo prop)
    {
        var types = prop.Types.Contains("null")
            ? prop.Types.Where(t => t != "null").ToList()
            : prop.Types;
        var primary = types.FirstOrDefault() ?? "string";

        if (primary == "array")
        {
            var separator = raw.Contains(';') ? ';' : ',';
            var items = raw.Split(separator).Select(s => s.Trim()).Where(s => s.Length > 0).ToList();
            return items.Select(s => (object?)ConvertScalar(s, prop.ItemType ?? "string")).ToList();
        }

        return ConvertScalar(raw, primary);
    }

    private static object? ConvertScalar(string raw, string type)
    {
        var clean = raw.Replace(',', '.');
        return type switch
        {
            "integer" => long.TryParse(clean, NumberStyles.Integer, CultureInfo.InvariantCulture, out var l)
                ? l : (double.TryParse(clean, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? (object?)d : raw),
            "number" => double.TryParse(clean, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)
                ? d : (object?)raw,
            "boolean" => raw.ToLowerInvariant() switch
            {
                "true" or "1" or "yes" or "y" or "sí" or "si" => true,
                "false" or "0" or "no" or "n" => false,
                _ => (object?)raw
            },
            _ => raw
        };
    }
}
