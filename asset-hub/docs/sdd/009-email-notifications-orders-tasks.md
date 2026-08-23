# 009 - Email Notifications for Orders & Tasks

## Context & Motivation

The user requested that the email notification system, which was originally implemented to notify employees when an Asset enters a specific state (via the `AssetOnEnterTriggerHandler`), be expanded to also cover the creation of Maintenance Orders and Work Tasks. 

When a Maintenance Order or a Work Task is created, the system must check its dynamic properties (stored in `PropertiesJson`) for specific target fields (like `reportar_a` or `recibe_a`). If an assigned employee's GUID is found in these fields, the system should dispatch an automated email notifying them of the new assignment.

The following issues were addressed:
1. **Maintenance Order Notifications:** Ensure an email is sent when an order is created manually or generated automatically from an incident or a preventive plan.
2. **Work Task Notifications:** Ensure an email is sent when a task is created manually or generated automatically from a preventive plan.
3. **Properties Propagation in Auto-generation:** Make sure that when background jobs (like `EvaluatePreventivePlanCommand` or `IncidentAssignedEventHandler`) create orders and tasks, they properly inherit the `PropertiesJson` from the parent asset or incident so the notification target fields are present.

## Architectural & Code Changes

### 1. Domain Events Introduction
To decouple the email sending logic from the core command handlers and maintain a clean architecture, two new domain events were introduced:
- `MaintenanceOrderCreatedEvent.cs`: Carries the Order ID, Tenant ID, and `PropertiesJson`.
- `WorkTaskCreatedEvent.cs`: Carries the Task ID, Tenant ID, and `PropertiesJson`.

### 2. MediatR Event Handlers
Two new `INotificationHandler` implementations were created to listen to these events:
- **`MaintenanceOrderCreatedEventHandler.cs`**: Parses the `PropertiesJson` looking for `reportar_a` or `recibe_a`. If a valid employee ID is found, it fetches the employee's email and uses `IEmailService` to send a notification with the subject "Notificación: Nueva Orden de Mantenimiento".
- **`WorkTaskCreatedEventHandler.cs`**: Uses the same JSON parsing logic but sends an email with the subject "Notificación: Nueva Tarea de Trabajo".

### 3. Event Dispatching (Publishing)
The corresponding commands were updated to inject `IMediator` and publish the new events:
- **`CreateMaintenanceOrderCommand.cs`**: Publishes the order event upon successful creation.
- **`CreateWorkTaskCommand.cs`**: Publishes the task event upon successful creation.
- **`IncidentAssignedEventHandler.cs`**: When an incident is assigned, a corrective Maintenance Order is automatically generated. The event is now published for this auto-generated order.
- **`EvaluatePreventivePlanCommand.cs`**: When a preventive plan evaluates to true and generates an order or task, it now populates the new entity's `PropertiesJson` with the `asset.PropertiesJson` and publishes the respective creation events.

### 4. Test Corrections
- Fixed `MaintenanceWorkflowIntegrationTests.cs` and `CreateWorkTaskTests.cs` to inject mocked instances of `IMediator` into the modified handlers.
