using System;
using System.Threading;
using System.Threading.Tasks;
using AssetHub.Application.Interfaces;
using AssetHub.Application.Maintenance.Events;
using AssetHub.Application.Notifications.Commands;
using AssetHub.Application.Notifications.EventHandlers;
using AssetHub.Domain.Maintenance;
using AssetHub.Domain.Staff;
using AssetHub.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AssetHub.Api.Tests.PreventivePlans;

public class NotifyOnPreventivePlanExecutionHandlerTests
{
    private sealed class NotificationCapturingMediator : IMediator
    {
        public List<CreateNotificationCommand> SentCommands { get; } = new();

        public Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = default)
        {
            if (request is CreateNotificationCommand cmd)
                SentCommands.Add(cmd);
            return Task.FromResult(default(TResponse)!);
        }

        public Task Send<TRequest>(TRequest request, CancellationToken cancellationToken = default) where TRequest : IRequest
        {
            if (request is CreateNotificationCommand cmd)
                SentCommands.Add(cmd);
            return Task.CompletedTask;
        }

        public Task<object?> Send(object request, CancellationToken cancellationToken = default)
        {
            if (request is CreateNotificationCommand cmd)
                SentCommands.Add(cmd);
            return Task.FromResult<object?>(null);
        }

        public Task Publish(object notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task Publish<TNotification>(TNotification notification, CancellationToken cancellationToken = default) where TNotification : INotification => Task.CompletedTask;
        public IAsyncEnumerable<TResponse> CreateStream<TResponse>(IStreamRequest<TResponse> request, CancellationToken cancellationToken = default) => AsyncEnumerable.Empty<TResponse>();
        public IAsyncEnumerable<object?> CreateStream(object request, CancellationToken cancellationToken = default) => AsyncEnumerable.Empty<object?>();
    }

    [Fact]
    public async Task EvaluatePlan_CreatesNotification_ForAssignee()
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var employeeId = Guid.NewGuid();
        await using var db = PreventivePlanTestHelper.CreateDbContext(tenantId);

        db.Employees.Add(new Employee
        {
            Id = employeeId,
            TenantId = tenantId,
            UserId = userId,
            FirstName = "Test",
            LastName = "User",
            Email = "test@example.com",
            IsActive = true,
        });
        await db.SaveChangesAsync();

        var mediator = new NotificationCapturingMediator();
        var handler = new NotifyOnPreventivePlanExecutionHandler(mediator, db);

        await handler.Handle(new PreventivePlanExecutedEvent
        {
            PlanId = Guid.NewGuid(),
            PlanName = "Monthly Check",
            TenantId = tenantId,
            AssignedEmployeeId = employeeId,
            GeneratedItems =
            {
                new GeneratedItemInfo
                {
                    EntityType = PreventivePlanConstants.GeneratedEntityTypeWorkTask,
                    EntityId = Guid.NewGuid(),
                    AssetId = Guid.NewGuid(),
                    AssetName = "Pump A",
                }
            }
        }, CancellationToken.None);

        Assert.Single(mediator.SentCommands);
        Assert.Equal(userId, mediator.SentCommands[0].UserId);
        Assert.Contains("Monthly Check", mediator.SentCommands[0].Title);
    }
}
