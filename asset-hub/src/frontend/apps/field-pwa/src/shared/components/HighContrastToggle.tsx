// HighContrastToggle.tsx — Toggle for high contrast theme
import { useState, useEffect } from 'react';
import { Contrast } from 'lucide-react';

export function HighContrastToggle() {
  const [isHighContrast, setIsHighContrast] = useState(() => {
    return localStorage.getItem('field-pwa-high-contrast') === 'true';
  });

  useEffect(() => {
    if (isHighContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
    localStorage.setItem('field-pwa-high-contrast', String(isHighContrast));
  }, [isHighContrast]);

  return (
    <button
      onClick={() => setIsHighContrast(!isHighContrast)}
      className="flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background text-foreground hover:bg-muted"
      aria-label={isHighContrast ? 'Desactivar alto contraste' : 'Activar alto contraste'}
    >
      <Contrast className="h-5 w-5" />
    </button>
  );
}
