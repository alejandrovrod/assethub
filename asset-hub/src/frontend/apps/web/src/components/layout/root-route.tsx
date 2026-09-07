import { lazy, Suspense } from "react";
import { Navigate } from "react-router";
import { useAuthStore } from "../../store/auth.store";

const LandingPage = lazy(() => import("../../pages/LandingPage"));

export function RootRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  const currentHost = window.location.hostname;
  const isRootDomain =
    currentHost === "localhost" ||
    currentHost === "assethub.app" ||
    (currentHost.endsWith(".netlify.app") && currentHost.split(".").length === 3);

  if (isAuthenticated) {
    // Si ya está autenticado, siempre mandarlo al Dashboard
    return <Navigate to="/dashboard" replace />;
  }

  // Si no está autenticado y está en el dominio principal, mostramos la Landing
  if (isRootDomain) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#fcfcfc]" />}>
        <LandingPage />
      </Suspense>
    );
  }

  // Si está en un subdominio y no está autenticado, lo mandamos al Login del tenant
  return <Navigate to="/login" replace />;
}
