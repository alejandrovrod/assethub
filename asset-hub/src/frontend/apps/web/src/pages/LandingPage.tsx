import { useState } from "react";
import { Link } from "react-router";
import { 
  Check, 
  ChevronRight, 
  Layers, 
  MapPin, 
  History, 
  GitFork, 
  ShieldCheck, 
  ArrowRight,
  Database,
  Sparkles
} from "lucide-react";
import { AssetHubBrandLogo } from "@/components/brand/asset-hub-logo";

import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [billingAnnual, setBillingAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const { t } = useTranslation('landing');

  const clientLogos = t('logos', { returnObjects: true });
  const testimonials = t('testimonials.items', { returnObjects: true });
  const faqItems = t('faq.items', { returnObjects: true });

  return (
    <div className="min-h-screen bg-background text-foreground antialiased font-sans selection:bg-primary selection:text-primary-foreground">
      
      {/* --- TOP BANNER (Lumen Aesthetic) --- */}
      <div className="bg-primary/5 border-b border-border/40 py-2 px-4 text-center text-xs font-medium text-muted-foreground flex items-center justify-center gap-2">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground">
          v2.5
        </span>
        <span>
          {t('banner.release')}
        </span>
        <a href="#features" className="text-foreground hover:underline font-semibold inline-flex items-center gap-0.5">
          {t('banner.learnMore')} <ChevronRight className="size-3" />
        </a>
      </div>

      {/* --- NAVBAR (Lumen Glassmorphic Header) --- */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-8">
          
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="size-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 p-1 flex items-center justify-center shadow-xs transition-transform group-hover:scale-95">
              <AssetHubBrandLogo size={24} variant="accented" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-base text-foreground leading-none">
                Asset<span className="text-primary font-black">Hub</span>
              </span>
              <span className="text-[10px] text-muted-foreground tracking-widest uppercase font-mono">
                Operations
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              {t('nav.features')}
            </a>
            <a href="#multitenant" className="hover:text-foreground transition-colors">
              {t('nav.multitenant')}
            </a>
            <a href="#pricing" className="hover:text-foreground transition-colors">
              {t('nav.pricing')}
            </a>
            <a href="#faq" className="hover:text-foreground transition-colors">
              {t('nav.faq')}
            </a>
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <LanguageSwitcher variant="full" className="h-8 gap-1.5 px-2.5 text-xs font-semibold" />

            {/* Login Link */}
            <Link
              to="/login"
              className="hidden sm:inline-flex text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"
            >
              {t('nav.login')}
            </Link>

            {/* CTA Button with Lumen Pill Style */}
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-xs sm:text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-all active:scale-95"
            >
              <span>{t('nav.start')}</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* --- HERO SECTION (Lumen Style: Centered Hero + Ambient Glow + Frame Mockup) --- */}
      <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
        {/* Soft Background Gradient & Radial Glow */}
        <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
          <div className="h-[450px] w-[650px] rounded-full bg-primary/10 blur-[130px] opacity-70"></div>
          <div className="absolute top-1/4 h-[350px] w-[400px] rounded-full bg-blue-500/10 blur-[120px] opacity-60"></div>
        </div>

        <div className="container mx-auto px-4 sm:px-8 text-center max-w-5xl">
          
          {/* Badge Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground mb-6 shadow-xs backdrop-blur-xs">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>{t('hero.badge')}</span>
          </div>

          {/* Hero Headlines */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-foreground leading-[1.08] mb-6">
            {t('hero.title1')}{" "}
            <span className="bg-gradient-to-r from-foreground via-foreground/80 to-muted-foreground bg-clip-text text-transparent">
              {t('hero.title2')}
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto max-w-2xl text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed mb-10 font-normal">
            {t('hero.subtitle')}
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-md mx-auto mb-16">
            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl transition-all"
            >
              <span>{t('hero.cta')}</span>
              <ChevronRight className="size-4" />
            </Link>
            <a
              href="#features"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur-xs px-6 py-3 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <span>{t('hero.demo')}</span>
            </a>
          </div>

          {/* Interactive Workspace Mockup Frame (Lumen Style Floating Window) */}
          <div className="relative mx-auto max-w-5xl rounded-2xl border border-border/80 bg-card p-2 sm:p-3 shadow-2xl backdrop-blur-sm">
            
            {/* Mockup Header Window Controls */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30 rounded-t-xl mb-2">
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-rose-400/80"></div>
                <div className="size-3 rounded-full bg-amber-400/80"></div>
                <div className="size-3 rounded-full bg-emerald-400/80"></div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-background border border-border/60 text-[11px] font-mono text-muted-foreground">
                <span className="text-emerald-500 font-bold">●</span>
                <span>app.assethub.io/activos/nave-b-patio-sur</span>
              </div>
              <div className="text-[11px] font-medium text-muted-foreground">
                AssetHub v2.5
              </div>
            </div>

            {/* Mockup Body Preview */}
            <div className="relative overflow-hidden rounded-xl bg-muted/20 border border-border/40 aspect-[16/9] max-h-[560px]">
              <img
                src="/asset-details-mockup.png"
                alt="AssetHub Dashboard"
                className="w-full h-full object-cover object-top"
              />
              {/* Bottom Subtle Gradient Overlay */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-card via-card/40 to-transparent"></div>
            </div>
          </div>
        </div>
      </section>

      {/* --- SOCIAL PROOF & LOGOS (Lumen Marquee / Badge Section) --- */}
      <section className="border-y border-border/40 py-10 bg-muted/20">
        <div className="container mx-auto px-4 text-center">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-8">
            {t('social')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6 items-center justify-center opacity-70 grayscale hover:grayscale-0 transition-all">
            {clientLogos.map((c, i) => (
              <div key={i} className="flex flex-col items-center justify-center py-2 px-4 rounded-lg bg-card/40 border border-border/30">
                <span className="font-bold text-sm tracking-tight text-foreground">{c.name}</span>
                <span className="text-[10px] text-muted-foreground">{c.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- FEATURES TABS & CAROUSEL SECTION (Lumen Interactive Features) --- */}
      <section id="features" className="py-20 md:py-28 relative">
        <div className="container mx-auto px-4 sm:px-8 max-w-6xl">
          
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="text-xs font-semibold text-primary uppercase tracking-widest mb-2 block">
              {t('featuresTabs.tag')}
            </span>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
              {t('featuresTabs.title')}
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">
              {t('featuresTabs.subtitle')}
            </p>
          </div>

          {/* Interactive Navigation Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
            {t('featuresTabs.tabs', { returnObjects: true }).map((tab, idx) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(idx)}
                className={`px-4 py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
                  activeTab === idx
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40"
                }`}
              >
                {tab.title}
              </button>
            ))}
          </div>

          {/* Active Feature Display Card (Lumen Showcase Layout) */}
          {(() => {
            const current = t('featuresTabs.tabs', { returnObjects: true })[activeTab];
            return (
              <div className="rounded-2xl border border-border bg-card p-6 sm:p-10 shadow-lg grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                
                {/* Left Text & Value Points */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    <Sparkles className="size-3.5" />
                    <span>{current.badge}</span>
                  </div>

                  <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                    {current.title}
                  </h3>

                  <p className="text-muted-foreground leading-relaxed text-sm sm:text-base">
                    {current.desc}
                  </p>

                  <div className="space-y-3 pt-2">
                    {current.points.map((pt, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="size-5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="size-3 stroke-[2.5]" />
                        </div>
                        <span className="text-xs sm:text-sm text-foreground/90 font-medium">
                          {pt}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4">
                    <Link
                      to="/login"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                    >
                      <span>{t('featuresTabs.explore')}</span>
                      <ChevronRight className="size-4" />
                    </Link>
                  </div>
                </div>

                {/* Right Mockup Preview Frame */}
                <div className="lg:col-span-7">
                  <div className="rounded-xl border border-border/80 bg-background overflow-hidden shadow-md">
                    <div className="h-8 bg-muted/40 border-b border-border/40 px-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full bg-border"></span>
                        <span className="size-2.5 rounded-full bg-border"></span>
                        <span className="size-2.5 rounded-full bg-border"></span>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[200px]">
                        assethub.io/{current.id}
                      </span>
                      <div className="w-8"></div>
                    </div>
                    <div className="aspect-[16/10] bg-muted/20 overflow-hidden relative group">
                      <img
                        src={current.image}
                        alt={current.title}
                        className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  </div>
                </div>

              </div>
            );
          })()}

        </div>
      </section>

      {/* --- BENTO GRID: ENTERPRISE ARCHITECTURE (Lumen Features Grid) --- */}
      <section className="py-20 bg-muted/20 border-t border-border/40">
        <div className="container mx-auto px-4 sm:px-8 max-w-6xl">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-semibold text-primary uppercase tracking-widest mb-2 block">
              {t('grid.tag')}
            </span>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
              {t('grid.title')}
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">
              {t('grid.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Icon/image are visual assets, not copy: they stay local while title/desc come from the dictionary. */}
            {t('grid.cards', { returnObjects: true }).map((card, idx) => {
              const visual = [
                { icon: MapPin, tint: 'bg-blue-500/10 text-blue-600', image: '/asset-location-mockup.png', fit: 'object-center' },
                { icon: History, tint: 'bg-purple-500/10 text-purple-600', image: '/asset-history-mockup.png', fit: 'object-top' },
                { icon: GitFork, tint: 'bg-emerald-500/10 text-emerald-600', image: '/asset-hierarchy-mockup.png', fit: 'object-top' },
              ][idx]
              const Icon = visual.icon
              return (
                <div key={card.title} className="rounded-2xl border border-border bg-card p-6 flex flex-col justify-between hover:shadow-lg transition-all group">
                  <div>
                    <div className={`size-11 rounded-xl ${visual.tint} flex items-center justify-center mb-5`}>
                      <Icon className="size-5" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-2">
                      {card.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {card.desc}
                    </p>
                  </div>
                  <div className="mt-6 rounded-lg overflow-hidden border border-border/60 bg-muted/30 aspect-video">
                    <img src={visual.image} alt={card.title} className={`w-full h-full object-cover ${visual.fit} group-hover:scale-105 transition-transform`} />
                  </div>
                </div>
              )
            })}

          </div>
        </div>
      </section>

      {/* --- MULTI-TENANT ARCHITECTURE SECTION (Lumen Showcase Style) --- */}
      <section id="multitenant" className="py-20 md:py-28 relative">
        <div className="container mx-auto px-4 sm:px-8 max-w-6xl">
          <div className="rounded-3xl border border-border bg-card p-8 sm:p-14 shadow-xl relative overflow-hidden">
            
            {/* Ambient Background Spot */}
            <div className="pointer-events-none absolute -right-20 -top-20 size-96 rounded-full bg-primary/5 blur-3xl"></div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              
              <div className="lg:col-span-6 space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-semibold text-primary">
                  <ShieldCheck className="size-3.5" />
                  <span>{t('multitenant.tag')}</span>
                </div>

                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
                  {t('multitenant.title')}
                </h2>

                <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                  {t('multitenant.subtitle')}
                </p>

                <div className="space-y-4 pt-2">
                  <div className="border-l-2 border-primary/50 pl-4 py-1">
                    <h4 className="font-semibold text-sm text-foreground">
                      {t('multitenant.point1_title')}
                    </h4>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                      {t('multitenant.point1_desc')}
                    </p>
                  </div>

                  <div className="border-l-2 border-primary/50 pl-4 py-1">
                    <h4 className="font-semibold text-sm text-foreground">
                      {t('multitenant.point2_title')}
                    </h4>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                      {t('multitenant.point2_desc')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Subdomain Router Interactive Card */}
              <div className="lg:col-span-6">
                <div className="rounded-2xl border border-border bg-background p-6 shadow-md space-y-3.5">
                  <div className="flex items-center justify-between pb-3 border-b border-border/50 text-xs text-muted-foreground font-medium">
                    <span className="flex items-center gap-2">
                      <Database className="size-4 text-primary" />
                      {t('multitenant.routing')}
                    </span>
                    <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded">
                      ONLINE
                    </span>
                  </div>

                  {t('multitenant.clients', { returnObjects: true }).map((c, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3.5 rounded-xl border border-border/60 bg-muted/30 hover:border-primary/40 hover:bg-muted/60 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="size-2 rounded-full bg-primary animate-pulse"></div>
                        <div>
                          <div className="font-mono text-xs font-semibold text-foreground">
                            {c.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{c.type}</div>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {c.status}
                      </span>
                    </div>
                  ))}

                  <div className="pt-2 text-center">
                    <span className="text-[11px] text-muted-foreground font-mono">
                      + 48 {t('multitenant.subdomains')}
                    </span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      </section>

      {/* --- PRICING SECTION (Lumen Modern Cards + Switcher) --- */}
      <section id="pricing" className="py-20 md:py-28 bg-muted/20 border-t border-border/40">
        <div className="container mx-auto px-4 sm:px-8 max-w-5xl">
          
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="text-xs font-semibold text-primary uppercase tracking-widest mb-2 block">
              {t('pricing.tag')}
            </span>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
              {t('pricing.title')}
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg mb-8">
              {t('pricing.subtitle')}
            </p>

            {/* Toggle Switch Monthly / Annual */}
            <div className="inline-flex items-center gap-3 p-1 rounded-full border border-border bg-card shadow-xs">
              <button
                onClick={() => setBillingAnnual(false)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  !billingAnnual ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                {t('pricing.monthly')}
              </button>
              <button
                onClick={() => setBillingAnnual(true)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  billingAnnual ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                {t('pricing.annual')}
              </button>
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
            
            {/* Plan 1: Starter */}
            <div className="rounded-2xl border border-border bg-card p-8 flex flex-col justify-between hover:shadow-lg transition-all">
              <div>
                <h3 className="text-xl font-bold text-foreground mb-1">
                  {t('pricing.p1_title')}
                </h3>
                <p className="text-xs text-muted-foreground mb-6">
                  {t('pricing.p1_desc')}
                </p>

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl sm:text-5xl font-extrabold text-foreground">
                    {billingAnnual ? "$119" : t('pricing.p1_price')}
                  </span>
                  <span className="text-sm text-muted-foreground">{t('pricing.p1_period')}</span>
                </div>

                <div className="space-y-3 border-t border-border/50 pt-6">
                  {t('pricing.p1_features', { returnObjects: true }).map((feat, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs sm:text-sm text-foreground/90">
                      <Check className="size-4 text-emerald-500 shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-8">
                <Link
                  to="/login"
                  className="w-full inline-flex items-center justify-center rounded-full border border-border bg-background py-3 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
                >
                  {t('pricing.p1_btn')}
                </Link>
              </div>
            </div>

            {/* Plan 2: Professional (Popular / Highlighted Lumen Style) */}
            <div className="rounded-2xl border-2 border-primary bg-card p-8 flex flex-col justify-between shadow-xl relative">
              <div className="absolute -top-3.5 right-6 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                {t('pricing.p2_tag')}
              </div>

              <div>
                <h3 className="text-xl font-bold text-foreground mb-1">
                  {t('pricing.p2_title')}
                </h3>
                <p className="text-xs text-muted-foreground mb-6">
                  {t('pricing.p2_desc')}
                </p>

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl sm:text-5xl font-extrabold text-foreground">
                    {billingAnnual ? "$389" : t('pricing.p2_price')}
                  </span>
                  <span className="text-sm text-muted-foreground">{t('pricing.p2_period')}</span>
                </div>

                <div className="space-y-3 border-t border-border/50 pt-6">
                  {t('pricing.p2_features', { returnObjects: true }).map((feat, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs sm:text-sm text-foreground/90 font-medium">
                      <Check className="size-4 text-primary shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-8">
                <Link
                  to="/login"
                  className="w-full inline-flex items-center justify-center rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition-all"
                >
                  {t('pricing.p2_btn')}
                </Link>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* --- TESTIMONIALS (Lumen Style Grid) --- */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 sm:px-8 max-w-6xl">
          
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="text-xs font-semibold text-primary uppercase tracking-widest mb-2 block">
              {t('testimonials.tag')}
            </span>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
              {t('testimonials.title')}
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">
              {t('testimonials.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((test, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-border bg-card p-6 sm:p-8 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow"
              >
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed italic mb-8">
                  “{test.quote}”
                </p>

                <div className="flex items-center gap-3 pt-4 border-t border-border/40">
                  <img
                    src={test.avatar}
                    alt={test.author}
                    className="size-10 rounded-full object-cover border border-border"
                  />
                  <div>
                    <div className="text-sm font-bold text-foreground">{test.author}</div>
                    <div className="text-xs text-muted-foreground">{test.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* --- FAQ SECTION (Lumen Accordion Style) --- */}
      <section id="faq" className="py-20 bg-muted/20 border-t border-border/40">
        <div className="container mx-auto px-4 sm:px-8 max-w-4xl">
          
          <div className="text-center mb-12">
            <span className="text-xs font-semibold text-primary uppercase tracking-widest mb-2 block">
              {t('faq.tag')}
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              {t('faq.title')}
            </h2>
          </div>

          <div className="space-y-4">
            {faqItems.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-card overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 font-semibold text-sm sm:text-base text-foreground hover:bg-muted/30 transition-colors"
                  >
                    <span>{item.q}</span>
                    <span className="size-6 rounded-full border border-border flex items-center justify-center shrink-0 text-muted-foreground text-xs">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs sm:text-sm text-muted-foreground leading-relaxed border-t border-border/40 pt-3">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* --- BOTTOM CTA (Lumen Callout) --- */}
      <section className="py-20 border-t border-border/40">
        <div className="container mx-auto px-4 sm:px-8 max-w-4xl text-center">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-4">
            {t('cta.title')}
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg mb-8 max-w-2xl mx-auto">
            {t('cta.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
            >
              <span>{t('hero.cta')}</span>
              <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-border bg-card px-8 py-3.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              {t('cta.contact')}
            </Link>
          </div>
        </div>
      </section>

      {/* --- FOOTER (Lumen Minimalist Clean Footer) --- */}
      <footer className="border-t border-border/40 bg-muted/10 py-12">
        <div className="container mx-auto px-4 sm:px-8 max-w-6xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">
              <Layers className="size-4" />
            </div>
            <span className="font-bold text-foreground tracking-tight">AssetHub</span>
          </div>

          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} AssetHub, Inc. {t('footer.rights')}
          </p>

          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">{t('nav.features')}</a>
            <a href="#multitenant" className="hover:text-foreground transition-colors">{t('nav.multitenant')}</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">{t('nav.pricing')}</a>
            <Link to="/login" className="hover:text-foreground transition-colors">{t('nav.login')}</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
