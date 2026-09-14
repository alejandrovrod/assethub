# Plan: User Management Implementation (Based on Role-Permission Matrix)

## Context
The role-permission matrix (M3 Enhancement) has been fully implemented with:
- Complete RolesController with CRUD operations
- RoleCommands and RoleQueries for role/permission management
- PermissionCatalog with all permission codes defined
- PermissionAssignmentAudit for tracking changes
- Frontend roles management UI with permission matrix editor
- Auth system updated to include permissions in JWT claims

## Goal
Implement complete user management system that integrates with the existing role-permission matrix, providing:
1. Full CRUD operations for ApplicationUsers
2. User invitation system with role assignment
3. User-role assignment functionality
4. Frontend user management interface
5. Proper audit logging for user actions (R3)
6. Tenant isolation (R1) and soft delete capabilities (R8)

## Current State Analysis

### Backend Gaps:
1. **UsersController.cs** - Minimal implementation (only GET returns empty)
2. **User management commands/queries** - Missing entirely in Application layer
3. **RegisterViaInvitationCommand handler** - Stub implementation (TODO)
4. **UserInvitation CRUD** - Missing
5. **User-role assignment** - Only employee linking exists, no direct user-role assignment
6. **User activation/deactivation** - Missing
7. **ISecurityDbContext** - Has Users DbSet but no business logic

### Frontend Gaps:
1. **settings/users.tsx** - "Próximamente" placeholder
2. **User service** - Missing
3. **Invitation management UI** - Missing
4. **User creation/edit forms** - Missing
5. **Role assignment UI for users** - Missing

## Architecture Decisions

### 1. User Entity Extension
Keep ApplicationUser as-is (TenantId, FullName, IsActive, standard Identity fields) since it already supports:
- Tenant isolation via TenantId (R1)
- Soft delete via IsActive (R8)  
- Audit trail via existing AuditLog table (R3)

### 2. Permission Codes for User Management
From PermissionCatalog already defined:
- `users:read` - View users
- `users:manage` - Create/update/deactivate users
- `user:invite` - Invite users
- `user:manage` - Also covers activation/deactivation

### 3. User-Role Assignment
Users get roles through standard Identity `UserRoles` table. We'll provide:
- Endpoint to assign/remove roles from users
- Validation that roles exist and belong to tenant
- Audit logging of role assignments (R3)

### 4. Invitation System
Extend existing UserInvitation model with:
- Invitation token generation/validation
- Role assignment at acceptance
- Expiration handling
- Audit trail

### 5. API Design
RESTful endpoints under `/api/v1/users`:
- GET `/users` - Search/filter/list users
- GET `/users/{id}` - Get user details
- POST `/users` - Create user (admin only)
- PUT `/users/{id}` - Update user
- DELETE `/users/{id}` - Deactivate user (soft delete)
- POST `/users/{id}/activate` - Reactivate user
- POST `/users/{id}/roles` - Assign role to user
- DELETE `/users/{id}/roles/{roleId}` - Remove role from user
- GET `/users/available-roles/{userId}` - Get roles assignable to user

### 6. Frontend Design
- **User list page** with search, filters, pagination
- **User detail/modal** for create/edit
- **Role assignment** interface in user detail
- **Invitation management** tab
- **Permission-aware UI** using use-permissions hook
- **Form validation** with react-hook-form and zod

## Implementation Plan

### Phase 1: Backend Infrastructure (Days 1-3)

#### 1.1 Application Layer Services
Create: `src/backend/AssetHub.Application/Users/`
- `IUserService.cs` - Service interface
- `UserService.cs` - Implementation using ISecurityDbContext
- Commands:
  - `CreateUserCommand` 
  - `UpdateUserCommand`
  - `DeactivateUserCommand`
  - `ActivateUserCommand`
  - `AssignUserRoleCommand`
  - `RemoveUserRoleCommand`
  - `ResendInvitationCommand`
  - `CancelInvitationCommand`
