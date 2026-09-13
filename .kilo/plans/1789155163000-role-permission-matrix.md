# Plan: Role-Permission Matrix Design (M3 Enhancement)

## Objective
Design a comprehensive role-permission matrix aligned with the existing security infrastructure, supporting fine-grained permissions per entity/action across all modules, with predefined roles that tenants can customize.

## Current State Analysis

### Existing Infrastructure
- **Identity**: ASP.NET Core Identity with `ApplicationUser` (TenantId, FullName, IsActive), `ApplicationRole` (TenantId)
- **Permissions**: `Permission` (Id, Code, Description) + `RolePermission` (RoleId, PermissionId) junction table
- **JWT tokens**: Include `roles` and `perms` claims; permissions resolved at login via `LoginCommandHandler`
- **Seeded roles**: `admin`, `Tenant Admin`, `Asset Manager`, `Technician`
- **Plan gating**: `[RequirePlanLimits("module")]` attribute on controllers
- **Current auth**: Mix of `[Authorize]` and `[Authorize(Roles = "admin,Tenant Admin")]` — spec requires R3.4 (permissions only)

### User Requirements (from conversation)
- No cross-tenant SuperAdmin role
- Predefined roles + tenant customization
- Fine-grained permissions per entity/action
- Flat roles (no inheritance)
- Feature gating by plan; base roles open to all plans

## Architecture Decisions

### Decision 1: Permission Code Convention
Use structured permission codes: `{module}:{entity}:{action}`

Examples:
- `assets:read` — read assets
- `assets:write` — create/update assets
- `assets:delete` — delete assets
- `incidents:assign` — assign incidents
- `maintenance:approve` — approve maintenance orders
- `tasks:close` — close work tasks

### Decision 2: Permission Scope
Permissions are tenant-scoped (R1). Each tenant defines its own permission sets assigned to roles. System provides the permission code catalog; tenants decide which codes each role includes.

### Decision 3: Roles Model
- System provides **base roles** with no permissions by default (empty slate)
- Tenants populate roles with permissions from the global permission catalog
- Each tenant can rename and customize their roles
- No role inheritance — flat many-to-many (Role ↔ Permissions)

### Decision 4: Permission Storage
Permissions stored in `SecurityDbContext` (`Permissions` + `RolePermissions` tables). Re-evaluated at login and reflected in JWT `perms` claim. No runtime permission check bypasses JWT claims.

## Module × Entity × Action Permission Matrix

### M1 — Landing Page
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| Landing | View | `landing:view` | View public landing page |
| Landing | Signup | `landing:signup` | Create new tenant account |

### M2 — Tenancy & Onboarding
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| Tenant | View | `tenant:read` | View tenant info |
| Tenant | Update | `tenant:write` | Update tenant settings |
| User | Invite | `user:invite` | Invite users to tenant |
| User | Manage | `user:manage` | Manage users (activate, deactivate, change role) |

### M3 — Seguridad (Identity, RBAC, MFA)
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| Role | View | `roles:read` | View roles and permissions |
| Role | Manage | `roles:manage` | Create/update/delete roles and assign permissions |
| User | View | `users:read` | View user list and profiles |
| User | Manage | `users:manage` | Create/update/deactivate users |
| MFA | Configure | `mfa:configure` | Enable/disable MFA for self |
| MFA | Force | `mfa:force` | Enforce MFA policy for tenant |
| Audit | View | `audit:read` | View audit logs |

### M4 — Planes de pago y suscripciones
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| Plan | View | `billing:read` | View plan details |
| Plan | Subscribe | `billing:subscribe` | Change subscription/plan |
| Plan | Manage | `billing:manage` | Manage billing (invoices, payment methods) |

### M5 — Catálogos dinámicos
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| Catalog | View | `catalogs:read` | View catalogs |
| Catalog | Create | `catalogs:create` | Create catalogs |
| Catalog | Update | `catalogs:update` | Update catalogs |
| Catalog | Delete | `catalogs:delete` | Delete catalogs |
| CatalogItem | View | `catalog-items:read` | View catalog items |
| CatalogItem | Create | `catalog-items:create` | Create catalog items |
| CatalogItem | Update | `catalog-items:update` | Update catalog items |
| CatalogItem | Delete | `catalog-items:delete` | Delete catalog items |

