// scan.tsx — QR/Barcode scanner screen
import { useRef, useState, useEffect } from 'react';
import { createScanner } from '../scanner/scanner';
import { X } from 'lucide-react';

interface ScanPageProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function ScanPage({ onScan, onClose }: ScanPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<ReturnType<typeof createScanner> | null>(null);

  useEffect(() => {
    const scanner = createScanner((result) => {
      onScan(result.code);
    });
    scannerRef.current = scanner;

    if (videoRef.current) {
      scanner.start(videoRef.current).then(() => {
        setIsScanning(true);
      }).catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al acceder a la cámara');
      });
    }

    return () => {
      scanner.stop();
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="relative h-full w-full">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="rounded-lg bg-background p-4 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <button onClick={onClose} className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">
                Cerrar
              </button>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white"
        >
          <X className="h-6 w-6" />
        </button>

        {isScanning && (
          <div className="absolute bottom-8 left-0 right-0 text-center">
            <p className="text-sm text-white/80">Apuntá la cámara al código QR o de barras</p>
          </div>
        )}
      </div>
    </div>
  );
}
