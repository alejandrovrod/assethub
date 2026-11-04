using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using AssetHub.Api.Filters;
using AssetHub.Api.Http;
using AssetHub.Application.Inventory.Commands;
using AssetHub.Application.Inventory.Queries;
using AssetHub.Application.Sync.Dtos;
using AssetHub.Application.Sync.Queries;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AssetHub.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize] // Requires auth, tenant isolation handled downstream
public class InventoryController : ControllerBase
{
    private readonly IMediator _mediator;

    public InventoryController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>Delta sync de saldos de inventario (022 §8).</summary>
    [HttpGet("stock/changes")]
    public async Task<ActionResult<ChangePageDto>> GetStockChanges(
        [FromQuery] string? since,
        [FromQuery] int? limit,
        [FromQuery] Guid? warehouseId)
    {
        var result = await _mediator.Send(new GetStockChangesQuery
        {
            Since = since,
            Limit = limit,
            WarehouseId = warehouseId,
        });

        return Ok(result);
    }

    // SETTINGS

    [HttpGet("settings")]
    public async Task<ActionResult<TenantInventorySettingsDto>> GetSettings()
    {
        var result = await _mediator.Send(new GetInventorySettingsQuery());
        return Ok(result);
    }

    [HttpPut("settings")]
    public async Task<ActionResult<InventorySettingsDto>> UpdateSettings([FromBody] UpdateInventorySettingsCommand command)
    {
        var result = await _mediator.Send(command);
        return Ok(result);
    }

    // WAREHOUSES

    [HttpPost("warehouses")]
    public async Task<ActionResult<Guid>> CreateWarehouse([FromBody] CreateWarehouseCommand command)
    {
        var id = await _mediator.Send(command);
        return CreatedAtAction(nameof(GetWarehouses), new { id }, id);
    }

    [HttpGet("warehouses")]
    public async Task<ActionResult<List<WarehouseDto>>> GetWarehouses()
    {
        var result = await _mediator.Send(new GetWarehousesQuery());
        return Ok(result);
    }

    // STOCK AND TRANSACTIONS

    [HttpGet("stock")]
    public async Task<ActionResult<List<StockBalanceDto>>> GetStockBalances(
        [FromQuery] Guid? warehouseId, 
        [FromQuery] Guid? catalogItemId)
    {
        var result = await _mediator.Send(new GetStockBalancesQuery 
        { 
            WarehouseId = warehouseId,
            CatalogItemId = catalogItemId
        });
        return Ok(result);
    }

    [HttpPost("adjustments")]
    public async Task<ActionResult<Guid>> PostAdjustment([FromBody] PostInventoryAdjustmentCommand command)
    {
        // Legado: el ajuste tolera que falte la key para no romper clientes actuales,
        // pero cada request sin key es un movimiento nuevo. Se cuenta para poder exigirla
        // más adelante con datos, no por intuición.
        if (string.IsNullOrWhiteSpace(command.IdempotencyKey))
        {
            InventoryMetrics.AdjustmentMissingKey.Add(1);
            command.IdempotencyKey = Guid.NewGuid().ToString();
        }

        var id = await _mediator.Send(command);
        return Ok(id);
    }

    /// <summary>
    /// Consumo de material ligado a una tarea. Estricto: exige <c>Idempotency-Key</c> e
    /// <c>If-Match</c> sobre el saldo. Un consumo sin precondición es indistinguible de
    /// dos consumos reales, y sin key un reintento descuenta dos veces.
    /// </summary>
    [HttpPost("consumptions")]
    [RequireIfMatch]
    [Authorize(Policy = "permission:inventory:consume")]
    public async Task<ActionResult<ConsumeStockResponse>> ConsumeStock([FromBody] ConsumeStockCommand command)
    {
        command.ExpectedRowVersion = RequireIfMatchAttribute.GetExpectedVersion(HttpContext);

        var result = await _mediator.Send(command);

        var body = new ConsumeStockResponse
        {
            Id = result.Id,
            QuantityOnHand = result.QuantityOnHand,
            NegativeStockWarning = result.NegativeStockWarning,
            ETag = result.ETag,
        };

        var header = ETagHelper.ToHeader(result.ETag);
        if (!string.IsNullOrEmpty(header))
        {
            Response.Headers.ETag = header;
        }

        // Replay (misma key ya procesada) no es una creación: 200 con el estado actual.
        return result.WasReplay
            ? Ok(body)
            : StatusCode(StatusCodes.Status201Created, body);
    }
}

public class ConsumeStockResponse
{
    public Guid Id { get; set; }
    public decimal QuantityOnHand { get; set; }
    public bool NegativeStockWarning { get; set; }
    public string ETag { get; set; } = string.Empty;
}
