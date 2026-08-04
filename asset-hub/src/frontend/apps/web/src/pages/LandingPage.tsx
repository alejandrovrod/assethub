import { Link } from "react-router";
import { Button } from "@asset-hub/ui";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        AssetHub — Gestión de activos
      </h1>
      <p className="max-w-md text-muted-foreground">
        Plataforma centralizada para gestionar los activos de tu organización.
      </p>
      <Button asChild size="lg">
        <Link to="/login">Iniciar sesión</Link>
      </Button>
    </main>
  );
}
