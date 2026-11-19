using System.Text.Json;
using AssetHub.Application.AssetArchitect;
using NJsonSchema;

namespace AssetHub.Api.Tests.AssetArchitect;

public class AssetArchitectDraftMapperTests
{
    private static TemplateDraft Template() => AssetArchitectDraftValidatorTests.ValidDraft().Templates[0];

    [Fact]
    public async Task SchemaJson_IsValidJsonSchema_AcceptedByNJsonSchema()
    {
        var command = AssetArchitectDraftMapper.ToCommand(Template());

        var schema = await JsonSchema.FromJsonAsync(command.SchemaJson);

        Assert.Equal(JsonObjectType.Object, schema.Type);
    }

    [Fact]
    public void SchemaJson_MarksRequiredFields()
    {
        var json = AssetArchitectDraftMapper.ToCommand(Template()).SchemaJson;
        using var doc = JsonDocument.Parse(json);

        var required = doc.RootElement.GetProperty("required").EnumerateArray().Select(e => e.GetString()).ToList();

        Assert.Equal(new[] { "plate" }, required);
    }

    [Fact]
    public void CatalogField_IsSerializedLikeTheSchemaBuilder()
    {
        var json = AssetArchitectDraftMapper.ToCommand(Template()).SchemaJson;
        using var doc = JsonDocument.Parse(json);

        var fuel = doc.RootElement.GetProperty("properties").GetProperty("fuel");

        // The builder stores catalogs as { type: "string", catalogCode: "..." }, never type: "catalog".
        Assert.Equal("string", fuel.GetProperty("type").GetString());
        Assert.Equal("FUEL_TYPES", fuel.GetProperty("catalogCode").GetString());
    }

    [Fact]
    public void EnumField_IsSerializedAsStringEnum()
    {
        var json = AssetArchitectDraftMapper.ToCommand(Template()).SchemaJson;
        using var doc = JsonDocument.Parse(json);

        var mode = doc.RootElement.GetProperty("properties").GetProperty("mode");

        Assert.Equal("string", mode.GetProperty("type").GetString());
        Assert.Equal(new[] { "Chilled", "Frozen" }, mode.GetProperty("enum").EnumerateArray().Select(e => e.GetString()).ToArray());
    }

    [Theory]
    [InlineData("date", "string", "date")]
    [InlineData("employee", "string", "employee")]
    [InlineData("team", "string", "team")]
    [InlineData("file", "string", "data-url")]
    public void SpecialFieldTypes_UseTheBuilderFormats(string type, string expectedType, string expectedFormat)
    {
        var json = AssetArchitectDraftMapper.BuildSchemaJson(new[] { new FieldDraft { KeyName = "f", Title = "F", Type = type } });
        using var doc = JsonDocument.Parse(json);

        var prop = doc.RootElement.GetProperty("properties").GetProperty("f");

        Assert.Equal(expectedType, prop.GetProperty("type").GetString());
        Assert.Equal(expectedFormat, prop.GetProperty("format").GetString());
    }

    [Fact]
    public void FilesField_IsSerializedAsArrayOfDataUrls()
    {
        var json = AssetArchitectDraftMapper.BuildSchemaJson(new[] { new FieldDraft { KeyName = "docs", Title = "Docs", Type = "files" } });
        using var doc = JsonDocument.Parse(json);

        var prop = doc.RootElement.GetProperty("properties").GetProperty("docs");

        Assert.Equal("array", prop.GetProperty("type").GetString());
        Assert.Equal("data-url", prop.GetProperty("items").GetProperty("format").GetString());
    }

    [Fact]
    public void Lifecycle_ContainsEveryStateWithDefaults()
    {
        var lifecycle = AssetArchitectDraftMapper.ToCommand(Template()).LifecycleStates;

        Assert.Equal("Active", lifecycle.InitialState);
        Assert.Equal(new[] { "Active", "InMaintenance", "Retired" }, lifecycle.States.Keys.OrderBy(k => k, StringComparer.Ordinal).ToArray());
        Assert.Equal(new[] { "InMaintenance", "Retired" }, lifecycle.Transitions["Active"]);
        Assert.Empty(lifecycle.Transitions["Retired"]);
        Assert.Equal("#94a3b8", lifecycle.States["Active"].Color);
        Assert.True(lifecycle.States["Retired"].IsTerminal);
    }

    [Fact]
    public void Lifecycle_KeepsExplicitColorAndSla()
    {
        var template = Template();
        template.States[1].Color = "#f59e0b";
        template.States[1].MaxHoursInState = 48;

        var lifecycle = AssetArchitectDraftMapper.ToCommand(template).LifecycleStates;

        Assert.Equal("#f59e0b", lifecycle.States["InMaintenance"].Color);
        Assert.Equal(48, lifecycle.States["InMaintenance"].MaxHoursInState);
    }

    [Fact]
    public void Checklist_UsesTheBuilderTasksShape()
    {
        var template = Template();
        template.MaintenanceTasks.Add(new ChecklistTaskDraft { Title = "Check compressor", Frequency = "monthly" });

        var json = AssetArchitectDraftMapper.ToCommand(template).MaintenanceChecklist;
        using var doc = JsonDocument.Parse(json);

        var task = doc.RootElement.GetProperty("tasks")[0];
        Assert.Equal("Check compressor", task.GetProperty("title").GetString());
        Assert.Equal("monthly", task.GetProperty("frequency").GetString());
        Assert.False(string.IsNullOrEmpty(task.GetProperty("id").GetString()));
    }

    [Fact]
    public void Command_DelegatesEntityTypeAndChildrenToLaterSteps()
    {
        var command = AssetArchitectDraftMapper.ToCommand(Template());

        Assert.Equal(Guid.Empty, command.BusinessEntityTypeId);
        Assert.Empty(command.AllowedChildTemplateIds);
    }
}