### M6 — Tipos de entidad de negocio
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| EntityType | View | `entity-types:read` | View entity types |
| EntityType | Create | `entity-types:create` | Create entity types |
| EntityType | Update | `entity-types:update` | Update entity types |
| EntityType | Delete | `entity-types:delete` | Delete entity types |

### M7 — Templates de activos
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| AssetTemplate | View | `asset-templates:read` | View asset templates |
| AssetTemplate | Create | `asset-templates:create` | Create asset templates |
| AssetTemplate | Update | `asset-templates:update` | Update asset templates |
| AssetTemplate | Delete | `asset-templates:delete` | Delete asset templates |
| AssetTemplate | Clone | `asset-templates:clone` | Clone/version asset templates |

### M8 — Activos (jerarquía árbol)
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| Asset | View | `assets:read` | View assets |
| Asset | Create | `assets:create` | Create assets |
| Asset | Update | `assets:update` | Update assets |
| Asset | Delete | `assets:delete` | Delete assets (soft delete, R8) |
| Asset | Move | `assets:move` | Move assets in hierarchy |
| Asset | ChangeState | `assets:change-state` | Change asset state via lifecycle |
| Asset | Attachments | `assets:attachments` | Upload/download asset attachments |
| Asset | Analytics | `assets:analytics` | View asset analytics/reports |

### M9 — Características de activos (EAV)
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| AssetProperty | View | `assets-properties:read` | View asset properties/attributes |
| AssetProperty | Write | `assets-properties:write` | Modify asset properties values |

### M10 — Geolocalización
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| GeoData | View | `geo:read` | View geo data |
| GeoData | Write | `geo:write` | Create/update geo data |

### M11 — Incidencias y prevención
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| Incident | View | `incidents:read` | View incidents |
| Incident | Create | `incidents:create` | Report/create incidents |
| Incident | Update | `incidents:update` | Update incidents |
| Incident | Delete | `incidents:delete` | Delete incidents (soft delete) |
| Incident | Assign | `incidents:assign` | Assign incidents to employees |
| Incident | Triage | `incidents:triage` | Set priority during triage |
| Incident | ChangeState | `incidents:change-state` | Change incident state |
| Incident | Close | `incidents:close` | Close/resolve incidents |
| Incident | Timeline | `incidents:timeline` | View incident timeline |
| Incident | Export | `incidents:export` | Export incident reports |
| PreventivePlan | View | `preventive-plans:read` | View preventive plans |
| PreventivePlan | Create | `preventive-plans:create` | Create preventive plans |
| PreventivePlan | Update | `preventive-plans:update` | Update preventive plans |
| PreventivePlan | Delete | `preventive-plans:delete` | Delete preventive plans |
| PreventivePlan | Execute | `preventive-plans:execute` | Execute/trigger preventive plans |

### M12 — Mantenimiento
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| MaintenanceOrder | View | `maintenance:read` | View maintenance orders |
| MaintenanceOrder | Create | `maintenance:create` | Create maintenance orders |
| MaintenanceOrder | Update | `maintenance:update` | Update maintenance orders |
| MaintenanceOrder | Delete | `maintenance:delete` | Delete maintenance orders |
| MaintenanceOrder | Approve | `maintenance:approve` | Approve orders |
| MaintenanceOrder | Schedule | `maintenance:schedule` | Schedule orders |
| MaintenanceOrder | Start | `maintenance:start` | Start orders |
| MaintenanceOrder | Complete | `maintenance:complete` | Complete orders |
| MaintenanceOrder | Verify | `maintenance:verify` | Verify completed orders |
| MaintenanceOrder | Reject | `maintenance:reject` | Reject orders |
| MaintenanceOrder | Cancel | `maintenance:cancel` | Cancel orders |
| MaintenanceOrder | Costs | `maintenance:costs` | Update costs |
| MaintenanceOrder | Assign | `maintenance:assign` | Assign employees to orders |
| MaintenancePart | View | `maintenance-parts:read` | View parts |
| MaintenancePart | Manage | `maintenance-parts:manage` | Add/remove parts |
| MaintenanceOrder | Export | `maintenance:export` | Export orders |

