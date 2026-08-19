using System;
using System.Text.Json.Serialization;

namespace AssetHub.Application.Maintenance.Dtos;

public class AddPartRequest
{
    [JsonPropertyName("catalogItemId")]
    public Guid CatalogItemId { get; set; }
    
    [JsonPropertyName("quantity")]
    public int Quantity { get; set; }
    
    [JsonPropertyName("unitCost")]
    public decimal UnitCost { get; set; }
}
