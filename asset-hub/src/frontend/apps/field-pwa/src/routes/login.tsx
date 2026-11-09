import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../features/auth/hooks/useSession';

export function LoginPage() {
  const { t } = useTranslation(['auth', 'common']);
  const { login, isLoading } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showMfa, setShowMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password, showMfa ? mfaCode : undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('auth:errors.loginFailed');
      if (msg === 'MFA_REQUIRED') {
        setShowMfa(true);
        setError(t('auth:errors.mfaRequired'));
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{t('common:app.name')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth:login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              {t('auth:login.email')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={t('auth:login.emailPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              {t('auth:login.password')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={t('auth:login.passwordPlaceholder')}
            />
          </div>

          {showMfa && (
            <div className="space-y-2">
              <label htmlFor="mfa" className="text-sm font-medium">
                {t('auth:login.mfa')}
              </label>
              <input
                id="mfa"
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                maxLength={6}
                autoComplete="one-time-code"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={t('auth:login.mfaPlaceholder')}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isLoading ? t('auth:login.submitting') : t('auth:login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
