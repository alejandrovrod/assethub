// EvidenceCapture.tsx — Single-source photo capture for task evidence
import { useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';

interface EvidenceCaptureProps {
  onCapture: (file: File) => void;
  maxFiles?: number;
  currentCount?: number;
  isUploading?: boolean;
  disabled?: boolean;
}

export function EvidenceCapture({
  onCapture,
  maxFiles = 10,
  currentCount = 0,
  isUploading = false,
  disabled = false,
}: EvidenceCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear input value immediately so selecting the same file or taking another photo triggers cleanly
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (currentCount >= maxFiles) return;

    onCapture(file);
  };

  const isFull = currentCount >= maxFiles;

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Evidencias ({currentCount}/{maxFiles})
      </span>
      {!isFull && !disabled && (
        <button
          type="button"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-95"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Subiendo…
            </>
          ) : (
            <>
              <Camera className="h-3.5 w-3.5" />
              Capturar
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={isUploading || isFull || disabled}
        onChange={handleChange}
        className="sr-only"
      />
    </div>
  );
}
