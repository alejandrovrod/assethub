# Plan: Implement Email and Document Templates for Incidents, Maintenance Orders, and Tasks

## Goal
Create a flexible template system allowing users to build custom email and document templates for incidents, maintenance orders, and work tasks. Templates should support dynamic variables and be tenant-scoped with frontend UI for management.

## Requirements Analysis

### 1. Core Template Types
- **Email templates**: Dynamic email content for notifications when entities change state or are created
- **Document templates**: PDF/HTML documents for formal incident reports, maintenance orders, and task assignments

### 2. Dynamic Variables
Based on the user response and existing domain models, standard variables should include:
- Asset: `{{assetId}}`, `{{assetName}}`, `{{assetCode}}`, `{{assetTemplate}}`
- Incident: `{{incidentId}}`, `{{incidentTitle}}`, `{{incidentPriority}}`, `{{incidentType}}`, `{{assetId}}`
- Maintenance Order: `{{orderId}}`, `{{orderTitle}}`, `{{orderKind}}`, `{{orderState}}`, `{{assignedEmployeeName}}`, `{{assetName}}`
- Work Task: `{{taskId}}`, `{{taskTitle}}`, `{{taskType}}`, `{{priority}}`, `{{assignedEmployeeName}}`, `{{maintenanceOrderId}}`

### 3. Entity Scope
Templates should be applicable to all entity types: incidents, maintenance orders, and work tasks.

### 4. Architecture
- **Backend**: .NET 10 with Clean Architecture (Domain → Application → Infrastructure → API)
- **Frontend**: React 19 with TypeScript, using existing patterns from asset templates and workflow templates

## Architecture Decisions

### 1. Data Model
Each template will have:
- `Id` (Guid)
- `TenantId` (Guid) - for tenant-scoped isolation per R1
- `EntityType` (enum: Incident, MaintenanceOrder, WorkTask)
- `TemplateType` (enum: Email, Document)
- `Name` (display name)
- `Description` (optional)
- `Content` (HTML for documents, plain/text for emails)
- `Variables` (JSON schema defining available variables)
- `IsActive` (boolean)
- `CreatedAt`, `UpdatedAt` (audit fields per R3)

### 2. Template Rendering
- **Email templates**: Rendered with HTML email clients support (SendGrid API or SMTP via existing IEmailService)
- **Document templates**: Converted to PDF via headless browser ( Puppeteer/Playwright) or server-side HTML-to-PDF (WeasyPrint)

### 3. Variable Substitution
Implement a robust substitution system that:
- Validates all referenced variables against the template's variable schema
- Supports both entity attributes and nested relationships (e.g., `{{maintenanceOrder.asset.name}}`)
- Provides fallback for missing values

### 4. Template Store Management
- **Backend API**: Full CRUD operations (search, get by ID, create, update, delete)
- **Frontend UI**: Wizard-based template editor similar to asset template creation
- **Template previews**: Live preview for both email and document templates

## Implementation Plan

### Phase 1: Domain Layer (Week 1-2)

#### Files to create:
1. `src/backend/AssetHub.Domain/Templates/` directory:
   - `Template.cs` - base template entity
   - `EmailTemplate.cs` - email template entity
   - `DocumentTemplate.cs` - document template entity
   - `TemplateVariable.cs` - variable definition entity

2. `src/backend/AssetHub.Domain/Incidents/`:
   - `TemplateExtensions.cs` - extension methods for incident template rendering

3. `src/backend/AssetHub.Domain/Maintenance/`:
   - `MaintenanceOrderTemplateExtensions.cs` - extension methods for maintenance order template rendering

4. `src/backend/AssetHub.Domain/Tasks/`:
   - `WorkTaskTemplateExtensions.cs` - extension methods for work task template rendering

#### Key implementations:
- Entity inheritance and properties
- Tenant-scoped query filters
- Soft delete support (R8)
- Versioning for templates (R7 pattern from asset templates)

### Phase 2: Application Layer (Week 3-4)

#### Application Services:
1. `src/backend/AssetHub.Application/Interfaces/ITemplateService.cs`
2. `src/backend/AssetHub.Application/Templates/TemplateService.cs`

#### Commands/Queries:
1. `CreateTemplateCommand`
2. `UpdateTemplateCommand`
3. `DeleteTemplateCommand`
4. `SearchTemplatesQuery`
5. `GetTemplateByIdQuery`
6. `RenderTemplateCommand` - renders template with given data

#### Event Handlers:
1. `TemplateRenderedEventHandler` - publishes event when template is rendered

### Phase 3: Infrastructure Layer (Week 5-6)

#### Repositories:
1. `src/backend/AssetHub.Infrastructure/Repositories/ITemplateRepository.cs`
2. `src/backend/AssetHub.Infrastructure/Repositories/TemplateRepository.cs`

