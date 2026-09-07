import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Check } from "lucide-react";
import { apiClient } from "../../lib/api-client";

interface Plan {
  code: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  maxAssets: number;
  maxUsers: number;
  enabledModules: string;
}

const t = {
  en: {
    title: "Simple, transparent pricing",
    subtitle: "Start for free, upgrade when you need more power. No hidden fees.",
    popular: "Most Popular",
    mo: "/mo",
    assets: "Assets",
    users: "Users",
    module: "module",
    choose: "Choose"
  },
  es: {
    title: "Precios simples y transparentes",
    subtitle: "Empezá gratis, mejorá tu plan cuando necesites más poder. Sin letras chicas.",
    popular: "Más Popular",
    mo: "/mes",
    assets: "Activos",
    users: "Usuarios",
    module: "módulo",
    choose: "Elegir"
  }
};

export default function Pricing({ lang = "es" }: { lang?: "en" | "es" }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const content = t[lang];

  useEffect(() => {
    apiClient.get<Plan[]>("/public/plans")
      .then((res) => setPlans(res.data))
      .catch((err) => console.error("Error fetching plans:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section id="pricing" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{content.title}</h2>
          <p className="text-lg text-muted-foreground">
            {content.subtitle}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto items-center justify-center">
            {plans.map((plan) => {
              const modules = JSON.parse(plan.enabledModules || "[]");
              return (
                <div key={plan.code} className={`relative flex flex-col rounded-2xl border bg-background p-8 shadow-sm transition-all hover:shadow-md ${plan.code === 'pro' ? 'border-primary ring-1 ring-primary/20 shadow-primary/10 lg:scale-105 z-10' : ''}`}>
                  {plan.code === 'pro' && (
                    <div className="absolute -top-4 left-0 right-0 flex justify-center">
                      <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                        {content.popular}
                      </span>
                    </div>
                  )}
                  
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                    <div className="mt-4 flex items-baseline text-5xl font-extrabold">
                      ${plan.priceMonthly}
                      <span className="ml-1 text-xl font-medium text-muted-foreground">{content.mo}</span>
                    </div>
                  </div>
                  
                  <ul className="flex-1 space-y-4 mb-8">
                    <li className="flex items-center gap-3 text-sm">
                      <Check className="h-4 w-4 text-primary" />
                      {plan.maxAssets} {content.assets}
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <Check className="h-4 w-4 text-primary" />
                      {plan.maxUsers} {content.users}
                    </li>
                    {modules.map((mod: string) => (
                      <li key={mod} className="flex items-center gap-3 text-sm capitalize">
                        <Check className="h-4 w-4 text-primary" />
                        {mod} {content.module}
                      </li>
                    ))}
                  </ul>
                  
                  <Link
                    to={`/signup?plan=${plan.code}`}
                    className={`w-full inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                      plan.code === 'pro' 
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                        : 'bg-muted text-foreground hover:bg-muted/80'
                    }`}
                  >
                    {content.choose} {plan.name}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