### M13 — Personal y equipos
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| Employee | View | `employees:read` | View employees |
| Employee | Create | `employees:create` | Create employees |
| Employee | Update | `employees:update` | Update employees |
| Employee | Delete | `employees:delete` | Delete/deactivate employees |
| Employee | AssignRole | `employees:assign-role` | Assign/change employee roles |
| Team | View | `teams:read` | View teams |
| Team | Create | `teams:create` | Create teams |
| Team | Update | `teams:update` | Update teams |
| Team | Delete | `teams:delete` | Delete teams |

### M14 — Tareas y programación
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| WorkTask | View | `tasks:read` | View tasks |
| WorkTask | Create | `tasks:create` | Create tasks |
| WorkTask | Update | `tasks:update` | Update tasks |
| WorkTask | Delete | `tasks:delete` | Delete tasks |
| WorkTask | Assign | `tasks:assign` | Assign tasks to employees |
| WorkTask | Start | `tasks:start` | Start tasks |
| WorkTask | Complete | `tasks:complete` | Complete tasks |
| WorkTask | Cancel | `tasks:cancel` | Cancel tasks |
| WorkTask | Comment | `tasks:comment` | Add comments |
| WorkTask | Evidence | `tasks:evidence` | Upload evidence |
| WorkTask | Recurrence | `tasks:recurrence` | Configure recurrence |

### M15 — Seguimiento de tareas
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| TaskBoard | View | `tasks-board:read` | View task boards (Kanban) |
| TaskBoard | Configure | `tasks-board:configure` | Configure task views/filters |
| TaskStatus | View | `task-status:read` | View task status history |
| TaskStatus | Update | `task-status:update` | Update task status progression |

### M16 — Análisis de vida del activo
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| Analytics | View | `analytics:read` | View dashboards and analytics |
| Analytics | Export | `analytics:export` | Export reports |
| Prediction | View | `predictions:read` | View health predictions |

### M20 — Inventario y Almacenes
| Entity | Action | Permission Code | Description |
|--------|--------|----------------|-------------|
| Inventory | View | `inventory:read` | View inventory settings/stock |
| Inventory | Configure | `inventory:configure` | Configure inventory settings |
| Warehouse | View | `warehouses:read` | View warehouses |
| Warehouse | Create | `warehouses:create` | Create warehouses |
| Warehouse | Update | `warehouses:update` | Update warehouses |
| Warehouse | Delete | `warehouses:delete` | Delete warehouses |
| Stock | View | `stock:read` | View stock balances |
| Stock | Adjust | `stock:adjust` | Create stock adjustments |
| Transaction | View | `transactions:read` | View inventory transactions |
| Receipt | Create | `receipts:create` | Record receipts |

## Default Roles Definition

### Role: Tenant Admin (base, open to all plans)
**Description**: Full management access within the tenant. Manages configuration, users, and all modules.

**Permissions**: All permissions in the catalog by default.

**Plan gate**: None — available to all plans.

### Role: Admin (system-level, but tenant-scoped per user requirement)
**Description**: Administrative access equivalent to Tenant Admin. Used primarily during onboarding.

**Permissions**: Same as Tenant Admin.

**Plan gate**: None.

### Role: Asset Manager (base role, feature-gated)
**Description**: Manages assets, templates, and analytics. Cannot manage users or system settings.

**Permissions**: All M5-M9, M16, M8 permissions; M7 templates; M11-M12 read; M13 read; M14 read; M20 read.

**Plan gate**: Requires plan module "assets" or "maintenance".

### Role: Technician (base role, feature-gated)
**Description**: Executes maintenance orders, completes tasks, uploads evidence. Read-only for analytics.

**Permissions**: M11 read/create own incidents; M12 read/create/complete orders assigned; M14 tasks full; M15 read; M8 read.

**Plan gate**: Requires plan module "maintenance".

### Role: Viewer (base role, open to all plans)
**Description**: Read-only access to all visible modules.

**Permissions**: All `:read` permissions across all modules.

**Plan gate**: None.

## Role-Permission Assignment Logic

