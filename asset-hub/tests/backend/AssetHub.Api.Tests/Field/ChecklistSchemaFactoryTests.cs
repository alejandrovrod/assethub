using System.Linq;
using System.Text.Json;
using AssetHub.Application.Tasks.Checklists;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// El esquema que se genera acá es el contrato que el PWA consume con Ajv8 y RJSF v6.
/// Si cambia la forma, el formulario del técnico cambia con ella: estos tests fijan la
/// forma, no la implementación.
/// </summary>
public class ChecklistSchemaFactoryTests
{
    /// <summary>
    /// Copia literal del <c>MaintenanceChecklist</c> de
    /// <c>scripts/seed-soporte-tecnico.sql</c>. Es el checklist real que hoy tienen las
    /// plantillas, así que es el caso que importa.
    /// </summary>
    private const string RealSeedChecklist = """
        {"tasks": [{"title": "Inspección visual externa", "description": "Revisar golpes, rayones y conectores.", "frequency": "Al ingreso"}, {"title": "Verificar encendido básico", "description": "Comprobar que el equipo encienda y reconozca pantalla.", "frequency": "Al ingreso"}, {"title": "Respaldar información del cliente", "description": "Realizar backup previo si es posible.", "frequency": "Antes de reparación"}, {"title": "Revisar componentes internos", "description": "Limpiar polvo y verificar temperaturas.", "frequency": "Cada 6 meses"}, {"title": "Actualizar firmware y drivers", "description": "Aplicar actualizaciones oficiales.", "frequency": "Cada reparación"}, {"title": "Pruebas finales de funcionamiento", "description": "Ejecutar pruebas de estrés básicas.", "frequency": "Antes de entrega"}]}
        """;

    [Fact]
    public void BuildsOneBooleanPropertyPerLegacyTask()
    {
        var result = ChecklistSchemaFactory.FromLegacyChecklist(RealSeedChecklist);

        Assert.NotNull(result);
        using var schema = JsonDocument.Parse(result!.SchemaJson);
        var properties = schema.RootElement.GetProperty("properties");

        Assert.Equal(6, properties.EnumerateObject().Count());
        Assert.Equal("object", schema.RootElement.GetProperty("type").GetString());
        Assert.Equal(
            "http://json-schema.org/draft-07/schema#",
            schema.RootElement.GetProperty("$schema").GetString());

        var first = properties.GetProperty("item_0");
        Assert.Equal("boolean", first.GetProperty("type").GetString());
        Assert.Equal("Inspección visual externa", first.GetProperty("title").GetString());
        Assert.Equal("Revisar golpes, rayones y conectores.", first.GetProperty("description").GetString());
    }

    [Fact]
    public void EveryItemIsRequiredAndExtraFieldsAreRejected()
    {
        var result = ChecklistSchemaFactory.FromLegacyChecklist(RealSeedChecklist);

        using var schema = JsonDocument.Parse(result!.SchemaJson);

        var required = schema.RootElement.GetProperty("required")
            .EnumerateArray()
            .Select(e => e.GetString())
            .ToArray();

        Assert.Equal(6, required.Length);
        Assert.Equal(required.Length, required.Distinct().Count());
        Assert.Contains("item_0", required);
        Assert.Contains("item_5", required);

        // Sin esto, un cliente podría mandar sólo lo que marcó y el servidor
        // aceptaría un formulario incompleto como si estuviera completo.
        Assert.False(schema.RootElement.GetProperty("additionalProperties").GetBoolean());
    }

    [Fact]
    public void UiSchemaOrdersItemsAndUsesFrequencyAsHelp()
    {
        var result = ChecklistSchemaFactory.FromLegacyChecklist(RealSeedChecklist);

        using var ui = JsonDocument.Parse(result!.UiSchemaJson);

        var order = ui.RootElement.GetProperty("ui:order")
            .EnumerateArray()
            .Select(e => e.GetString())
            .ToArray();

        Assert.Equal(new[] { "item_0", "item_1", "item_2", "item_3", "item_4", "item_5" }, order);

        var first = ui.RootElement.GetProperty("item_0");
        Assert.Equal("checkbox", first.GetProperty("ui:widget").GetString());
        Assert.Equal("Al ingreso", first.GetProperty("ui:help").GetString());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("{}")]
    [InlineData("{\"tasks\": []}")]
    [InlineData("{\"tasks\": \"no soy un array\"}")]
    [InlineData("no es json")]
    [InlineData("[]")]
    public void ReturnsNullWhenThereIsNothingToBuild(string? legacy)
    {
        Assert.Null(ChecklistSchemaFactory.FromLegacyChecklist(legacy));
    }

    [Fact]
    public void FallsBackToPositionalTitleAndOmitsMissingDescription()
    {
        var result = ChecklistSchemaFactory.FromLegacyChecklist(
            "{\"tasks\": [{\"title\": \"\", \"frequency\": null}, {\"description\": \"Sólo descripción\"}]}");

        using var schema = JsonDocument.Parse(result!.SchemaJson);
        var properties = schema.RootElement.GetProperty("properties");

        Assert.Equal("Ítem 1", properties.GetProperty("item_0").GetProperty("title").GetString());
        Assert.False(properties.GetProperty("item_0").TryGetProperty("description", out _));
        Assert.Equal("Ítem 2", properties.GetProperty("item_1").GetProperty("title").GetString());
    }

    [Fact]
    public void SkipsNonObjectEntriesWithoutShiftingTheRemainingKeys()
    {
        var result = ChecklistSchemaFactory.FromLegacyChecklist(
            "{\"tasks\": [{\"title\": \"A\"}, null, \"basura\", {\"title\": \"B\"}]}");

        using var schema = JsonDocument.Parse(result!.SchemaJson);
        var properties = schema.RootElement.GetProperty("properties");

        Assert.Equal(2, properties.EnumerateObject().Count());
        Assert.True(properties.TryGetProperty("item_1", out var second));
        Assert.Equal("B", second.GetProperty("title").GetString());
    }
}
