# Plan: Fix Dashboard Breadcrumb Duplication and Asset ID Display

## Issues

1. **Duplicate breadcrumb**: The breadcrumb "Dashboard > <asset-id>" appears twice on the dashboard asset page - once in the page content (`dashboard/index.tsx`) and once in the global header (`header.tsx`).
2. **Asset ID shown instead of name**: The breadcrumb displays the raw asset GUID instead of the asset's friendly name.

## Root Cause Analysis

### Issue 1: Duplicate Breadcrumb
- `dashboard/index.tsx` (lines 14-25) renders its own breadcrumb component with `LayoutDashboard` + `ChevronRight`
- `header.tsx` (lines 54-97) also renders a breadcrumb based on `useLocation().pathname`
- Both render simultaneously, causing duplication

### Issue 2: Asset ID in Breadcrumb
- `dashboard/index.tsx` line 22: `<span>{scope === 'global' ? 'Global' : assetId}</span>` - directly uses `assetId` from URL params
- `header.tsx` line 83-84: only replaces with `customTitle` if it's set AND `value.length > 16`
- `customTitle` is never set for dashboard pages, so the raw GUID shows

## Fix Plan

### Step 1: Remove duplicate breadcrumb from dashboard page
**File**: `asset-hub/src/frontend/apps/web/src/pages/dashboard/index.tsx`

Remove lines 14-25 (the local breadcrumb div). Keep only the content cards.

**Before**:
```tsx
<div className="flex items-center gap-1 text-sm text-muted-foreground">
  <Link to="/dashboard" className="flex items-center gap-1 hover:underline">
    <LayoutDashboard className="h-3.5 w-3.5" />
    Dashboard
  </Link>
  {assetId && (
    <>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="font-medium text-foreground">{scope === 'global' ? 'Global' : assetId}</span>
    </>
  )}
</div>
```

**After**: Remove entirely. The header breadcrumb handles this.

Also remove unused imports: `Link`, `LayoutDashboard`, `ChevronRight`.

### Step 2: Fetch asset name and set as custom title
**File**: `asset-hub/src/frontend/apps/web/src/pages/dashboard/index.tsx`

Add a query to fetch the asset name when `assetId` is present:

```tsx
import { useQuery } from '@tanstack/react-query'
import { assetService } from '@/services/asset.service'
import { useBreadcrumbStore } from '@/stores/breadcrumb-store'

// Inside component:
const { data: asset } = useQuery({
  queryKey: ['asset', assetId],
  queryFn: () => assetService.getAssetById(assetId!),
  enabled: !!assetId,
})

const setCustomTitle = useBreadcrumbStore(state => state.setCustomTitle)

useEffect(() => {
  if (asset?.name) {
    setCustomTitle(asset.name)
  } else if (assetId) {
    setCustomTitle(null) // fallback to showing shortened ID
  }
  return () => setCustomTitle(null)
}, [asset, assetId, setCustomTitle])
```

### Step 3: Update header breadcrumb to show asset name
**File**: `asset-hub/src/frontend/apps/web/src/components/layout/header.tsx`

The existing logic at line 83-84 already handles `customTitle` for long IDs. Once `customTitle` is set to the asset name, the header will display it correctly.

**No changes needed** to `header.tsx` - it already supports `customTitle`.

### Step 4: Add asset name to breadcrumb translations (optional)
**File**: `asset-hub/src/frontend/apps/web/src/components/layout/header.tsx`

Add 'dashboard' to the breadcrumb translations:
```tsx
'dashboard': 'Dashboard',
```

## Files to Modify

| File | Change |
|------|--------|
| `asset-hub/src/frontend/apps/web/src/pages/dashboard/index.tsx` | Remove duplicate breadcrumb, add asset name fetch + customTitle |
| `asset-hub/src/frontend/apps/web/src/components/layout/header.tsx` | Add 'dashboard' translation (optional) |

## Validation

1. Navigate to `/dashboard` - should show only "Dashboard" in header breadcrumb
2. Navigate to `/dashboard/<asset-id>` - should show "Dashboard > <Asset Name>" in header only
3. No duplicate breadcrumbs in page content
4. Asset name appears instead of raw GUID

## Dependencies

- `assetService.getAssetById()` must exist in `asset.service.ts`
- `useBreadcrumbStore` must be importable from `@/stores/breadcrumb-store`