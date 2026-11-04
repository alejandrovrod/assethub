import { useState } from 'react';
import { Lock } from 'lucide-react';

interface LockScreenProps {
  onUnlock: (pin: string) => Promise<boolean>;
  requireDeviceLock: boolean;
}

export function LockScreen({ onUnlock, requireDeviceLock }: LockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsUnlocking(true);
    try {
      const success = await onUnlock(pin);
      if (!success) {
        setError('PIN incorrecto');
        setPin('');
      }
    } catch {
      setError('Error al desbloquear');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-xs space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>

        <div>
          <h2 className="text-lg font-semibold">Dispositivo bloqueado</h2>
          <p className="text-sm text-muted-foreground">
            {requireDeviceLock
              ? 'Ingresá tu PIN para continuar'
              : 'Ingresá tu PIN para desbloquear'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            maxLength={6}
            className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-2xl tracking-widest"
            autoFocus
          />

          <button
            type="submit"
            disabled={isUnlocking || pin.length < 4}
            className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isUnlocking ? 'Desbloqueando…' : 'Desbloquear'}
          </button>
        </form>
      </div>
    </div>
  );
}
