import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

const formSchema = z.object({
  email: z.string().email({ message: "Debe ser un email válido" }),
  password: z.string().min(6, { message: "La contraseña es muy corta" }),
  mfaCode: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [isLoading, setIsLoading] = useState(false);
  const [requiresMfa, setRequiresMfa] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
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
      setAuth(data.accessToken, data.refreshToken, data.tenantSlug, data.tenantName, data.roles, data.permissions);
      toast.success("¡Bienvenido a AssetHub!");

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
        toast.info("Ingresa el código de tu aplicación autenticadora");
      } else {
        toast.error(error.response?.data?.detail || "Error al iniciar sesión. Verificá tus credenciales.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>Accede a AssetHub con tus credenciales.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              {!requiresMfa ? (
                <>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="admin@assethub.com" type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña</FormLabel>
                        <FormControl>
                          <Input placeholder="••••••••" type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : (
                <FormField
                  control={form.control}
                  name="mfaCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código de Autenticación (MFA)</FormLabel>
                      <FormControl>
                        <Input placeholder="123456" autoComplete="one-time-code" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </Form>
          <div className="mt-4 text-center text-sm">
            ¿No tenés una cuenta?{" "}
            <a href="/signup" className="text-primary hover:underline">
              Registrá tu empresa
            </a>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
