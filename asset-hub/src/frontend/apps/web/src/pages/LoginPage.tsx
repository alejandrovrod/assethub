import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AssetHubBrandLogo } from "@/components/brand/asset-hub-logo";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { authService } from "../services/auth.service";
import { useAuthStore } from "../store/auth.store";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  rememberMe: z.boolean(),
  mfaCode: z.string().optional(),
});

type FormValues = {
  email: string;
  password: string;
  rememberMe: boolean;
  mfaCode?: string;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((state) => state.setAuth);
  const { t } = useTranslation('auth');

  const [isLoading, setIsLoading] = useState(false);
  const [requiresMfa, setRequiresMfa] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
      mfaCode: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      setIsLoading(true);
      const data = await authService.login({
        email: values.email,
        password: values.password,
        mfaCode: values.mfaCode,
      });
      queryClient.clear();
      setAuth(data.accessToken, data.refreshToken, data.tenantSlug, data.tenantName, data.roles, data.permissions);
      toast.success(t('login.welcomeToast'));

      const currentHost = window.location.hostname;
      if (data.tenantSlug && currentHost === "localhost") {
        const syncData = encodeURIComponent(JSON.stringify({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tenantSlug: data.tenantSlug,
          tenantName: data.tenantName,
          roles: data.roles,
          permissions: data.permissions
        }));
        window.location.href = `http://${data.tenantSlug}.localhost:${window.location.port}/auth-sync?data=${syncData}`;
      } else {
        navigate("/");
      }
    } catch (error: any) {
      if (error.response?.data?.detail === "MFA_REQUIRED" || error.response?.data?.title === "MFA_REQUIRED") {
        setRequiresMfa(true);
        toast.info(t('login.mfaToast'));
      } else {
        toast.error(error.response?.data?.detail || t('login.errorGeneric'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#fafafa] dark:bg-[#0a0a0a] px-4 py-12 selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black">
      
      {/* Background Architectural Grid Pattern */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] opacity-70 dark:opacity-40"
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
        <LanguageSwitcher variant="full" className="rounded-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm shadow-2xs" />
      </div>

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Header Block: Isotipo y títulos */}
        <div className="flex flex-col items-center text-center mb-8">
          
          <div className="mb-6 flex size-16 items-center justify-center rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm transition-transform duration-300 hover:scale-105 p-2">
            <AssetHubBrandLogo size={48} variant="accented" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t('login.title')}
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {t('login.subtitle')}
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/90 p-7 sm:p-9 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              
              {!requiresMfa ? (
                <>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          {t('login.emailLabel')}
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder={t('login.emailPlaceholder')} 
                            type="email" 
                            autoComplete="email"
                            className="h-11 rounded-lg border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 text-sm transition-colors focus-visible:ring-1 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-300"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          {t('login.passwordLabel')}
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder={t('login.passwordPlaceholder')} 
                            type="password" 
                            autoComplete="current-password"
                            className="h-11 rounded-lg border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 text-sm transition-colors focus-visible:ring-1 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-300"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Utilities Row: Remember me & Forgot Password */}
                  <div className="flex items-center justify-between pt-1">
                    <FormField
                      control={form.control}
                      name="rememberMe"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="rounded border-zinc-300 dark:border-zinc-700"
                            />
                          </FormControl>
                          <FormLabel className="text-xs sm:text-sm font-normal text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
                            {t('login.rememberMe')}
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <Link 
                      to="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        toast.info(t('login.forgotPasswordMsg'));
                      }}
                      className="text-xs sm:text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                    >
                      {t('login.forgotPassword')}
                    </Link>
                  </div>
                </>
              ) : (
                <FormField
                  control={form.control}
                  name="mfaCode"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        {t('login.mfaLabel')}
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="123456" 
                          autoComplete="one-time-code" 
                          className="h-11 rounded-lg border-zinc-200 dark:border-zinc-800 tracking-widest text-center font-mono text-base"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Main Submit Action Button */}
              <div className="pt-2">
                <Button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full h-11 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 font-medium text-sm transition-all shadow-sm active:scale-[0.99]"
                >
                  {isLoading ? t('login.signingInBtn') : t('login.signInBtn')}
                </Button>
              </div>

              {/* Alternative Google Sign In Button */}
              <Button
                type="button"
                variant="outline"
                onClick={() => toast.info(t('login.googleSoon'))}
                className="w-full h-11 rounded-lg border-zinc-200 dark:border-zinc-800 bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium text-sm transition-all flex items-center justify-center gap-2.5 shadow-2xs"
              >
                <svg className="size-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    fill="#EA4335"
                  />
                </svg>
                <span>{t('login.googleBtn')}</span>
              </Button>

            </form>
          </Form>

          {/* Footer Navigation */}
          <div className="mt-6 text-center text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            {t('login.noAccount')}{" "}
            <Link to="/signup" className="font-semibold text-zinc-900 dark:text-zinc-100 hover:underline">
              {t('login.registerOrg')}
            </Link>
          </div>
        </div>

        {/* Back to Home Link */}
        <div className="mt-8 text-center">
          <Link 
            to="/" 
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors inline-flex items-center gap-1"
          >
            {t('login.backHome')}
          </Link>
        </div>

      </div>
    </main>
  );
}
