// What the server does to every upload before it is stored (NFR-MEDIA-001 M2, M4; VAL-041; AC-104). The browser has already shrunk the
// picture, but the server trusts nothing it receives: it reads the bytes as an image (by content, not by the declared type), turns it
// upright, shrinks it to 2,048 pixels on the long side if needed, and writes a new WebP file. Writing a new file drops every metadata block,
// EXIF and GPS included (M4: "the server verifies"); nothing of the original file is kept.

import sharp from 'sharp';
import { MEDIA_MAX_SIDE } from '@nestly/shared';

export type ProcessedImage = {
  readonly ok: true;
  readonly bytes: Uint8Array;
  readonly mime: 'image/webp';
  readonly width: number;
  readonly height: number;
};
export type ProcessingRefusal = { readonly ok: false; readonly reason: 'unsupported' };

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
/** A decoded picture larger than this many pixels is refused before work (a decompression bomb). */
const MAX_INPUT_PIXELS = 50_000_000;

export async function processUpload(input: Uint8Array): Promise<ProcessedImage | ProcessingRefusal> {
  try {
    const source = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    const meta = await source.metadata();
    if (meta.format === undefined || !ACCEPTED_FORMATS.has(meta.format)) return { ok: false, reason: 'unsupported' };
    const { data, info } = await source
      .rotate()
      .resize({ width: MEDIA_MAX_SIDE, height: MEDIA_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, bytes: new Uint8Array(data), mime: 'image/webp', width: info.width, height: info.height };
  } catch {
    return { ok: false, reason: 'unsupported' };
  }
}
