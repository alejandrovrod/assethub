import { WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OfflineBannerProps {
  isOnline: boolean;
  className?: string;
}

export function OfflineBanner({ isOnline, className }: OfflineBannerProps) {
  if (isOnline) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-sm text-amber-700 dark:text-amber-400',
        className,
      )}
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>Sin conexión — los cambios se sincronizarán al reconectar</span>
    </div>
  );
}
