using System;
using System.Linq;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Common.Exceptions;
using AssetHub.Application.Field;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Inventory.Queries;
using AssetHub.Domain.Concurrency;
using AssetHub.Domain.Exceptions;
using AssetHub.Domain.Inventory;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace AssetHub.Application.Inventory.Commands;

/// <summary>
/// Consumo de material desde la tablet, ligado a una tarea.
///
/// No reutiliza <c>POST /inventory/adjustments</c> a propósito: un ajuste es una
/// corrección de inventario del backoffice (puede ser positivo), un consumo es un gasto
/// causado por una OT. Mezclarlos obliga al cliente a mandar cantidades negativas y deja
/// los consumos sin vínculo con la tarea que los justifica.
/// </summary>
public class ConsumeStockCommand : IRequest<ConsumeStockResult>
{
    public Guid WarehouseId { get; set; }
    public Guid CatalogItemId { get; set; }
    public Guid WorkTaskId { get; set; }

    /// <summary>Cantidad consumida, siempre positiva. El signo lo pone el handler.</summary>
    public decimal Quantity { get; set; }

    public string? Reason { get; set; }

    /// <summary>
    /// Obligatoria: es la única forma de que un reintento offline no descuente dos veces.
    /// El servidor ya no inventa una key (ver A2 en el spec 022).
    /// </summary>
    public string IdempotencyKey { get; set; } = string.Empty;

    /// <summary>
    /// Versión del <see cref="StockBalance"/> que el cliente leyó. <c>null</c> cuando el
    /// header era <c>If-Match: *</c>.
    /// </summary>
    public byte[]? ExpectedRowVersion { get; set; }
}

public class ConsumeStockResult
{
    public Guid Id { get; set; }
    public decimal QuantityOnHand { get; set; }
    public bool NegativeStockWarning { get; set; }

    [JsonPropertyName("etag")]
    public string ETag { get; set; } = string.Empty;

    /// <summary>El consumo ya existía con esa key; no se volvió a descontar.</summary>
    public bool WasReplay { get; set; }
}

public class ConsumeStockCommandHandler : IRequestHandler<ConsumeStockCommand, ConsumeStockResult>
{
    private readonly ITenantDbContext _db;
    private readonly IInventoryPostingService _postingService;
    private readonly ITenantResolver _tenantResolver;
    private readonly IMediator _mediator;
    private readonly FieldTaskAccess _access;

    public ConsumeStockCommandHandler(
        ITenantDbContext db,
        IInventoryPostingService postingService,
        ITenantResolver tenantResolver,
        IMediator mediator,
        FieldTaskAccess access)
    {
        _db = db;
        _postingService = postingService;
        _tenantResolver = tenantResolver;
        _mediator = mediator;
        _access = access;
    }

    public async Task<ConsumeStockResult> Handle(ConsumeStockCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
        {
            throw new DomainException(
                "idempotency_key_required",
                "An Idempotency-Key header is required for stock consumptions.");
        }

        if (request.Quantity <= 0)
        {
            throw new DomainException("validation_error", "Quantity must be greater than zero.");
        }

        var tenantId = _tenantResolver.GetCurrentTenantId()
            ?? throw new UnauthorizedAccessException("A tenant is required to consume stock.");

        // 1. Replay antes de mirar stock: si esta key ya se procesó, el estado actual
        // del inventario es irrelevante. Reintentar un consumo ya aplicado no debe
        // fallar por "stock insuficiente" —ya se descontó— ni volver a descontar.
        var existing = await _db.InventoryTransactions
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantId == tenantId && t.IdempotencyKey == request.IdempotencyKey, cancellationToken);

        if (existing is not null)
        {
            var currentBalance = await _db.StockBalances
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    s => s.WarehouseId == existing.WarehouseId && s.CatalogItemId == existing.CatalogItemId,
                    cancellationToken);

