using AssetHub.Application.AssetArchitect;

namespace AssetHub.Api.Tests.AssetArchitect;

public class AssetArchitectDraftValidatorTests
{
    private static readonly string[] Catalogs = { "FUEL_TYPES", "BRANDS" };

    internal static AssetArchitectDraft ValidDraft() => new()
    {
        Templates =
        {
            new TemplateDraft
            {
                Code = "TRUCK",
                Name = "Refrigerated truck",
                Fields =
                {
                    new FieldDraft { KeyName = "plate", Title = "Plate", Type = "string", Required = true },
                    new FieldDraft { KeyName = "fuel", Title = "Fuel", Type = "catalog", CatalogCode = "FUEL_TYPES" },
                    new FieldDraft { KeyName = "mode", Title = "Mode", Type = "enum", EnumOptions = { "Chilled", "Frozen" } },
                },
                InitialState = "Active",
                States =
                {
                    new StateDraft { Name = "Active", Transitions = { "InMaintenance", "Retired" } },
                    new StateDraft { Name = "InMaintenance", Transitions = { "Active" } },
                    new StateDraft { Name = "Retired", IsTerminal = true },
                },
            },
        },
    };

    private static IReadOnlyList<DraftIssue> Validate(AssetArchitectDraft draft) =>
        AssetArchitectDraftValidator.Validate(draft, Catalogs);

    [Fact]
    public void ValidDraft_HasNoIssues()
    {
        Assert.Empty(Validate(ValidDraft()));
    }

    [Fact]
    public void EmptyDraft_IsRejected()
    {
        Assert.Contains(Validate(new AssetArchitectDraft()), i => i.Path == "templates");
    }

    [Fact]
    public void DuplicateTemplateCodes_AreRejectedCaseInsensitively()
    {
        var draft = ValidDraft();
        var copy = ValidDraft().Templates[0];
        copy.Code = "truck";
        draft.Templates.Add(copy);

        Assert.Contains(Validate(draft), i => i.Message.Contains("Duplicate template code"));
    }

    [Fact]
    public void DuplicateFieldKey_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].Fields.Add(new FieldDraft { KeyName = "plate", Title = "Plate 2", Type = "string" });

        Assert.Contains(Validate(draft), i => i.Message.Contains("Duplicate field key"));
    }

    [Theory]
    [InlineData("1plate")]
    [InlineData("pla te")]
    [InlineData("plate-no")]
    [InlineData("")]
    public void InvalidFieldKey_IsRejected(string key)
    {
        var draft = ValidDraft();
        draft.Templates[0].Fields[0].KeyName = key;

        Assert.Contains(Validate(draft), i => i.Path.EndsWith("keyName"));
    }

    [Fact]
    public void UnsupportedFieldType_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].Fields[0].Type = "geopoint";

        Assert.Contains(Validate(draft), i => i.Message.Contains("Unsupported field type"));
    }

    [Fact]
    public void EnumWithoutOptions_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].Fields[2].EnumOptions.Clear();

        Assert.Contains(Validate(draft), i => i.Path.EndsWith("enumOptions"));
    }

    [Fact]
    public void CatalogUnknownToTenant_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].Fields[1].CatalogCode = "INVENTED_CATALOG";

        Assert.Contains(Validate(draft), i => i.Message.Contains("does not exist for this tenant"));
    }

    [Fact]
    public void CatalogWithoutCode_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].Fields[1].CatalogCode = null;

        Assert.Contains(Validate(draft), i => i.Message.Contains("needs a catalogCode"));
    }

    [Fact]
    public void CatalogCodeOnNonCatalogField_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].Fields[0].CatalogCode = "BRANDS";

        Assert.Contains(Validate(draft), i => i.Message.Contains("only valid on catalog fields"));
    }

    [Fact]
    public void MissingInitialState_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].InitialState = "Ghost";

        Assert.Contains(Validate(draft), i => i.Path.EndsWith("initialState"));
    }

    [Fact]
    public void TransitionToUnknownState_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].States[0].Transitions.Add("Ghost");

        Assert.Contains(Validate(draft), i => i.Message.Contains("unknown state 'Ghost'"));
    }

    [Fact]
    public void SelfTransition_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].States[0].Transitions.Add("Active");

        Assert.Contains(Validate(draft), i => i.Message.Contains("cannot transition to itself"));
    }

    [Fact]
    public void UnreachableState_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].States.Add(new StateDraft { Name = "Orphan", IsTerminal = true });

        Assert.Contains(Validate(draft), i => i.Message.Contains("unreachable"));
    }

    [Fact]
    public void LifecycleWithoutTerminalState_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].States[2].IsTerminal = false;

        Assert.Contains(Validate(draft), i => i.Message.Contains("at least one terminal state"));
    }

    [Theory]
    [InlineData("red")]
    [InlineData("#12345")]
    [InlineData("#gggggg")]
    public void InvalidColor_IsRejected(string color)
    {
        var draft = ValidDraft();
        draft.Templates[0].States[0].Color = color;

        Assert.Contains(Validate(draft), i => i.Path.EndsWith("color"));
    }

    [Fact]
    public void NonPositiveMaxHours_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].States[1].MaxHoursInState = 0;

        Assert.Contains(Validate(draft), i => i.Path.EndsWith("maxHoursInState"));
    }

    [Fact]
    public void UnknownChildTemplate_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].ChildTemplateCodes.Add("GHOST");

        Assert.Contains(Validate(draft), i => i.Message.Contains("Unknown child template"));
    }

    [Fact]
    public void ValidParentChildHierarchy_IsAccepted()
    {
        var draft = ValidDraft();
        var child = ValidDraft().Templates[0];
        child.Code = "REEFER_UNIT";
        draft.Templates.Add(child);
        draft.Templates[0].ChildTemplateCodes.Add("REEFER_UNIT");

        Assert.Empty(Validate(draft));
    }

    [Fact]
    public void CircularHierarchy_IsRejected()
    {
        var draft = ValidDraft();
        var child = ValidDraft().Templates[0];
        child.Code = "REEFER_UNIT";
        draft.Templates.Add(child);
        draft.Templates[0].ChildTemplateCodes.Add("REEFER_UNIT");
        draft.Templates[1].ChildTemplateCodes.Add("TRUCK");

        Assert.Contains(Validate(draft), i => i.Message.Contains("Circular"));
    }

    [Fact]
    public void ChecklistTaskWithoutTitle_IsRejected()
    {
        var draft = ValidDraft();
        draft.Templates[0].MaintenanceTasks.Add(new ChecklistTaskDraft { Title = " " });

        Assert.Contains(Validate(draft), i => i.Path.EndsWith("title"));
    }
}