#### Renderers:
1. `src/backend/AssetHub.Infrastructure/Rendering/EmailRenderer.cs`
2. `src/backend/AssetHub.Infrastructure/Rendering/DocumentRenderer.cs`
3. `src/backend/AssetHub.Infrastructure/Rendering/TemplateRenderer.cs`

#### Validation:
- Implement validation for template content, variable references, and entity types

### Phase 4: API Layer (Week 7-8)

#### Controller:
1. `src/backend/AssetHub.Api/Controllers/TemplatesController.cs`

Endpoints:
- `GET /api/v1/templates` - search templates
- `GET /api/v1/templates/{id}` - get template by ID
- `POST /api/v1/templates` - create template
- `PUT /api/v1/templates/{id}` - update template
- `DELETE /api/v1/templates/{id}` - delete template
- `POST /api/v1/templates/{id}/render` - render template with data

### Phase 5: Frontend Integration (Week 9-10)

#### Frontend Services:
1. `src/frontend/apps/web/src/services/template.service.ts`

#### Pages:
1. `src/frontend/apps/web/src/pages/templates/` - template management UI

#### Components:
1. `src/frontend/apps/web/src/components/templates/` - template editor components

### Phase 6: Email Integration (Week 11-12)

#### Integration with existing email system:
1. Update `MaintenanceOrderCreatedEventHandler` to use email templates
2. Update `WorkTaskCreatedEventHandler` to use email templates
3. Add `TemplateBasedEmailEventHandler` for other email scenarios

## Validation Steps

### 1. Backend Validation (Week 12-13)
- Run unit tests for domain models
- Run integration tests for API endpoints
- Test template rendering with various variable combinations

### 2. Frontend Validation (Week 13-14)
- Test template creation UI
- Test template editing and preview
- Test template rendering in UI

### 3. Integration Testing (Week 14-15)
- End-to-end testing with real incident/maintenance order creation
- Verify email templates work with existing email system
- Verify document templates can be generated

### 4. User Acceptance Testing (Week 15-16)
- Get feedback from users on template system
- Refine UI based on user feedback
- Ensure templates are intuitive and powerful

## Risks and Mitigation

### 1. Variable Complexity
**Risk**: Templates with too many variables can be hard to manage
**Mitigation**: Provide sensible defaults, auto-complete in UI, validation

### 2. Performance
**Risk**: Rendering templates for large entities can be slow
**Mitigation**: Cache rendered templates, lazy load, optimize rendering

### 3. Tenant Isolation
**Risk**: Templates might leak between tenants
**Mitigation**: Rigorous testing of tenant isolation, code reviews

### 4. Email Delivery
**Risk**: Email templates might not render correctly in all email clients
**Mitigation**: Test with common email clients, provide fallbacks

### 5. PDF Generation
**Risk**: Document template rendering might fail or produce poor PDFs
**Mitigation**: Test with various HTML/CSS features, provide fallback rendering

## Dependencies and Integration Points

### Existing Systems to Integrate With:
1. `IEmailService` - for sending email templates
2. Asset service - for asset data
3. Incident service - for incident data
4. Maintenance order service - for order data
5. Work task service - for task data

### Technology Stack:
- Backend: .NET 10, MediatR, Entity Framework Core
- Frontend: React 19, TypeScript, Tailwind CSS
- Template rendering: Handlebars.js (or similar template engine)
- Document generation: Puppeteer/Playwright

## Success Metrics

### Functional Requirements:
1. Users can create email templates for incidents, maintenance orders, and work tasks
2. Users can create document templates for incidents, maintenance orders, and work tasks
3. Templates support dynamic variable substitution
4. Template system is tenant-scoped
5. Frontend UI for template management exists

### Non-Functional Requirements:
1. Templates are rendered within 2 seconds
2. Email templates are delivered successfully
3. Document templates are generated in PDF format
4. System is secure and follows existing coding standards
5. Documentation is complete

## Open Questions

### Critical:
1. What template engine should we use for variable substitution? (Handlebars, Liquid, custom)
2. How should we handle complex templates with conditional logic?
3. What format should document templates use? (HTML, Markdown, custom format)

### Implementation Details:
1. How should we handle PDF generation for complex layouts?
2. How should we handle email template testing across different email clients?
3. Should we provide template versioning like asset templates?

## Conclusion

This template system will provide significant value by allowing users to customize communications and documentation for incidents, maintenance orders, and work tasks. The implementation follows existing patterns in the codebase and leverages the current architecture to ensure consistency and maintainability.

Once completed, the system will enable:
- Personalized incident reports
- Professional maintenance order documentation
- Customized task assignments
- Consistent communication across the platform

Users will be able to create, edit, and preview templates through an intuitive UI, while the backend will handle template storage, variable substitution, and rendering.