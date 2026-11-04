using System;
using System.Text.Json;
using AssetHub.Application.Inventory.Commands;
using AssetHub.Application.Inventory.Queries;
using AssetHub.Application.Sync.Dtos;
using AssetHub.Application.Tasks.Dtos;
using Xunit;

namespace AssetHub.Api.Tests.Field;

/// <summary>
/// Contrato JSON del ETag.
///
/// System.Text.Json con <see cref="JsonSerializerDefaults.Web"/> convierte <c>ETag</c> en
/// <c>eTag</c> (sólo baja la primera letra porque la segunda ya es minúscula después de la
/// mayúscula inicial). El contrato —y todos los clientes— hablan <c>etag</c>. Cuando se
/// rompió, el cliente leía <c>undefined</c>, mandaba el <c>If-Match</c> vacío y el primer
/// <c>PUT /state</c> respondía 428.
///
/// Este test existe para que renombrar o quitar el <c>[JsonPropertyName]</c> falle acá y no
/// en la tablet de un técnico.
/// </summary>
public class ETagJsonContractTests
{
    private static readonly JsonSerializerOptions WebOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public void WorkTaskDto_SerializesETagAs_etag()
    {
        var json = JsonSerializer.Serialize(new WorkTaskDto { ETag = "abc" }, WebOptions);

        Assert.Contains("\"etag\":\"abc\"", json);
        Assert.DoesNotContain("eTag", json);
    }

    [Fact]
    public void WorkTaskSummaryDto_SerializesETagAs_etag()
    {
        var json = JsonSerializer.Serialize(new WorkTaskSummaryDto { ETag = "abc" }, WebOptions);

        Assert.Contains("\"etag\":\"abc\"", json);
        Assert.DoesNotContain("eTag", json);
    }

    [Fact]
    public void WorkTaskSummaryDto_DoesNotLeakRawRowVersion()
    {
        var json = JsonSerializer.Serialize(
            new WorkTaskSummaryDto { ETag = "abc", RowVersion = new byte[] { 1, 2, 3 } },
            WebOptions);

        Assert.DoesNotContain("rowVersion", json);
    }

    [Fact]
    public void WorkTaskSummaryDto_SerializesChecklistETagAs_checklistEtag()
    {
        var json = JsonSerializer.Serialize(
            new WorkTaskSummaryDto { HasChecklist = true, ChecklistETag = "chk" },
            WebOptions);

        // `ChecklistETag` camelCase sería `checklistETag`; el cliente lee `checklistEtag`.
        Assert.Contains("\"checklistEtag\":\"chk\"", json);
        Assert.Contains("\"hasChecklist\":true", json);
        Assert.DoesNotContain("checklistETag", json);
    }

    [Fact]
    public void TaskChecklistDto_SerializesETagAs_etag()
    {
        var json = JsonSerializer.Serialize(new TaskChecklistDto { ETag = "abc" }, WebOptions);

        Assert.Contains("\"etag\":\"abc\"", json);
        Assert.DoesNotContain("eTag", json);
    }

    [Fact]
    public void ChangeItemDto_SerializesETagAs_etag()
    {
        var json = JsonSerializer.Serialize(new ChangeItemDto { ETag = "abc" }, WebOptions);

        Assert.Contains("\"etag\":\"abc\"", json);
        Assert.DoesNotContain("eTag", json);
    }

    [Fact]
    public void StockBalanceDto_SerializesETagAs_etag()
    {
        var json = JsonSerializer.Serialize(new StockBalanceDto { ETag = "abc" }, WebOptions);

        Assert.Contains("\"etag\":\"abc\"", json);
        Assert.DoesNotContain("eTag", json);
    }

    [Fact]
    public void ConsumeStockResult_SerializesETagAs_etag()
    {
        var json = JsonSerializer.Serialize(new ConsumeStockResult { ETag = "abc" }, WebOptions);

        Assert.Contains("\"etag\":\"abc\"", json);
        Assert.DoesNotContain("eTag", json);
    }
}
