import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { authService, SignUpTenantRequest } from '../services/auth.service'
import { useAuthStore } from '../store/auth.store'

export default function SignupPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(state => state.setAuth)
  
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
      setError('El subdominio elegido no está disponible.')
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
      setError(err.response?.data?.title || err.response?.data?.message || 'Error al registrar la organización.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-8 rounded-lg shadow">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Registra tu Organización
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Comienza a gestionar tus activos en minutos
          </p>
        </div>
        
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-500 p-3 rounded text-sm text-center">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Nombre de la Organización
              </label>
              <input
                name="orgName"
                type="text"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Mi Empresa S.A."
                value={formData.orgName}
                onChange={handleChange}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Subdominio (Slug)
              </label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  name="slug"
                  type="text"
                  required
                  className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md border border-gray-300 focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="mi-empresa"
                  value={formData.slug}
                  onChange={handleChange}
                  onBlur={handleSlugBlur}
                />
                <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-gray-300">
                  .assethub.app
                </span>
              </div>
              {isCheckingSlug && <p className="mt-1 text-xs text-gray-500">Verificando disponibilidad...</p>}
              {slugAvailable === true && <p className="mt-1 text-xs text-green-600">Subdominio disponible</p>}
              {slugAvailable === false && <p className="mt-1 text-xs text-red-600">Subdominio no disponible</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Nombre del Administrador
              </label>
              <input
                name="adminName"
                type="text"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Juan Pérez"
                value={formData.adminName}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>
              <input
                name="email"
                type="email"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="juan@miempresa.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Contraseña
              </label>
              <input
                name="password"
                type="password"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                value={formData.password}
                onChange={handleChange}
              />
            </div>

          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading || slugAvailable === false}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoading ? 'Registrando...' : 'Crear Cuenta'}
            </button>
          </div>
          
          <div className="text-center text-sm">
            <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
              ¿Ya tienes una cuenta? Inicia sesión
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
