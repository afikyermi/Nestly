// A perceptual hash of an image (I14 completion B, NFR-MEDIA-001; Afik 21.10.2026): the 64-bit difference hash. The picture is turned upright,
// shrunk to 9 x 8 grey cells (each the average of an 8 x 8 block), and each bit says whether a pixel is brighter than the one to its right. A resized or re-encoded copy of the same
// picture keeps nearly the same bits, so a copy of an image marked as suspected child abuse is caught at upload (BLOCK_DISTANCE bits or fewer
// apart). Only the hash is kept, never the image. Run by the background job only.

import sharp from 'sharp';

/** At most this many differing bits count as the same picture (the database's guard holds the same number). */
export const BLOCK_DISTANCE = 6;

/** The difference hash as a signed 64-bit integer in decimal text (Postgres bigint), or undefined when the bytes are no readable image. */
export async function fingerprintOf(bytes: Uint8Array): Promise<string | undefined> {
  try {
    // 72 x 64 grey first, then each of the 9 x 8 cells is the average of its 8 x 8 block: the area average keeps the hash steady across a
    // re-encoding and a resize that a direct shrink to 9 x 8 (a few sampled pixels) would not
    const { data } = await sharp(bytes, { limitInputPixels: 50_000_000, failOn: 'error' })
      .rotate()
      .greyscale()
      .resize(72, 64, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const cell = (cx: number, cy: number): number => {
      let sum = 0;
      for (let y = cy * 8; y < cy * 8 + 8; y += 1) for (let x = cx * 8; x < cx * 8 + 8; x += 1) sum += data[y * 72 + x] ?? 0;
      return sum;
    };
    let hash = 0n;
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) hash = (hash << 1n) | (cell(col, row) > cell(col + 1, row) ? 1n : 0n);
    }
    return BigInt.asIntN(64, hash).toString();
  } catch {
    return undefined;
  }
}

/** How many bits two fingerprints differ in. */
export function distance(a: string, b: string): number {
  let x = BigInt.asUintN(64, BigInt(a) ^ BigInt(b));
  let bits = 0;
  while (x > 0n) {
    bits += Number(x & 1n);
    x >>= 1n;
  }
  return bits;
}