- Queries:
  - `GetUsersQuery` - Search/filter/paginate
  - `GetUserByIdQuery`
  - `GetUserRolesQuery` - Get roles assigned to user
  - `GetAvailableRolesForUserQuery` - Roles that can be assigned
  - `GetInvitationsQuery` - List pending invitations
  - `GetInvitationByTokenQuery` - Validate invitation token

#### 1.2 Command Handlers
Implement handlers with:
- Tenant validation
- Permission checks (users:manage, user:invite)
- Audit logging (R3)
- Soft delete handling (IsActive)
- Role assignment validation
- Invitation token generation (crypto.random)
- Expiration handling (72h default)

#### 1.3 UsersController
Replace stub with full CRUD:
```csharp
[ApiController]
[Route("api/v1/users")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly IUserService _userService;
    
    // Constructor dependency injection
    
    [HttpGet] // Search/filter/list
    [HttpGet("{id}")] // Get by id
    [HttpPost] // Create
    [HttpPut("{id}")] // Update
    [HttpDelete("{id}")] // Deactivate (soft delete)
    [HttpPost("{id}/activate")] // Reactivate
    [HttpPost("{id}/roles")] // Assign role
    [HttpDelete("{id}/roles/{roleId}")] // Remove role
    // Invitation endpoints...
}
```

#### 1.4 RegisterViaInvitationCommand Handler
Replace TODO with real implementation:
- Validate token exists and not expired
- Check invitation not already accepted
- Create ApplicationUser with provided data
- Assign role from invitation
- Mark invitation as accepted
- Send welcome email (if email service available)
- Return success/failure

#### 1.5 UserInvitation CRUD
Add to ISecurityDbContext if needed and implement:
- Create invitation (with role selection)
- List pending invitations
- Resend/Cancel invitations
- Cleanup expired invitations (background job)

### Phase 2: Frontend Implementation (Days 4-6)

#### 2.1 User Service
Create: `src/frontend/apps/web/src/services/user.service.ts`
- Methods matching backend endpoints
- Proper error handling
- Pagination support
- Search/filter parameters

#### 2.2 Settings Users Page
Replace: `src/frontend/apps/web/src/pages/settings/users.tsx`
Features:
- **User list toolbar** with search, filters, new user button
- **Data table** with columns: Name, Email, Roles, Status, Created, Actions
- **Row actions** buttons (Edit, Deactivate/Activate, Assign Roles, Link to Employee)
- **Bulk actions** (select multiple, deactivate)
- **Permission-aware** rendering using use-permissions hook
- **Empty state** handling
- **Loading/skeleton** UIs

#### 2.3 User Form Modal
Create reusable modal for:
- **Create user** form
- **Edit user** form
Fields:
- Full Name (required)
- Email (required, unique per tenant)
- Role assignment (multi-select from available roles)
- Status toggle (Active/Inactive)
- Employee linking (optional search)

#### 2.4 Invitation Management Tab
Add to users page or separate page:
- **Invitations table** with: Email, Role, Expires, Sent, Actions
- **Actions**: Resend, Cancel, Copy link
- **Send new invitation** form
- **Expiration warning** styling
- **Auto-refresh** of pending invitations

#### 2.5 Role Assignment Interface
In user detail/edit:
- **Chip display** of current roles
- **Searchable multi-select** for assigning new roles
- **Permission validation** - only show roles user can assign (based on their permissions)
- **System default roles** indicator
- **Role description** tooltips

#### 2.6 Integration with Existing Systems
- **Employee linking** - Enhanced UI in user detail
- **Auth store** - Update to fetch full user details on login
- **Sidebar navigation** - Show/hide based on permissions
- **Toast notifications** - Success/error messages
- **Confirm dialogs** - Destructive actions

### Phase 3: Testing & Validation (Days 7-8)

