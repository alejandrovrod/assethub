import { ArrowRight, Box, Activity, Users, Settings } from "lucide-react";
import { Link } from "react-router";

const t = {
  en: {
    badge: "AssetHub 2.0 is now live",
    title1: "Intelligent Asset Management for",
    title2: "Modern Enterprises",
    subtitle: "Centralize your equipment, track maintenance schedules, and reduce downtime with our powerful multi-tenant platform.",
    cta: "Start for free",
    pricing: "View Pricing",
    assets: "Assets",
    telemetry: "Live Telemetry Data"
  },
  es: {
    badge: "AssetHub 2.0 ya está disponible",
    title1: "Gestión Inteligente de Activos para",
    title2: "Empresas Modernas",
    subtitle: "Centralizá tus equipos, controlá mantenimientos y reducí los tiempos muertos con nuestra potente plataforma multi-tenant.",
    cta: "Empezar gratis",
    pricing: "Ver Precios",
    assets: "Activos",
    telemetry: "Datos de Telemetría en Vivo"
  }
};

export default function Hero({ lang = "es" }: { lang?: "en" | "es" }) {
  const content = t[lang];

  return (
    <div className="relative overflow-hidden bg-background pt-[120px] pb-[80px]">
      {/* Background gradients */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-primary rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob animation-delay-4000"></div>

      <div className="container relative z-10 mx-auto px-4 md:px-6">
        <div className="text-center max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center rounded-full border bg-background/50 px-3 py-1 text-sm font-medium backdrop-blur-md">
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2"></span>
            {content.badge}
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.1]">
            {content.title1} <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-600">
              {content.title2}
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
            {content.subtitle}
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-3.5 text-sm font-medium text-primary-foreground shadow transition-all hover:bg-primary/90 hover:scale-105"
            >
              {content.cta}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <a
              href="#pricing"
              className="inline-flex items-center justify-center rounded-full border bg-background/50 backdrop-blur-sm px-8 py-3.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {content.pricing}
            </a>
          </div>
        </div>

        {/* Dashboard Preview mockup */}
        <div className="mt-20 relative mx-auto max-w-5xl">
          <div className="rounded-xl border bg-background/40 p-2 backdrop-blur-xl shadow-2xl ring-1 ring-white/10">
            <div className="rounded-lg overflow-hidden border bg-background flex flex-col h-[400px]">
              <div className="border-b px-4 py-3 flex items-center gap-2 bg-muted/50">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500"></div>
                  <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                  <div className="h-3 w-3 rounded-full bg-green-500"></div>
                </div>
              </div>
              <div className="p-6 flex-1 bg-grid-white/[0.02] relative">
                <div className="absolute inset-0 bg-background/80 backdrop-blur-[1px]"></div>
                
                <div className="relative z-10 grid grid-cols-1 md:grid-cols-4 gap-4 h-full">
                  <div className="col-span-1 border rounded-xl p-4 bg-background/50 shadow-sm flex flex-col gap-4">
                    <div className="flex items-center gap-2 font-medium"><Box className="h-4 w-4 text-primary" /> Assets</div>
                    <div className="h-10 rounded bg-muted/50 w-full animate-pulse"></div>
                    <div className="h-10 rounded bg-muted/50 w-3/4 animate-pulse"></div>
                    <div className="h-10 rounded bg-muted/50 w-5/6 animate-pulse"></div>
                  </div>
                  <div className="col-span-3 grid grid-rows-3 gap-4">
                     <div className="row-span-1 grid grid-cols-3 gap-4">
                        <div className="border rounded-xl p-4 bg-background/50 shadow-sm flex items-center gap-4">
                           <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center"><Activity className="h-5 w-5 text-primary" /></div>
                           <div><div className="h-4 w-16 bg-muted rounded mb-2"></div><div className="h-6 w-10 bg-primary/20 rounded"></div></div>
                        </div>
                        <div className="border rounded-xl p-4 bg-background/50 shadow-sm flex items-center gap-4">
                           <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center"><Settings className="h-5 w-5 text-blue-500" /></div>
                           <div><div className="h-4 w-20 bg-muted rounded mb-2"></div><div className="h-6 w-12 bg-blue-500/20 rounded"></div></div>
                        </div>
                        <div className="border rounded-xl p-4 bg-background/50 shadow-sm flex items-center gap-4">
                           <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center"><Users className="h-5 w-5 text-green-500" /></div>
                           <div><div className="h-4 w-16 bg-muted rounded mb-2"></div><div className="h-6 w-8 bg-green-500/20 rounded"></div></div>
                        </div>
                     </div>
                     <div className="row-span-2 border rounded-xl p-4 bg-background/50 shadow-sm flex flex-col">
                        <div className="h-6 w-32 bg-muted/80 rounded mb-4"></div>
                        <div className="flex-1 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 flex items-center justify-center">
                           <p className="text-muted-foreground text-sm font-medium flex items-center gap-2"><Activity className="h-4 w-4" /> Live Telemetry Data</p>
                        </div>
                     </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
