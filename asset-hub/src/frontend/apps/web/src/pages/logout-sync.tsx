import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuthStore } from "../store/auth.store";

export default function LogoutSyncPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-muted-foreground">Cerrando sesión de forma segura...</p>
      </div>
    </div>
  );
}