            return new ConsumeStockResult
            {
                Id = existing.Id,
                QuantityOnHand = currentBalance?.QuantityOnHand ?? 0,
                NegativeStockWarning = currentBalance is { QuantityOnHand: < 0 },
                ETag = RowVersionToken.ToToken(currentBalance?.RowVersion) ?? string.Empty,
                WasReplay = true,
            };
        }

        // 2. Referencias: el filtro global de cada entidad ya excluye otro tenant y lo
        // borrado, así que un id ajeno se comporta como inexistente (404, sin filtrar
        // información sobre la existencia del recurso en otro tenant). La tarea se
        // materializa porque la propiedad sólo se puede evaluar con la fila en mano.
        var task = await _db.WorkTasks
            .FirstOrDefaultAsync(t => t.Id == request.WorkTaskId, cancellationToken);

        if (task is null)
        {
            throw new NotFoundException("WorkTask", request.WorkTaskId);
        }

        // 403 si el técnico de campo intenta consumir contra una tarea ajena: el consumo
        // descuenta stock del almacén y queda imputado a esa OT, así que la tarea es parte
        // de la autorización, no un dato decorativo.
        await _access.EnsureCanOperateAsync(task, cancellationToken);

        if (!await _db.Warehouses.AnyAsync(w => w.Id == request.WarehouseId, cancellationToken))
        {
            throw new NotFoundException("Warehouse", request.WarehouseId);
        }

        if (!await _db.CatalogItems.AnyAsync(c => c.Id == request.CatalogItemId, cancellationToken))
        {
            throw new NotFoundException("CatalogItem", request.CatalogItemId);
        }

        var settings = await _db.TenantInventorySettings
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId, cancellationToken);

        var allowNegative = settings?.AllowNegativeStock ?? false;

        var stock = await _db.StockBalances
            .FirstOrDefaultAsync(
                s => s.WarehouseId == request.WarehouseId && s.CatalogItemId == request.CatalogItemId,
                cancellationToken);

        if (stock is null)
        {
            if (!allowNegative)
            {
                throw await BuildInsufficientStockAsync(request, available: 0, cancellationToken);
            }

            if (request.ExpectedRowVersion is not null)
            {
                // Con If-Match explícito el cliente leyó una fila que ya no está.
                throw new ConcurrencyException(
                    "The stock balance no longer exists.",
                    currentETag: null);
            }

            // El servicio de posting se niega a crear un saldo negativo desde cero
            // (guard razonable: sin fila no hay nada que descontar). Bajo una política
            // que permite negativos eso dejaría al técnico sin poder registrar un
            // consumo que la política sí autoriza, así que se crea el saldo en cero y
            // el descuento lo aplica el servicio, igual que en cualquier otro consumo.
            stock = new StockBalance
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                WarehouseId = request.WarehouseId,
                CatalogItemId = request.CatalogItemId,
                QuantityOnHand = 0,
                AverageUnitCost = 0,
                UpdatedAt = DateTime.UtcNow,
            };

            _db.StockBalances.Add(stock);
            await _db.SaveChangesAsync(cancellationToken);
        }
        else if (request.ExpectedRowVersion is not null
                 && !request.ExpectedRowVersion.SequenceEqual(stock.RowVersion))
        {
            // El rowversion de EF sólo cubre la ventana leer-modificar-escribir del
            // handler (milisegundos). El conflicto que importa es el del técnico que
            // leyó el saldo hace dos horas y otro usuario ya consumió.
            throw new ConcurrencyException(
                "The stock balance changed since you last read it.",
                currentETag: RowVersionToken.ToToken(stock.RowVersion));
        }
        else if (stock.QuantityOnHand < request.Quantity && !allowNegative)
        {
            throw await BuildInsufficientStockAsync(request, stock.QuantityOnHand, cancellationToken);
        }

        InventoryTransaction transaction;
        try
        {
            transaction = await _postingService.PostTransactionAsync(
                warehouseId: request.WarehouseId,
                catalogItemId: request.CatalogItemId,
                quantity: -request.Quantity,
                unitCost: 0,
                type: InventoryTransactionType.Issue,
                reason: request.Reason ?? "Field consumption",
                idempotencyKey: request.IdempotencyKey,
                maintenanceOrderId: null,
                workTaskId: request.WorkTaskId,
                cancellationToken: cancellationToken);
        }
        catch (DomainException ex) when (ex.Code == InsufficientStockException.ErrorCode)
        {
            // El servicio revalidó después de nuestra lectura: otro request consumió en
            // el medio. Se traduce al mismo 409 con alternativas frescas, en vez de
            // dejar caer el mensaje genérico sin datos accionables.
            var available = await _db.StockBalances
                .AsNoTracking()
                .Where(s => s.WarehouseId == request.WarehouseId && s.CatalogItemId == request.CatalogItemId)
                .Select(s => (decimal?)s.QuantityOnHand)
                .FirstOrDefaultAsync(cancellationToken) ?? 0;

            throw await BuildInsufficientStockAsync(request, available, cancellationToken);
        }

        await _db.SaveChangesAsync(cancellationToken);

        // El servicio muta la instancia rastreada; EF trae el rowversion nuevo tras el
        // UPDATE. La releemos igual para no depender del proveedor (InMemory no lo genera).
        // Se busca por (almacén, ítem) y no por Id: si el saldo no existía y la política
        // permite negativos, la fila la creó el servicio y no tenemos su Id antes.
        var updated = await _db.StockBalances
            .AsNoTracking()
            .FirstAsync(
                s => s.WarehouseId == request.WarehouseId && s.CatalogItemId == request.CatalogItemId,
                cancellationToken);

        return new ConsumeStockResult
        {
            Id = transaction.Id,
            QuantityOnHand = updated.QuantityOnHand,
            NegativeStockWarning = updated.QuantityOnHand < 0,
            ETag = RowVersionToken.ToToken(updated.RowVersion) ?? string.Empty,
            WasReplay = false,
        };
    }

    private async Task<InsufficientStockException> BuildInsufficientStockAsync(
        ConsumeStockCommand request,
        decimal available,
        CancellationToken cancellationToken)
    {
        var alternatives = await _mediator.Send(
            new GetStockAlternativesQuery
            {
                CatalogItemId = request.CatalogItemId,
                ExcludeWarehouseId = request.WarehouseId,
            },
            cancellationToken);

        return new InsufficientStockException(available, request.Quantity, alternatives);
    }
}
