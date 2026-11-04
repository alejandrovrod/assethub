// BarcodeScannerModal.tsx — Camera scanner for QR codes and 1D barcodes
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  type IScannerControls,
} from '@zxing/browser';
import { CameraOff, Loader2, RefreshCw, ScanLine, X } from 'lucide-react';

interface Props {
  /** Called once with the decoded payload. The modal closes right after. */
  onScan: (code: string) => void;
  onClose: () => void;
}

type ScannerStatus = 'starting' | 'scanning' | 'denied' | 'error';

/**
 * Formats a field technician actually finds on an asset tag: the QR, plus the common
 * 1D symbologies (Code 128 / Code 39 / EAN / UPC / ITF) and Data Matrix.
 */
const SUPPORTED_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.DATA_MATRIX,
];

function isPermissionError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError';
}

function describeError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'El navegador bloqueó la cámara. Habilitala en los permisos del sitio y volvé a intentar.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No se encontró ninguna cámara en este dispositivo.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'La cámara está siendo usada por otra aplicación.';
    case 'OverconstrainedError':
      return 'La cámara trasera no está disponible. Probá con otro dispositivo.';
    default:
      return 'No se pudo iniciar la cámara. Revisá los permisos e intentá de nuevo.';
  }
}

export function BarcodeScannerModal({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const hasScannedRef = useRef(false);
  const callbacksRef = useRef({ onScan, onClose });
  const [status, setStatus] = useState<ScannerStatus>('starting');
  const [errorMessage, setErrorMessage] = useState('');
  const [attempt, setAttempt] = useState(0);

  // Keep the latest callbacks without restarting the camera on every parent render.
  useEffect(() => {
    callbacksRef.current = { onScan, onClose };
  }, [onScan, onClose]);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 150,
      delayBetweenScanSuccess: 400,
    });
    reader.possibleFormats = SUPPORTED_FORMATS;

    hasScannedRef.current = false;
    setStatus('starting');
    setErrorMessage('');

    reader
      .decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        video,
        (result) => {
          if (cancelled || hasScannedRef.current) return;
          if (!result) return;

          hasScannedRef.current = true;
          const text = result.getText();
          callbacksRef.current.onScan(text);
          callbacksRef.current.onClose();
        },
      )
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStatus('scanning');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus(isPermissionError(error) ? 'denied' : 'error');
        setErrorMessage(describeError(error));
      });

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [attempt, stopCamera]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5" />
          <h2 className="text-base font-semibold">Escanear activo</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar escáner"
          className="rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className={`h-full w-full object-cover transition-opacity ${
            status === 'scanning' ? 'opacity-100' : 'opacity-30'
          }`}
          autoPlay
          muted
          playsInline
        />

        {status === 'scanning' && (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-56 w-56 max-w-[70vw]">
                <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-lg border-l-4 border-t-4 border-primary" />
                <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-lg border-r-4 border-t-4 border-primary" />
                <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-lg border-b-4 border-l-4 border-primary" />
                <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-lg border-b-4 border-r-4 border-primary" />
                <span className="absolute left-2 right-2 top-1/2 h-0.5 animate-pulse bg-primary/80" />
              </div>
            </div>
            <p className="absolute inset-x-0 bottom-8 text-center text-sm text-white/80">
              Apuntá al código QR o de barras del activo
            </p>
          </>
        )}

        {(status === 'starting' || status === 'denied' || status === 'error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            {status === 'starting' ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-white/70">Iniciando cámara…</p>
              </>
            ) : (
              <>
                <div className="rounded-full bg-white/10 p-4">
                  <CameraOff className="h-8 w-8 text-red-400" />
                </div>
                <p className="text-sm font-medium">
                  {status === 'denied' ? 'Permiso de cámara denegado' : 'No se pudo abrir la cámara'}
                </p>
                <p className="text-xs text-white/60">{errorMessage}</p>
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className="mt-2 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reintentar
                </button>
                <p className="text-[11px] text-white/40">
                  También podés buscar el activo por su código en la barra de búsqueda.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
