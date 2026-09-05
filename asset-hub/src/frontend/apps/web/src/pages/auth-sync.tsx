import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useAuthStore } from "../store/auth.store";
import { toast } from "sonner";

export default function AuthSyncPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  useEffect(() => {
    const dataParam = searchParams.get("data");
    if (dataParam) {
      try {
        const data = JSON.parse(decodeURIComponent(dataParam));
        if (data.accessToken && data.tenantSlug) {
          setAuth(
            data.accessToken,
            data.refreshToken,
            data.tenantSlug,
            data.tenantName,
            data.roles || []
          );
          // Redirigir al dashboard eliminando los parámetros de la URL
          navigate("/", { replace: true });
          return;
        }
      } catch (e) {
        console.error("Error parsing auth sync data", e);
      }
    }
    
    // Si algo falló o no hay data, mandar al login
    toast.error("Sesión inválida o expirada, iniciá sesión nuevamente.");
    navigate("/login", { replace: true });
  }, [searchParams, navigate, setAuth]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-muted-foreground">Sincronizando sesión...</p>
      </div>
    </div>
  );
}
