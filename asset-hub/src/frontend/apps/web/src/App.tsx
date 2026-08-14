import { Route, Routes } from "react-router";
import { Toaster } from "@/components/ui/sonner";

import { ThemeProvider } from "./context/theme-provider";
import { AuthenticatedLayout } from "./components/layout/authenticated-layout";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/dashboard/index";
import AssetsPage from "./pages/assets/index";
import AssetDetailPage from "./pages/assets/detail";
import AssetsTemplates from "./pages/assets/templates";
import MaintenanceIncidents from "./pages/maintenance/incidents";
import IncidentDetailPage from "./pages/maintenance/incident-detail";
import IncidentTemplates from "./pages/maintenance/incident-templates/index";
import MaintenanceTasks from "./pages/maintenance/tasks";
import StaffEmployees from "./pages/staff/employees";
import StaffTeams from "./pages/staff/teams";
import CatalogsPage from "./pages/catalogs/index";
import SettingsUsers from "./pages/settings/users";
import SettingsRoles from "./pages/settings/roles";
import SettingsTenant from "./pages/settings/tenant";
import SettingsAudit from "./pages/settings/audit";

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<AuthenticatedLayout />}>
          <Route index element={<DashboardPage />} />
          
          <Route path="assets">
            <Route index element={<AssetsPage />} />
            <Route path=":id" element={<AssetDetailPage />} />
            <Route path="templates" element={<AssetsTemplates />} />
          </Route>

          <Route path="maintenance">
            <Route path="incidents" element={<MaintenanceIncidents />} />
            <Route path="incidents/:id" element={<IncidentDetailPage />} />
            <Route path="incident-templates" element={<IncidentTemplates />} />
            <Route path="tasks" element={<MaintenanceTasks />} />
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
      </Routes>
      <Toaster />
    </ThemeProvider>
  );
}
