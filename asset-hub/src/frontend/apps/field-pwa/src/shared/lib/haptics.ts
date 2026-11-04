// haptics.ts — Optional haptic feedback
export function hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light'): void {
  if (!('vibrate' in navigator)) return;
  const patterns: Record<string, number | number[]> = {
    light: 10,
    medium: 25,
    heavy: 50,
  };
  try {
    navigator.vibrate(patterns[type]);
  } catch {
    // Ignore
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
