import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { authService, SignUpTenantRequest } from '../services/auth.service'
import { useAuthStore } from '../store/auth.store'
import { AssetHubBrandLogo } from '@/components/brand/asset-hub-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Check, X, Loader2, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function SignupPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(state => state.setAuth)
  const { t } = useTranslation('auth')
  
  const [formData, setFormData] = useState<SignUpTenantRequest>({
    orgName: '',
    slug: '',
    adminName: '',
    email: '',
    password: '',
    planCode: 'basic'
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [isCheckingSlug, setIsCheckingSlug] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    // Auto-generate slug from orgName if slug is empty
    if (name === 'orgName' && !formData.slug) {
      setFormData(prev => ({ 
        ...prev, 
        slug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') 
      }))
    }
  }

  const handleSlugBlur = async () => {
    if (!formData.slug || formData.slug.length < 3) return
    setIsCheckingSlug(true)
    try {
      const res = await authService.checkSlug(formData.slug)
      setSlugAvailable(res.available)
    } catch (err) {
      console.error(err)
      setSlugAvailable(false)
    } finally {
      setIsCheckingSlug(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (slugAvailable === false) {
      setError(t('signup.slugUnavailableError'))
      return
    }

    setError(null)
    setIsLoading(true)

    try {
      // 1. Sign up tenant
      await authService.signUpTenant(formData)
      
      // 2. Automatically log in the user
      const loginRes = await authService.login({
        email: formData.email,
        password: formData.password
      })

      // 3. Update store and redirect
      setAuth(loginRes.accessToken, loginRes.refreshToken, loginRes.tenantSlug, loginRes.tenantName, loginRes.roles)
      
      const currentHost = window.location.hostname;
      if (loginRes.tenantSlug && currentHost === "localhost") {
        const syncData = encodeURIComponent(JSON.stringify({
          accessToken: loginRes.accessToken,
          refreshToken: loginRes.refreshToken,
          tenantSlug: loginRes.tenantSlug,
          tenantName: loginRes.tenantName,
          roles: loginRes.roles
        }));
        window.location.href = `http://${loginRes.tenantSlug}.localhost:${window.location.port}/auth-sync?data=${syncData}`;
      } else {
        navigate('/')
      }
    } catch (err: any) {
      console.error(err)
      setError(err.response?.data?.title || err.response?.data?.message || t('signup.genericError'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#fafafa] dark:bg-[#0a0a0a] px-4 py-12 selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black">
      
      {/* Background Architectural Grid Pattern */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_35%,#000_70%,transparent_100%)] opacity-70 dark:opacity-40"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: "44px 44px"
        }}
      />

      {/* Top Floating Language Switcher */}
      <div className="absolute top-5 right-5 z-20">
        <LanguageSwitcher variant="icon" />
      </div>

      <div className="relative z-10 w-full max-w-[480px]">
        
        {/* Header Block: Isotipo y títulos */}
        <div className="flex flex-col items-center text-center mb-8">
          
          <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm transition-transform duration-300 hover:scale-105 p-2">
            <AssetHubBrandLogo size={42} variant="accented" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t('signup.title')}
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {t('signup.subtitle')}
          </p>
        </div>

        {/* Card Form */}
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/90 p-7 sm:p-9 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md">
          
          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3.5 text-center text-sm font-medium text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            
            {/* Nombre de la Organización */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('signup.orgNameLabel')}
              </label>
              <Input
                name="orgName"
                type="text"
                required
                className="h-11 rounded-lg border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 text-sm transition-colors focus-visible:ring-1 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-300"
                placeholder={t('signup.orgNamePlaceholder')}
                value={formData.orgName}
                onChange={handleChange}
              />
            </div>
            
            {/* Subdominio (Slug) con input-group refinado */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('signup.slugLabel')}
              </label>
              <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent overflow-hidden focus-within:ring-1 focus-within:ring-zinc-950 dark:focus-within:ring-zinc-300 transition-colors">
                <input
                  name="slug"
                  type="text"
                  required
                  className="flex-1 min-w-0 bg-transparent px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground text-foreground font-mono"
                  placeholder={t('signup.slugPlaceholder')}
                  value={formData.slug}
                  onChange={handleChange}
                  onBlur={handleSlugBlur}
                />
                <span className="inline-flex items-center px-3.5 border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-xs font-mono text-zinc-500 dark:text-zinc-400 select-none">
                  .assethub.app
                </span>
              </div>
              
              {/* Feedback de disponibilidad del slug */}
              <div className="min-h-[20px] pt-0.5">
                {isCheckingSlug && (
                  <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <Loader2 className="size-3 animate-spin" />
                    <span>{t('signup.slugChecking')}</span>
                  </p>
                )}
                {!isCheckingSlug && slugAvailable === true && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3.5 stroke-[2.5]" />
                    <span>{t('signup.slugAvailable')}</span>
                  </p>
                )}
                {!isCheckingSlug && slugAvailable === false && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                    <X className="size-3.5 stroke-[2.5]" />
                    <span>{t('signup.slugUnavailable')}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Nombre del Administrador */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('signup.adminNameLabel')}
              </label>
              <Input
                name="adminName"
                type="text"
                required
                className="h-11 rounded-lg border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 text-sm transition-colors focus-visible:ring-1 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-300"
                placeholder={t('signup.adminNamePlaceholder')}
                value={formData.adminName}
                onChange={handleChange}
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('signup.emailLabel')}
              </label>
              <Input
                name="email"
                type="email"
                required
                className="h-11 rounded-lg border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 text-sm transition-colors focus-visible:ring-1 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-300"
                placeholder={t('signup.emailPlaceholder')}
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            {/* Contraseña */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('signup.passwordLabel')}
              </label>
              <Input
                name="password"
                type="password"
                required
                placeholder="••••••••"
                className="h-11 rounded-lg border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 text-sm transition-colors focus-visible:ring-1 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-300"
                value={formData.password}
                onChange={handleChange}
              />
            </div>

            {/* Botón de Submit */}
            <div className="pt-2">
              <Button
                type="submit"
                disabled={isLoading || slugAvailable === false}
                className="w-full h-11 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 font-medium text-sm transition-all shadow-sm active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>{t('signup.submittingBtn')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('signup.submitBtn')}</span>
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </div>
            
            {/* Redirección al Login */}
            <div className="mt-6 text-center text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              {t('signup.haveAccount')}{" "}
              <Link to="/login" className="font-semibold text-zinc-900 dark:text-zinc-100 hover:underline">
                {t('signup.signIn')}
              </Link>
            </div>

          </form>
        </div>

        {/* Volver a la página de inicio */}
        <div className="mt-8 text-center">
          <Link 
            to="/" 
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors inline-flex items-center gap-1"
          >
            {t('signup.backHome')}
          </Link>
        </div>

      </div>
    </main>
  )
}