### Rule R-ROLE-1: Base Role Population
When a new tenant is created (M2 onboarding), three default roles are created:
1. **Tenant Admin** — all permissions
2. **Asset Manager** — module-specific permissions (M5-M16, M20)
3. **Technician** — execution-specific permissions (M11-M15)
4. **Viewer** — read-only permissions

The seeded role names in Program.cs (`admin`, `Tenant Admin`, `Asset Manager`, `Technician`) will map to these. The `admin` role maps to Tenant Admin in multi-tenant context (no SuperAdmin).

### Rule R-ROLE-2: Tenant Customization
Tenants can:
- Rename default roles
- Add/remove permissions from any role
- Create custom roles with any permission combination
- Delete custom roles (but not the last admin role)

### Rule R-ROLE-3: Minimum Admin Constraint
Each tenant must always have at least one role with `roles:manage` permission. Prevents locking out all admins.

### Rule R-ROLE-4: Permission Validation
When a tenant assigns a permission to a role:
- Permission code must exist in the global catalog (M3)
- If permission belongs to a module not enabled in the tenant's plan → 400 error
- Circular permission assignments are not possible (permissions are atomic)

## Integration Points

### Existing Infrastructure Compatibility

| Component | Integration Approach |
|-----------|---------------------|
| `LoginCommandHandler` | No changes needed — already resolves permissions from RolePermissions |
| `JwtTokenGenerator` | No changes — already encodes roles and permissions in claims |
| `RequirePlanLimitsAttribute` | Continue using for module-level feature gating |
| `SecurityDbContext` | No schema changes — Permissions and RolePermissions tables exist |
| `ApplicationRole` | No changes — already has TenantId |
| `ApplicationUser` | No changes — already has TenantId |
| Frontend `useAuthStore` | Extend to store permissions list alongside roles |

### Frontend Integration
- `useAuthStore` already stores `roles: string[]`
- Extend to also store `permissions: string[]` from JWT claims
- Create utility hook `usePermissions(permissionCode: string): boolean` for UI conditional rendering
- Update sidebar (`sidebar-data.ts`) to filter navigation items based on permissions
- Update `SettingsRoles` page (`/settings/roles`) from placeholder to functional UI

### Controller Authorization Update
Replace `[Authorize(Roles = "admin,Tenant Admin")]` with permission-based authorization:
- Current: `[Authorize(Roles = "admin,Tenant Admin")]` on template/catalog management endpoints
- Target: `[Authorize(Policy = "HasPermission")]` with policy requiring specific permission codes
- Implementation: Custom `AuthorizationHandler` checking `perms` claim in JWT

## Data Model Additions

### New Entity: Role (Extension)
```csharp
// Extend existing ApplicationRole
public class ApplicationRole : IdentityRole<Guid>
{
    public Guid? TenantId { get; set; }
    public bool IsSystemDefault { get; set; }  // NEW: true for seeded base roles
    public string Description { get; set; } = string.Empty;  // NEW
}
```

### New Entity: PermissionAssignmentAudit
```csharp
public class PermissionAssignmentAudit
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid AdminUserId { get; set; }  // who made the change
    public Guid RoleId { get; set; }
    public Guid PermissionId { get; set; }
    public bool Granted { get; set; }  // true = added, false = removed
    public DateTime At { get; set; } = DateTime.UtcNow;
    public string? Ip { get; set; }
}
```

### Seed Permission Catalog
Permissions are seeded once in the platform database with all codes from the matrix above. Each tenant's `SecurityDbContext` (shared schema) references these via `RolePermissions`.

## API Endpoints for Role/Permission Management

### New Controller: `RolesController`
Base: `/api/v1/roles`

| Method | Endpoint | Permission Required | Description |
|--------|----------|-------------------|-------------|
| GET | `/api/v1/roles` | `roles:read` | List all roles for tenant |
| GET | `/api/v1/roles/{id}` | `roles:read` | Get role details with permissions |
| POST | `/api/v1/roles` | `roles:manage` | Create custom role |
| PUT | `/api/v1/roles/{id}` | `roles:manage` | Update role (rename, permissions) |
| DELETE | `/api/v1/roles/{id}` | `roles:manage` | Delete custom role |
| GET | `/api/v1/roles/permission-catalog` | `roles:manage` | List all available permissions |
| POST | `/api/v1/roles/{id}/assign-permission` | `roles:manage` | Grant permission to role |
| DELETE | `/api/v1/roles/{id}/revoke-permission` | `roles:manage` | Revoke permission from role |

