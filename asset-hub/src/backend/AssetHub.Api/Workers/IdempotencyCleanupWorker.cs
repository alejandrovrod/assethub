using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Domain.Sync;
using AssetHub.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AssetHub.Api.Workers;

/// <summary>
/// Purga los registros de idempotencia vencidos.
///
/// Retención de 72 h: es la ventana en la que un cliente offline puede reintentar
/// una mutación con seguridad. Pasado ese plazo, la key se considera nueva y el
/// cliente debe confirmar antes de reenviar (ver spec 021, §6.5).
///
/// Importante: corre sin tenant, así que DEBE usar <c>IgnoreQueryFilters</c>.
/// El aislamiento por query filter de <see cref="TenantDbContext"/> dejaría la
/// consulta vacía y la purga no borraría nada.
/// </summary>
public sealed class IdempotencyCleanupWorker : BackgroundService
{
    private static readonly TimeSpan Retention = TimeSpan.FromHours(72);
    private static readonly TimeSpan AbandonedReservation = TimeSpan.FromHours(24);
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);
    private static readonly TimeSpan StartupDelay = TimeSpan.FromMinutes(1);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<IdempotencyCleanupWorker> _logger;

    public IdempotencyCleanupWorker(
        IServiceScopeFactory scopeFactory,
        ILogger<IdempotencyCleanupWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "IdempotencyCleanupWorker starting. Retention: {Retention}h, interval: {Interval}h.",
            Retention.TotalHours, Interval.TotalHours);

        try
        {
            await Task.Delay(StartupDelay, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PurgeAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Idempotency cleanup failed; will retry on the next cycle.");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    private async Task PurgeAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();

        var cutoff = DateTime.UtcNow - Retention;
        var abandonedCutoff = DateTime.UtcNow - AbandonedReservation;

        var completed = await db.HttpIdempotencyRecords
            .IgnoreQueryFilters()
            .Where(r => r.Status != HttpIdempotencyStatus.InProgress && r.CreatedAt < cutoff)
            .ExecuteDeleteAsync(cancellationToken);

        var abandoned = await db.HttpIdempotencyRecords
            .IgnoreQueryFilters()
            .Where(r => r.Status == HttpIdempotencyStatus.InProgress && r.CreatedAt < abandonedCutoff)
            .ExecuteDeleteAsync(cancellationToken);

        if (completed > 0 || abandoned > 0)
        {
            _logger.LogInformation(
                "Idempotency cleanup removed {Completed} completed and {Abandoned} abandoned records.",
                completed, abandoned);
        }
    }
}
