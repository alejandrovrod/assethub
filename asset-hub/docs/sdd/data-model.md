# Modelo de datos — AssetHub

Convenciones: PK `Id UNIQUEIDENTIFIER` (GUID v7); `TenantId UNIQUEIDENTIFIER NOT NULL` en toda tabla de negocio; `CreatedAt/CreatedBy/UpdatedAt/UpdatedBy` en todas; `IsDeleted BIT` + `DeletedAt` donde aplique soft-delete (R8). Índice por `(TenantId, ...)` en toda tabla tenant-scoped.

## 1. DB Catálogo (`AssetHubCatalog`) — sin TenantId

### Tenants
| Columna | Tipo | Notas |
|---|---|---|
| Id | uniqueidentifier PK | |
| Slug | nvarchar(63) UNIQUE | R-ONB1 |
| Name | nvarchar(200) | |
| Status | nvarchar(20) | `Provisioning`, `Active`, `Suspended`, `Deactivated` |
| Mode | nvarchar(20) | `Shared` \| `Dedicated` |
| ConnectionString | nvarchar(500) NULL | solo si `Dedicated` (cifrada) |
| PlanId | FK → Plans | |
| Locale / TimeZone | nvarchar(10) / nvarchar(50) | defaults del tenant |

### Plans
`Id`, `Code` UNIQUE (`free`, `pro`, `enterprise`), `Name`, `PriceMonthly DECIMAL`, `PriceYearly`, `MaxAssets INT`, `MaxUsers INT`, `MaxStorageMB INT`, `EnabledModules NVARCHAR(MAX)` (JSON array de códigos de módulo), `IsPublic BIT`.

### Subscriptions
`Id`, `TenantId` FK, `PlanId` FK, `Provider` (`stripe`|`manual`), `ExternalSubscriptionId` (Stripe sub id, NULL si manual), `Status` (`trialing`,`active`,`past_due`,`canceled`), `CurrentPeriodEnd`, `CreatedAt`.

### TenantMigrations
`Id`, `TenantId`, `FromMode`, `ToMode`, `Status`, `StartedAt`, `CompletedAt`, `Log`.

## 2. DB Tenant (compartida o dedicada)

### 2.1 Identidad y RBAC
Tablas ASP.NET Core Identity estándar (`AspNetUsers` con `TenantId`, `FullName`, `IsActive`; `AspNetRoles` con `TenantId`) más:

- **Permissions**: `Id`, `Code` UNIQUE (`assets.read`...), `Description`.
- **RolePermissions**: `RoleId` FK, `PermissionId` FK.
- **RefreshTokens**: `Id`, `UserId`, `Token` (hash), `ExpiresAt`, `ReplacedByTokenId`, `RevokedAt`, `FamilyId` (detección de reuso).
- **UserInvitations**: `Id`, `Email`, `RoleId`, `Token`, `ExpiresAt`, `AcceptedAt`.
- **AuditLog**: `Id`, `TenantId`, `UserId`, `Action`, `EntityType`, `EntityId`, `OldValues`/`NewValues` (JSON), `Ip`, `At`.

### 2.2 Catálogos dinámicos (M5)
- **Catalogs**: `Id`, `TenantId NULL` (NULL = catálogo global heredable), `Code` (UNIQUE por tenant), `Name`, `Description`, `IsSystem BIT`.
- **CatalogItems**: `Id`, `CatalogId` FK, `Code`, `Label`, `ParentItemId NULL` (sub-catálogos), `SortOrder`, `Metadata JSON`, `IsActive`.
- **CatalogItemTranslations**: `ItemId` FK, `Locale`, `Label` (R6).

### 2.3 Tipos de entidad de negocio (M6)
- **BusinessEntityTypes**: `Id`, `Code`, `Name`, `Description`, `Icon`, `EnabledModules JSON`, `DefaultCatalogIds JSON`, `IsActive`.
- Un tenant puede tener varios (vial + edificios). Relación N:M con templates vía `AssetTemplates.BusinessEntityTypeId`.

### 2.4 Templates de activos (M7) y EAV (M9)
- **AssetTemplates**: `Id`, `BusinessEntityTypeId` FK, `Code`, `Name`, `Description`, `SchemaJson NVARCHAR(MAX)` (JSON-schema de características), `AllowedChildTemplateIds JSON`, `LifecycleStates JSON` (estados y transiciones), `MaintenanceChecklist JSON`, `Version INT`, `IsActive`.
- **AssetAttributeValues** (EAV tipado): `Id`, `AssetId` FK, `AttributeKey`, `ValueType` (`text`,`number`,`date`,`bool`,`catalog`,`geo`,`json`), `ValueText`, `ValueNumber DECIMAL(38,10)`, `ValueDate`, `ValueBool`, `ValueCatalogItemId`, `ValueGeo GEOGRAPHY`, `ValueJson`. Validación server-side contra `SchemaJson` del template.

