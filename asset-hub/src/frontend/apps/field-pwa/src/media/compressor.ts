// compressor.ts — Image compression for field evidence photos
// Target: ≤ 250 KB, max side 1600px, EXIF orientation applied

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const originalSize = file.size;

  // Load image
  const img = await loadImage(file);

  // Calculate target dimensions
  const maxSide = 1600;
  let { width, height } = img;
  if (width > maxSide || height > maxSide) {
    const scale = maxSide / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  // Draw to canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  ctx.drawImage(img, 0, 0, width, height);

  // Compress to target size (≤ 250 KB)
  let quality = 0.8;
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality);

  const targetSize = 250 * 1024;
  while (blob.size > targetSize && quality > 0.1) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }

  return {
    blob,
    width,
    height,
    originalSize,
    compressedSize: blob.size,
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      type,
      quality,
    );
  });
}
