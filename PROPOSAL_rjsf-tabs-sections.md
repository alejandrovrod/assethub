# Proposal: RJSF Tabs and Sections for Dynamic Forms

## Intent

Implement a hybrid visual organization system for complex dynamic forms (20-80+ fields) in the asset management system. Currently all fields render in a flat vertical list causing cognitive overload, lack of context boundaries, and operational inefficiency. The solution introduces **Tabs** for major logical domains (Reception, Diagnosis, Repair, Delivery) and **Section Dividers** for sub-grouping within tabs, while maintaining full backward compatibility with existing schemas.

## Scope

### In Scope
- Extend `SchemaField` interface with `tab` and `section` properties
- SchemaBuilder: Tab management bar (add/rename/reorder/delete tabs), Section separators with drag-and-drop field assignment
- CustomObjectFieldTemplate: Radix Tabs + Section headers with responsive 3-column grid (1/2/3 cols)
- Cross-tab validation: Error badges on inactive tabs with required-field violations
- Backward compatibility: Schemas without tab/section render as single flat view (default tab "General")
- Live preview in SchemaBuilder showing tabs/sections as end-users see them

### Out of Scope
- Nested tabs (tabs within tabs)
- Collapsible/expandable sections
- Conditional section visibility based on field values
- Tab-level permissions or role-based visibility
- Migration tooling for existing schemas (handled by default assignment)

## Capabilities

### New Capabilities
- `form-tabs-navigation`: Top-level tab bar for organizing fields into logical domains
- `form-section-dividers`: Visual section headers with separators within tabs
- `cross-tab-validation-indicators`: Error badges guiding users to tabs with validation failures

### Modified Capabilities
- `dynamic-schema-definition`: SchemaField now includes optional `tab` and `section` properties
- `schema-builder-ui`: Enhanced with tab management and section separators
- `rjsf-form-rendering`: Custom ObjectFieldTemplate renders tabs/sections instead of flat list

## Approach

1. **Data Model**: Extend `SchemaField` in `schema-builder.tsx` with `tab?: string` and `section?: string`. Update JSON serialization to include these in property definitions.

2. **SchemaBuilder (Module A)**:
   - Add `tabs: string[]` state with default `["General"]`
   - Top tab bar UI with add/rename/reorder/delete (using @dnd-kit)
   - Per-field tab selector dropdown in SortableField
   - "Add Section" button inserting divider entries in field list
   - Drag-and-drop fields between sections within active tab
   - Live Preview tab renders actual Tabs + Sections

3. **CustomObjectFieldTemplate (Module B)**:
   - New component `CustomObjectFieldTemplate.tsx` using shadcn/ui `<Tabs>`
   - Group fields by `tab` property, default to "General"
   - Only render TabsList if ≥2 tabs with fields
   - Within each tab, group by `section`, render `<Separator>` + title + responsive grid
   - Validation: collect errors per tab, show AlertCircle badge on tab triggers
   - Preserve all existing widgets (FileUpload, EmployeeSelect, TeamSelect, date pickers)

4. **Integration**:
   - Register `CustomObjectFieldTemplate` in Form `templates={{ ObjectFieldTemplate }}`
   - Update `useResolvedSchema` to pass through tab/section (no transformation needed)
   - Ensure formData persistence across tab switches (RJSF handles this natively)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/pages/assets/components/schema-builder.tsx` | Modified | Core builder with tabs/sections UI |
| `src/pages/assets/components/schema-field-preview.tsx` | Modified | Preview shows tab/section badges |
| `src/components/rjsf/CustomObjectFieldTemplate.tsx` | New | Main RJSF template with tabs/sections |
| `src/pages/assets/detail.tsx` | Modified | Use custom template in edit sheet |
| `src/pages/assets/components/asset-form-sheet.tsx` | Modified | Use custom template in create/edit |
| `src/pages/maintenance/incident-detail.tsx` | Modified | Use custom template |
| `src/pages/maintenance/components/report-incident-sheet.tsx` | Modified | Use custom template |
| `src/pages/maintenance/components/propagated-properties-display.tsx` | Modified | Use custom template |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking existing schemas without tab/section | Low | Default "General" tab, conditional Tabs rendering |
| Performance with 80+ fields across tabs | Low | RJSF only mounts active tab content; memoize field groups |
| Validation UX across inactive tabs | Medium | Error badges + auto-focus first invalid field on submit |
| Drag-drop complexity with sections | Medium | Use @dnd-kit sortable within sections, separate tab assignment via dropdown |

## Rollback Plan

1. Revert `CustomObjectFieldTemplate.tsx` and remove template registration
2. Revert `SchemaBuilder` to previous version (git checkout)
3. Existing schemas remain valid — tab/section properties are ignored by default renderer

## Dependencies

- `@radix-ui/react-tabs` (already in shadcn/ui)
- `@dnd-kit/core`, `@dnd-kit/sortable` (already used in SchemaBuilder)
- RJSF v6.7.1 (current version)

## Success Criteria

- [ ] SchemaBuilder allows creating/managing tabs and sections with drag-drop
- [ ] Live Preview accurately reflects tabs/sections structure
- [ ] RJSF form renders tabs horizontally with section dividers + 3-col grid
- [ ] Validation errors on inactive tabs show red badge on tab button
- [ ] Schemas without tab/section render identically to before (single "General" view)
- [ ] Dark/light mode styling consistent with design system
- [ ] All existing widgets work within tabbed layout