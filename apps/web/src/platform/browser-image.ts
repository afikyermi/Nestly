/** What picking an image needs of the browser (I5, NFR-MEDIA-001 M2, M4, VAL-041). A test passes its own. */
export interface ImageShrinker {
  /** The picture, upright, at most `maxSide` pixels on its long side, as a new JPEG (a new file carries no EXIF or GPS). */
  shrink(file: Blob, maxSide: number): Promise<{ ok: true; blob: Blob; width: number; height: number } | { ok: false }>;
}

// The one place web logic decodes and redraws a picture (createImageBitmap and a canvas). A file the browser cannot decode (HEIC outside
// Safari, a damaged file) is { ok: false }: the screen shows ERR-039.
export function browserImageShrinker(): ImageShrinker {
  return {
    shrink: async (file, maxSide) => {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (context === null) return { ok: false };
        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
        return blob === null ? { ok: false } : { ok: true, blob, width, height };
      } catch {
        return { ok: false };
      }
    },
  };
}
