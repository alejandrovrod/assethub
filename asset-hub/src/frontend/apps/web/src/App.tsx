import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { Toaster } from "@/components/ui/sonner";

import { ThemeProvider } from "./context/theme-provider";
import { AuthenticatedLayout } from "./components/layout/authenticated-layout";
import { RootRoute } from "./components/layout/root-route";

// Lazy-loaded pages (Code-Splitting)
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const DashboardPage = lazy(() => import("./pages/dashboard/index"));
const AssetsPage = lazy(() => import("./pages/assets/index"));
const AssetDetailPage = lazy(() => import("./pages/assets/detail"));
const AssetsTemplates = lazy(() => import("./pages/assets/templates"));
const MaintenanceIncidents = lazy(() => import("./pages/maintenance/incidents"));
const IncidentDetailPage = lazy(() => import("./pages/maintenance/incident-detail"));
const WorkflowTemplates = lazy(() => import("./pages/maintenance/workflow-templates/index"));
const MaintenanceTasks = lazy(() => import("./pages/maintenance/tasks"));
const PreventivePlansPage = lazy(() => import("./pages/maintenance/preventive-plans/index"));
const MaintenanceOrders = lazy(() => import("./pages/maintenance/orders/index"));
const StaffEmployees = lazy(() => import("./pages/staff/employees"));
const StaffTeams = lazy(() => import("./pages/staff/teams"));
const CatalogsPage = lazy(() => import("./pages/catalogs/index"));
const SettingsUsers = lazy(() => import("./pages/settings/users"));
const SettingsRoles = lazy(() => import("./pages/settings/roles"));
const SettingsTenant = lazy(() => import("./pages/settings/tenant"));
const SettingsAudit = lazy(() => import("./pages/settings/audit"));
const AuthSyncPage = lazy(() => import("./pages/auth-sync"));
const LogoutSyncPage = lazy(() => import("./pages/logout-sync"));

const RouteLoadingFallback = () => (
  <div className="flex h-screen w-full items-center justify-center bg-background">
    <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

export default function App() {
  return (
    <ThemeProvider>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          
          <Route element={<AuthenticatedLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            
            <Route path="assets">
              <Route index element={<AssetsPage />} />
              <Route path=":id" element={<AssetDetailPage />} />
              <Route path="templates" element={<AssetsTemplates />} />
            </Route>

            <Route path="maintenance">
              <Route path="incidents" element={<MaintenanceIncidents />} />
              <Route path="incidents/:id" element={<IncidentDetailPage />} />
              <Route path="workflow-templates" element={<WorkflowTemplates />} />
              <Route path="tasks" element={<MaintenanceTasks />} />
              <Route path="preventive-plans" element={<PreventivePlansPage />} />
              <Route path="orders" element={<MaintenanceOrders />} />
            </Route>

            <Route path="staff">
              <Route path="employees" element={<StaffEmployees />} />
              <Route path="teams" element={<StaffTeams />} />
            </Route>

            <Route path="catalogs" element={<CatalogsPage />} />

            <Route path="settings">
              <Route path="tenant" element={<SettingsTenant />} />
              <Route path="users" element={<SettingsUsers />} />
              <Route path="roles" element={<SettingsRoles />} />
              <Route path="audit" element={<SettingsAudit />} />
            </Route>
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/auth-sync" element={<AuthSyncPage />} />
          <Route path="/logout-sync" element={<LogoutSyncPage />} />
        </Routes>
      </Suspense>
      <Toaster />
    </ThemeProvider>
  );
}
