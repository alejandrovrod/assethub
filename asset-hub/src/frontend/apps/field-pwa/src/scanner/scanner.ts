// scanner.ts — Barcode/QR scanner with BarcodeDetector + @zxing fallback
export interface ScanResult {
  code: string;
  format: string;
}

export interface ScannerHandle {
  start: (videoElement: HTMLVideoElement) => Promise<void>;
  stop: () => void;
  isSupported: () => boolean;
}

export function createScanner(onScan: (result: ScanResult) => void): ScannerHandle {
  let stream: MediaStream | null = null;
  let scanning = false;
  let scanInterval: ReturnType<typeof setInterval> | null = null;

  const hasBarcodeDetector = 'BarcodeDetector' in window;

  async function start(videoElement: HTMLVideoElement): Promise<void> {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      videoElement.srcObject = stream;
      await videoElement.play();
      scanning = true;

      if (hasBarcodeDetector) {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13'] });
        scanInterval = setInterval(async () => {
          if (!scanning || videoElement.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoElement);
            if (barcodes.length > 0) {
              const barcode = barcodes[0];
              onScan({ code: barcode.rawValue, format: barcode.format });
              stop();
            }
          } catch {
            // Ignore detection errors
          }
        }, 500);
      } else {
        // Fallback: use @zxing/browser
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        reader.decodeFromVideoDevice(undefined, videoElement, (result) => {
          if (result && scanning) {
            onScan({ code: result.getText(), format: result.getBarcodeFormat().toString() });
            stop();
          }
        });
      }
    } catch (err) {
      throw new Error('Camera access denied or unavailable');
    }
  }

  function stop(): void {
    scanning = false;
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }

  function isSupported(): boolean {
    return !!navigator.mediaDevices?.getUserMedia;
  }

  return { start, stop, isSupported };
}

// Toggle flashlight if available
export async function toggleTorch(stream: MediaStream, on: boolean): Promise<boolean> {
  const track = stream.getVideoTracks()[0];
  if (!track) return false;
  try {
    await track.applyConstraints({ advanced: [{ torch: on } as any] });
    return true;
  } catch {
    return false;
  }
}
