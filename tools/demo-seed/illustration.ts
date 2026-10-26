// Flat illustrations for the demo's avatars, listings and Stories: simple shapes on a pastel background, drawn here and encoded as PNG
// (the product accepts JPEG, PNG or WebP; an SVG is not an upload type). No people, no faces, no photographs: plan §4 and §6 of
// docs/lecturer-demo-plan-HE.md. Deterministic: the same motif always gives the same bytes.
import { crc32, deflateSync } from 'node:zlib';

type Rgb = readonly [number, number, number];
type Shape = (x: number, y: number) => boolean;
interface Layer {
  shape: Shape;
  color: Rgb;
}

const SIZE = 384;
const C = SIZE / 2;

const PALETTES: readonly (readonly [Rgb, Rgb, Rgb])[] = [
  [[253, 236, 228], [233, 140, 120], [120, 80, 70]],
  [[232, 243, 236], [111, 168, 132], [56, 98, 72]],
  [[236, 238, 252], [128, 136, 214], [70, 76, 140]],
  [[252, 246, 226], [236, 182, 72], [140, 100, 30]],
  [[244, 234, 248], [178, 128, 196], [100, 64, 120]],
  [[228, 244, 248], [96, 170, 196], [40, 100, 120]],
];

const circle = (cx: number, cy: number, r: number): Shape => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const rect = (x0: number, y0: number, x1: number, y1: number): Shape => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const ring = (cx: number, cy: number, r: number, w: number): Shape => (x, y) => {
  const d = Math.hypot(x - cx, y - cy);
  return d <= r && d >= r - w;
};
const and = (...shapes: Shape[]): Shape => (x, y) => shapes.every((s) => s(x, y));
const not = (shape: Shape): Shape => (x, y) => !shape(x, y);
const any = (...shapes: Shape[]): Shape => (x, y) => shapes.some((s) => s(x, y));

/** A filled polygon (even-odd rule). */
function polygon(points: readonly (readonly [number, number])[]): Shape {
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const [xi, yi] = points[i] ?? [0, 0];
      const [xj, yj] = points[j] ?? [0, 0];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}

function star(cx: number, cy: number, outer: number, inner: number, points = 5): Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return polygon(pts);
}

const around = (n: number, dist: number, r: number): Shape[] =>
  Array.from({ length: n }, (_, i) => circle(C + dist * Math.cos((2 * Math.PI * i) / n), C + dist * Math.sin((2 * Math.PI * i) / n), r));

