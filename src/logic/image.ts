/**
 * Image helpers for Hospivo.
 * Rules:
 * - Invoice photos shrunk to max 1600 px on the longest side, JPEG quality 0.7.
 */

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Calculates scaled dimensions preserving aspect ratio such that neither
 * width nor height exceeds maxDimension.
 */
export function scaledSize(
  width: number,
  height: number,
  maxDimension = 1600
): Dimensions {
  if (width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }

  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  if (width >= height) {
    const scaledHeight = Math.round((height * maxDimension) / width);
    return { width: maxDimension, height: scaledHeight };
  } else {
    const scaledWidth = Math.round((width * maxDimension) / height);
    return { width: scaledWidth, height: maxDimension };
  }
}

/**
 * Compresses an image file down to maxDimension (default 1600px) and quality (default 0.7).
 */
export async function compressInvoicePhoto(
  file: File,
  maxDimension = 1600,
  quality = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = scaledSize(img.width, img.height, maxDimension);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
