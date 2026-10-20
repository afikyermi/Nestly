import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processUpload } from '../src/media/image-processing.js';

// I5 (NFR-MEDIA-001 M2, M4; VAL-041; AC-104): what the server stores is a new file, at most 2,048 pixels on the long side, with no EXIF or
// GPS; a file that is not a JPEG, PNG or WebP picture (whatever its declared type) is refused.
const T = { timeout: 30_000 };

async function photo(width: number, height: number, withGps: boolean): Promise<Uint8Array> {
  const base = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 90 } } }).jpeg();
  const withMeta = withGps
    ? base.withExif({ IFD0: { Make: 'NestlyPhone', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '32/1 4/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '34/1 46/1 0/1' } })
    : base;
  return new Uint8Array(await withMeta.toBuffer());
}

describe('[AC-104 VAL-041 M4] the server re-encodes every upload', () => {
  it('[AC-104] a 4000x3000 photo is stored at most 2048 on the long side, keeping its shape', T, async () => {
    const out = await processUpload(await photo(4000, 3000, false));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(Math.max(out.width, out.height)).toBe(2048);
    expect(out.width / out.height).toBeCloseTo(4 / 3, 2);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([out.width, out.height]);
  });

  it('[AC-104 M4] EXIF and GPS are gone from the stored file (the source had both)', T, async () => {
    const source = await photo(800, 600, true);
    expect((await sharp(source).metadata()).exif, 'the fixture really carries EXIF').toBeDefined();
    const out = await processUpload(source);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const meta = await sharp(out.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc === undefined || meta.icc.byteLength > 0).toBe(true);
    expect(Buffer.from(out.bytes).includes(Buffer.from('NestlyPhone'))).toBe(false);
  });

  it('[VAL-041] a small picture is not enlarged', T, async () => {
    const out = await processUpload(await photo(300, 200, false));
    expect(out.ok && [out.width, out.height]).toEqual([300, 200]);
  });

  it('[ERR-039 VAL-041] a file that is not a JPEG, PNG or WebP picture is refused, whatever it claims to be', T, async () => {
    const gif = new Uint8Array(await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).gif().toBuffer());
    expect(await processUpload(gif)).toEqual({ ok: false, reason: 'unsupported' });
    expect(await processUpload(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toEqual({ ok: false, reason: 'unsupported' });
    expect(await processUpload(new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01]))).toEqual({ ok: false, reason: 'unsupported' });
  });
});