/** The motifs: [main shape, detail shape]. Unknown motifs fall back to a gift box. */
const MOTIFS: Record<string, () => [Shape, Shape]> = {
  moon: () => [and(circle(C, C, 110), not(circle(C + 55, C - 35, 95))), star(C + 80, C + 60, 22, 9)],
  sun: () => [circle(C, C, 80), any(...around(10, 125, 16))],
  star: () => [star(C, C, 130, 55), circle(C + 110, C - 110, 12)],
  heart: () => [any(circle(C - 52, C - 30, 62), circle(C + 52, C - 30, 62), polygon([[C - 112, C], [C + 112, C], [C, C + 120]])), circle(C + 95, C - 105, 14)],
  leaf: () => [and(circle(C - 60, C, 130), circle(C + 60, C, 130)), rect(C - 3, C - 100, C + 3, C + 140)],
  flower: () => [any(...around(6, 70, 52)), circle(C, C, 40)],
  cloud: () => [any(circle(C - 70, C + 10, 60), circle(C, C - 30, 80), circle(C + 75, C + 15, 55), rect(C - 70, C + 10, C + 75, C + 70)), circle(C + 120, C - 120, 18)],
  wave: () => [(x, y) => y > C + 40 * Math.sin(x / 40) && y < C + 60 + 40 * Math.sin(x / 40), (x, y) => y > C + 90 + 30 * Math.sin(x / 35 + 1) && y < C + 120 + 30 * Math.sin(x / 35 + 1)],
  drop: () => [any(circle(C, C + 40, 85), polygon([[C - 78, C + 10], [C + 78, C + 10], [C, C - 140]])), circle(C - 30, C + 20, 18)],
  mountain: () => [polygon([[C - 160, C + 110], [C - 30, C - 90], [C + 90, C + 110]]), polygon([[C - 10, C + 110], [C + 80, C - 30], [C + 165, C + 110]])],
  tree: () => [any(circle(C, C - 40, 95), circle(C - 60, C + 10, 60), circle(C + 60, C + 10, 60)), rect(C - 18, C + 40, C + 18, C + 150)],
  spark: () => [polygon([[C, C - 140], [C + 50, C], [C, C + 140], [C - 50, C]]), polygon([[C - 140, C], [C, C - 40], [C + 140, C], [C, C + 40]])],
  stroller: () => [any(and(circle(C - 10, C - 10, 110), rect(0, C - 10, SIZE, SIZE)), rect(C + 100, C - 110, C + 118, C)), any(ring(C - 70, C + 130, 34, 12), ring(C + 60, C + 130, 34, 12))],
  crib: () => [any(rect(C - 140, C - 90, C + 140, C - 75), rect(C - 140, C + 80, C + 140, C + 95), rect(C - 140, C - 120, C - 125, C + 130), rect(C + 125, C - 120, C + 140, C + 130)), any(...Array.from({ length: 9 }, (_, i) => rect(C - 110 + i * 28, C - 75, C - 102 + i * 28, C + 80)))],
  books: () => [any(rect(C - 120, C + 40, C + 120, C + 90), rect(C - 100, C - 70, C + 100, C - 20)), rect(C - 110, C - 15, C + 110, C + 35)],
  toys: () => [circle(C - 60, C + 40, 70), rect(C + 20, C - 100, C + 140, C + 20)],
  bottle: () => [rect(C - 55, C - 60, C + 55, C + 140), any(rect(C - 35, C - 100, C + 35, C - 60), circle(C, C - 115, 22))],
  screen: () => [rect(C - 130, C - 100, C + 130, C + 70), any(rect(C - 12, C + 70, C + 12, C + 120), rect(C - 70, C + 120, C + 70, C + 135))],
  shirt: () => [any(rect(C - 80, C - 100, C + 80, C + 130), polygon([[C - 80, C - 100], [C - 150, C - 40], [C - 115, C], [C - 80, C - 40]]), polygon([[C + 80, C - 100], [C + 150, C - 40], [C + 115, C], [C + 80, C - 40]])), circle(C, C - 100, 30)],
  bike: () => [any(ring(C - 85, C + 60, 60, 14), ring(C + 85, C + 60, 60, 14)), polygon([[C - 85, C + 60], [C - 10, C - 40], [C + 85, C + 60], [C + 75, C + 70], [C - 10, C - 20], [C - 75, C + 70]])],
  bath: () => [and(circle(C, C - 20, 150), rect(0, C - 20, SIZE, SIZE)), any(circle(C - 60, C - 60, 16), circle(C - 20, C - 90, 12), circle(C + 30, C - 70, 18))],
  bag: () => [rect(C - 120, C - 60, C + 120, C + 120), ring(C, C - 60, 60, 16)],
  cup: () => [rect(C - 80, C - 60, C + 60, C + 110), ring(C + 75, C + 20, 45, 16)],
  dress: () => [polygon([[C - 50, C - 110], [C + 50, C - 110], [C + 120, C + 130], [C - 120, C + 130]]), circle(C, C - 115, 28)],
  gift: () => [rect(C - 120, C - 60, C + 120, C + 120), any(rect(C - 12, C - 60, C + 12, C + 120), rect(C - 120, C + 20, C + 120, C + 40), circle(C - 30, C - 80, 26), circle(C + 30, C - 80, 26))],
};

const ALIASES: Record<string, string> = {
  carseat: 'stroller', bassinet: 'bath', carrier: 'heart', clothes: 'shirt', warmer: 'bottle', pump: 'bottle',
  monitor: 'screen', highchair: 'crib', playmat: 'toys',
};

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h;
}

export function knownMotif(motif: string): boolean {
  return Object.hasOwn(MOTIFS, motif) || Object.hasOwn(ALIASES, motif);
}

/** The motif drawn as RGB pixels, SIZE x SIZE. */
export function renderMotif(motif: string): { width: number; height: number; rgb: Uint8Array } {
  const name = ALIASES[motif] ?? motif;
  const draw = MOTIFS[name] ?? MOTIFS['gift'];
  const palette = PALETTES[hash(motif) % PALETTES.length] ?? PALETTES[0];
  if (draw === undefined || palette === undefined) throw new Error('illustration: no default motif');
  const [main, detail] = draw();
  const [bg, fg, accent] = palette;
  const layers: Layer[] = [{ shape: main, color: fg }, { shape: detail, color: accent }];
  const rgb = new Uint8Array(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let color: Rgb = bg;
      for (const layer of layers) if (layer.shape(x + 0.5, y + 0.5)) color = layer.color;
      const i = (y * SIZE + x) * 3;
      rgb[i] = color[0];
      rgb[i + 1] = color[1];
      rgb[i + 2] = color[2];
    }
  }
  return { width: SIZE, height: SIZE, rgb };
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** An 8-bit RGB PNG of the pixels. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array(Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]));
}

export function illustrationPng(motif: string): Uint8Array {
  const { width, height, rgb } = renderMotif(motif);
  return encodePng(width, height, rgb);
}