### Updated Controller: `AuthController`
- Login endpoint already returns permissions — no change needed
- Token refresh already re-queries permissions — no change needed

## Validation Criteria

### Functional Tests
- CA-ROLE-1: Given new tenant created, When onboarding completes, Then 4 default roles exist (Tenant Admin, Asset Manager, Technician, Viewer)
- CA-ROLE-2: Given Tenant Admin role, When login occurs, Then JWT contains all permissions in `perms` claim
- CA-ROLE-3: Given user with `incidents:create` permission, When POST `/api/v1/incidents`, Then 201 created
- CA-ROLE-4: Given user without `maintenance:approve` permission, When PATCH `/api/v1/maintenance-orders/{id}/approve`, Then 403
- CA-ROLE-5: Given Tenant Admin, When GET `/api/v1/roles/permission-catalog`, Then returns all permission codes
- CA-ROLE-6: Given custom role, When deleted, Then only non-admin users affected
- CA-ROLE-7: Given tenant without admin role, When attempting to delete last admin role, Then 400
- CA-ROLE-8: Given permission for disabled module, When assigning to role, Then 400 with module_not_enabled

### Non-Functional Tests
- CA-ROLE-9: Permission check adds ≤ 5ms to API response time (JWT claims-based)
- CA-ROLE-10: Tenant A cannot see Tenant B's roles (R1/RLS)
- CA-ROLE-11: All permission assignment changes logged in audit (R3)

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Permission explosion (100+ codes) | Complex management | Group by module in UI; search/filter on catalog endpoint |
| Tenant admin accidentally removes last admin permission | Lockout | R-ROLE-3 constraint prevents removal of last admin permission |
| JWT token stale after permission change | Stale access | Short 15-min expiry + refresh; forced re-login option |
| Existing `[Authorize(Roles=...)]` not updated | Inconsistent auth | Migration plan: update all controllers to use permission policies |

## Open Questions

1. **Permission granularity for specific state transitions**: Should `incidents:change-state` cover all transitions, or do we need `incidents:assign`, `incidents:close`, `incidents:resolve` separately?
   - **Recommendation**: Keep atomic per action (as defined in matrix above) — clearer security model, easier to reason about

2. **Should `Employee` entity use `employees:assign-role` or leverage `users:manage`?**
   - **Recommendation**: Keep separate — `employees:assign-role` controls HR role assignment, `users:manage` controls auth user management. Employees may exist without app users (technicians on mobile).

3. **How to handle the `admin` role name conflict with `Tenant Admin`?**
   - **Recommendation**: In `Program.cs` seed, change `admin` to `Tenant Admin` since no cross-tenant SuperAdmin exists. Or keep `admin` as alias for Tenant Admin within each tenant context.

## Implementation Order

### Phase 1: Foundation (Week 1)
1. Extend `ApplicationRole` with `IsSystemDefault` and `Description`
2. Create `PermissionAssignmentAudit` entity
3. Add permission catalog seeding in platform database
4. Update `LoginCommandHandler` comment/docs to clarify permissions model

### Phase 2: API (Week 2)
5. Create `RolesController` with CRUD + permission assignment endpoints
6. Create permission-based authorization policy handler
7. Replace `[Authorize(Roles=...)]` with `[Authorize(Policy="HasPermission")]` in all controllers
8. Update `/api/v1/auth/login` response to include permissions clearly

### Phase 3: Frontend (Week 3)
9. Extend `useAuthStore` to include permissions
10. Create `usePermissions` hook
11. Update sidebar navigation to filter by permissions
12. Build functional Settings Roles page
13. Update all UI buttons/actions to check permissions before enabling

### Phase 4: Tenant Onboarding (Week 4)
14. Update tenant creation flow to seed default roles with permissions
15. Update `Program.cs` seed for new role model
16. Write integration tests for all permission flows