#### 3.1 Backend Tests
- Unit tests for all command/query handlers
- Integration tests for API endpoints
- Permission validation tests (users:manage, user:invite, etc.)
- Tenant isolation tests
- Soft delete verification
- Audit log verification (R3)

#### 3.2 Frontend Tests
- Component unit tests (user list, forms, modals)
- Integration tests with mock API
- Permission-based rendering tests
- Form validation tests
- Invitation flow tests

#### 3.3 End-to-End Scenarios
1. **Tenant Admin creates user** → User appears in list → Can login with credentials
2. **Invite user** → Email sent → User accepts → Set password → Login works
3. **Assign role to user** → User gains new permissions immediately
4. **Deactivate user** → User cannot login → Reactivate → Login works
5. **Permission boundary testing** - Users without permissions see appropriate UI
6. **Employee linking** - User linked to employee sees employee data in profile

## Open Questions & Clarifications

### Critical:
1. **Email notifications** - Should invitations send actual emails? Currently using SMTP service exists. Need to confirm if we should implement email sending for invitations.

2. **Password requirements** - Should we enforce password policy on invitation acceptance? Currently using z.string().min(6) in login.

3. **Self-service capabilities** - Can users update their own profile? Or only admins manage users?

4. **Role assignment constraints** - Can a user assign roles they don't have themselves? Current design: no, based on their permissions.

5. **Initial admin user** - During tenant signup, should the admin user get assigned the "Tenant Admin" role automatically? Currently happens in SignUpTenantCommand.

6. **Employee vs User distinction** - Should we prevent linking multiple employees to same user? Current validation prevents this.

### Implementation Details:
1. **Password handling** - Should we generate temporary passwords for invitations or let user set their own?
2. **Invitation expiration** - Should we send expiration reminders?
3. **Bulk operations** - Should we support bulk user operations (activate/deactivate multiple)?
4. **Search capabilities** - What fields should be searchable? (name, email, role names)

## Success Criteria

### Functional:
- [ ] Users can be created, viewed, updated, deactivated
- [ ] Invitations can be sent, accepted, resent, cancelled
- [ ] Users can be assigned/removed from roles
- [ ] Users can be linked to employees
- [ ] All operations respect tenant isolation (R1)
- [ ] All mutations are audited (R3)
- [ ] Soft delete works correctly (R8)
- [ ] Permission checking works at API and UI levels
- [ ] Default roles seeded for new tenants work correctly

### Non-functional:
- [ ] API response times < 200ms for list operations
- [ ] Frontend loads < 3s on moderate connection
- [ ] All permission boundaries properly enforced
- [ ] Error handling consistent with existing patterns
- [ ] Loading states and empty states handled
- [ ] Mobile responsive design

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Permission drift (frontend/backend mismatch) | High | Use shared permission constants or generate from PermissionCatalog |
| Invitation security (token guessing/brute force) | Medium | Use cryptographically secure tokens, rate limiting, expiration |
| Performance degradation with many users | Medium | Implement proper database indexing, pagination |
| Complexity of role assignment UI | Medium | Progressive disclosure, start simple, enhance later |
| Data inconsistency between user and employee | Low | Transactions where needed, eventual consistency acceptable |

## Dependencies
- Role-permission matrix implementation (already complete)
- Existing Auth system (login, refresh, JWT)
- Employee management system
- Audit logging system
- Tenant resolution middleware
- Permission authorization policy

## Open Items for User Decision
1. Should we implement email sending for invitations? (Requires SMTP config)
2. What should be the default invitation expiration time? (Current: 72h in plan)
3. Should users be able to invite others, or only admins with user:invite permission?
4. Can deactivated users be linked to employees? (Probably not)
5. Should we show role descriptions in the assignment UI? (Yes, from PermissionCatalog)

## Next Steps
Once this plan is approved, implement in the order:
1. Backend services, commands, queries
2. UsersController implementation
3. RegisterViaInvitationCommand handler
4. Frontend user service and pages
5. Testing and validation