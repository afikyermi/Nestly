import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { BLOCK_DISTANCE, distance, fingerprintOf } from '../src/jobs/image-fingerprint.js';

// The upload block list's perceptual hash (I14 completion B, NFR-MEDIA-001, AC-162; Afik 21.10.2026): a resized or re-encoded copy of an image
// marked as suspected is caught; a different picture is not. Synthetic pictures only (no photograph of anyone).

/** A smooth picture of waves, drawn from a seed, as PNG bytes. */
async function picture(width: number, height: number, seed: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const v = y / height;
      const shade = 128 + 90 * Math.sin(u * (3 + seed) * Math.PI + seed) * Math.cos(v * (2 + seed) * Math.PI - seed) + 30 * (u - v);
      const i = (y * width + x) * 3;
      pixels[i] = Math.max(0, Math.min(255, Math.round(shade)));
      pixels[i + 1] = Math.max(0, Math.min(255, Math.round(shade * 0.8 + 20)));
      pixels[i + 2] = Math.max(0, Math.min(255, Math.round(255 - shade)));
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe('[F14.3-b AC-162 NFR-MEDIA-001] the perceptual hash of the upload block list', () => {
  it('a resized and re-encoded copy stays within the distance; a different picture does not', async () => {
    const original = await picture(800, 600, 1);
    const copy = await sharp(original).resize(397, 298).jpeg({ quality: 55 }).toBuffer();
    const webp = await sharp(original).resize(1200, 900).webp({ quality: 40 }).toBuffer();
    const other = await picture(800, 600, 3);
    const [a, b, c, d] = await Promise.all([fingerprintOf(original), fingerprintOf(copy), fingerprintOf(webp), fingerprintOf(other)]);
    if (a === undefined || b === undefined || c === undefined || d === undefined) throw new Error('no hash');
    expect(distance(a, b)).toBeLessThanOrEqual(BLOCK_DISTANCE);
    expect(distance(a, c)).toBeLessThanOrEqual(BLOCK_DISTANCE);
    expect(distance(a, d)).toBeGreaterThan(BLOCK_DISTANCE);
  });

  it('is a signed 64-bit integer (a Postgres bigint), and bytes that are no image give none', async () => {
    const hash = await fingerprintOf(await picture(120, 90, 2));
    expect(hash).toMatch(/^-?\d{1,19}$/);
    expect(BigInt(hash ?? '0') >= -(2n ** 63n) && BigInt(hash ?? '0') < 2n ** 63n).toBe(true);
    expect(await fingerprintOf(new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(distance('5', '5')).toBe(0);
    expect(distance('0', '-1')).toBe(64);
  });
});
