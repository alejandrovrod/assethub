using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Assets.Events;
using AssetHub.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AssetHub.Application.Assets.EventHandlers;

public class AssetOnEnterTriggerHandler : INotificationHandler<AssetStateChangedEvent>
{
    private readonly ITenantDbContext _db;
    private readonly ILogger<AssetOnEnterTriggerHandler> _logger;

    public AssetOnEnterTriggerHandler(ITenantDbContext db, ILogger<AssetOnEnterTriggerHandler> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task Handle(AssetStateChangedEvent notification, CancellationToken cancellationToken)
    {
        var asset = await _db.Assets
            .Include(a => a.AssetTemplate)
            .FirstOrDefaultAsync(a => a.Id == notification.AssetId, cancellationToken);

        if (asset == null || asset.AssetTemplate == null)
            return;

        var config = asset.AssetTemplate.LifecycleStates;
        if (config == null || config.States == null) return;

        if (config.States.TryGetValue(notification.ToState, out var stateConfig))
        {
            if (!string.IsNullOrWhiteSpace(stateConfig.OnEnterAction))
            {
                // DISPARADOR DE ACCIONES ON ENTER
                // En una aplicación real, aquí llamaríamos a un bus de mensajes (RabbitMQ, ServiceBus)
                // o usaríamos un Patrón Outbox para asegurar que la acción se ejecute.
                
                _logger.LogInformation("================================================");
                _logger.LogInformation("⚡ TRIGGER ON_ENTER DETECTADO PARA ESTADO: {State}", notification.ToState);
                _logger.LogInformation("⚡ ACCIÓN A EJECUTAR: {Action}", stateConfig.OnEnterAction);
                _logger.LogInformation("⚡ ACTIVO AFECTADO: {AssetId}", notification.AssetId);
                _logger.LogInformation("================================================");
                
                // Simulación de Dispatcher
                switch (stateConfig.OnEnterAction)
                {
                    case "CREATE_WORK_ORDER":
                        _logger.LogInformation("=> Ejecutando Side Effect: Creando Orden de Trabajo automáticamente...");
                        break;
                    case "NOTIFY_MANAGER":
                        _logger.LogInformation("=> Ejecutando Side Effect: Enviando email/SMS al supervisor...");
                        break;
                    default:
                        _logger.LogInformation("=> Ejecutando Side Effect Genérico: {Action}", stateConfig.OnEnterAction);
                        break;
                }
            }
        }
    }
}