### 2.5 Activos (M8, M10)
- **Assets**: `Id`, `TemplateId` FK, `ParentId NULL` FK→Assets, `Path nvarchar(2000)` (materialized `/guid/guid/`), `Code` (UNIQUE por tenant, p.ej. `PTE-0001`), `Name`, `State` (del ciclo de vida del template), `Geo GEOGRAPHY NULL`, `GeoType` (`Point|LineString|Polygon`), `InstalledAt`, `CommissionedAt`, `ConditionIndex DECIMAL(5,2) NULL` (0–100), índice espacial en `Geo`, índice en `(TenantId, Path)` y `(TenantId, ParentId)`.
- **AssetHierarchy** (closure): `AncestorId`, `DescendantId`, `Depth INT`; PK compuesta; índice `(DescendantId, Depth)`.
- **AssetAttachments**: `Id`, `AssetId`, `FileName`, `BlobUri`, `ContentType`, `SizeBytes`, `Kind` (`photo`,`doc`,`plan`).
- **AssetLifecycleEvents**: `Id`, `AssetId`, `EventType` (alta, cambio estado, intervención, baja), `FromState`, `ToState`, `Notes`, `At`, `UserId`.

### 2.6 Incidencias y prevención (M11)
- **Incidents**: `Id`, `AssetId` FK, `TypeCatalogItemId`, `PriorityItemId`, `Status` (`reported`,`triaged`,`assigned`,`in_progress`,`resolved`,`closed`,`cancelled`), `Title`, `Description`, `ReportedByUserId`, `ReportedAt`, `Geo GEOGRAPHY NULL`, `ResolvedAt`, índice `(TenantId, Status, PriorityItemId)`.
- **IncidentAttachments**: como AssetAttachments.
- **PreventivePlans**: `Id`, `TemplateId` o `AssetId`, `Name`, `TriggerType` (`calendar`,`condition`,`usage`), `CronExpression` o `IntervalDays`, `ConditionRuleJson` (p.ej. `conditionIndex < 40`), `ChecklistJson`, `NextRunAt`, `IsActive`.

### 2.7 Mantenimiento (M12)
- **MaintenanceOrders**: `Id`, `AssetId`, `IncidentId NULL`, `PreventivePlanId NULL`, `Kind` (`corrective`,`preventive`), `Status` (`draft`,`approved`,`scheduled`,`in_progress`,`done`,`verified`,`cancelled`), `AssignedTeamId`, `AssignedEmployeeId`, `ScheduledStart/End`, `CompletedAt`, `LaborCost`, `PartsCost`, `Notes`.
- **MaintenanceParts**: `Id`, `OrderId`, `CatalogItemId` (repuesto), `Quantity`, `UnitCost`.

### 2.8 Personal (M13)
- **Employees**: `Id`, `UserId NULL` (puede no tener acceso al sistema), `FullName`, `Email`, `Phone`, `RoleCatalogItemId` (oficio), `SkillsJson`, `IsActive`.
- **Teams**: `Id`, `Name`, `IsActive`; **TeamMembers**: `TeamId`, `EmployeeId`, `IsLead`.
- **EmployeeAvailability**: `Id`, `EmployeeId`, `DayOfWeek`, `StartTime`, `EndTime`, `IsAvailable`.

### 2.9 Tareas (M14, M15)
- **Tasks**: `Id`, `Kind` (`install`,`repair`,`inspect`,`remove`,`other`), `AssetId NULL`, `MaintenanceOrderId NULL`, `IncidentId NULL`, `Title`, `Description`, `PriorityItemId`, `Status` (`backlog`,`todo`,`in_progress`,`blocked`,`review`,`done`,`cancelled`), `AssignedEmployeeId`, `AssignedTeamId`, `DueAt`, `StartedAt`, `CompletedAt`, `RecurrenceId NULL`, índice `(TenantId, Status)`, `(TenantId, AssignedEmployeeId, Status)`.
- **TaskRecurrences**: `Id`, `CronExpression`, `IntervalDays`, `NextRunAt`, `EndsAt NULL`, `TaskTemplateJson`.
- **TaskComments**: `Id`, `TaskId`, `UserId`, `Body`, `At`.
- **TaskEvidences**: `Id`, `TaskId`, `Kind` (`photo`,`signature`,`note`,`geocheck`), `BlobUri`, `Geo GEOGRAPHY NULL`, `CapturedByUserId`, `CapturedAt`, `MetadataJson`.
- **TaskStatusHistory**: `Id`, `TaskId`, `FromStatus`, `ToStatus`, `UserId`, `At`.

## 3. Índices y RLS

- RLS: función predicado `TenantId = CAST(SESSION_CONTEXT(N'TenantId') AS uniqueidentifier)` sobre todas las tablas tenant-scoped, política `TenantPolicy` con `BLOCK PREDICATE` en escrituras.
- Índices espaciales: `Assets.Geo`, `Incidents.Geo`.
- `AssetAttributeValues`: índice `(TenantId, AssetId, AttributeKey)`; índice filtrado por `ValueType` para búsquedas.
