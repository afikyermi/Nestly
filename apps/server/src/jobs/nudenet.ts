// The image check's model (Afik 20.10.2026, decisions-in-force.md §2): NudeNet 320n, AGPL-3.0 (models/NOTICE.md), on onnxruntime-node with
// sharp. Loaded once per function instance and only by the background job. Input: an image file; output: the highest score of every label
// the detector knows (0..1). The decision rule (thresholds) is shared: verdictOf in @nestly/shared.

import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const LABELS = [
  'FEMALE_GENITALIA_COVERED', 'FACE_FEMALE', 'BUTTOCKS_EXPOSED', 'FEMALE_BREAST_EXPOSED', 'FEMALE_GENITALIA_EXPOSED', 'MALE_BREAST_EXPOSED',
  'ANUS_EXPOSED', 'FEET_EXPOSED', 'BELLY_COVERED', 'FEET_COVERED', 'ARMPITS_COVERED', 'ARMPITS_EXPOSED', 'FACE_MALE', 'BELLY_EXPOSED',
  'MALE_GENITALIA_EXPOSED', 'ANUS_COVERED', 'FEMALE_BREAST_COVERED', 'BUTTOCKS_COVERED',
] as const;
const SIDE = 320;
const MODEL_PATH = fileURLToPath(new URL('../../models/nudenet-320n.onnx', import.meta.url));

export type Scores = Record<string, number>;
export interface ImageModel {
  score(image: Uint8Array): Promise<Scores>;
}

/** NudeNet's input: pad bottom/right to a square (black), resize to 320, RGB, scaled to 0..1, channels first. */
async function tensorOf(image: Uint8Array): Promise<Float32Array> {
  const base = sharp(image, { limitInputPixels: 50_000_000 }).rotate().removeAlpha();
  const meta = await base.metadata();
  const width = meta.autoOrient?.width ?? meta.width;
  const height = meta.autoOrient?.height ?? meta.height;
  if (width === undefined || height === undefined) throw new Error('nudenet: unreadable image');
  const side = Math.max(width, height);
  const { data } = await base
    .extend({ bottom: side - height, right: side - width, background: { r: 0, g: 0, b: 0 } })
    .resize(SIDE, SIDE, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const plane = SIDE * SIDE;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    out[i] = (data[i * 3] ?? 0) / 255;
    out[plane + i] = (data[i * 3 + 1] ?? 0) / 255;
    out[2 * plane + i] = (data[i * 3 + 2] ?? 0) / 255;
  }
  return out;
}

/** The detector's output [1, 4 + labels, anchors]: the best score of each label over every anchor (a verdict needs no box). */
export function bestScores(dims: readonly number[], data: ArrayLike<number>): Scores {
  const classes = dims[1] ?? 0;
  const anchors = dims[2] ?? 0;
  const best: Scores = {};
  for (let c = 4; c < classes; c++) {
    const label = LABELS[c - 4];
    if (label === undefined) continue;
    let top = 0;
    for (let a = 0; a < anchors; a++) top = Math.max(top, data[c * anchors + a] ?? 0);
    best[label] = top;
  }
  return best;
}

let cached: Promise<ImageModel> | undefined;

export function loadNudeNet(): Promise<ImageModel> {
  cached ??= (async () => {
    const ort = await import('onnxruntime-node');
    const session = await ort.InferenceSession.create(MODEL_PATH);
    const input = session.inputNames[0];
    const output = session.outputNames[0];
    if (input === undefined || output === undefined) throw new Error('nudenet: the model has no input or output');
    return {
      async score(image) {
        const tensor = new ort.Tensor('float32', await tensorOf(image), [1, 3, SIDE, SIDE]);
        const result = await session.run({ [input]: tensor });
        const out = result[output];
        if (out === undefined || !(out.data instanceof Float32Array)) throw new Error('nudenet: no float output');
        return bestScores(out.dims, out.data);
      },
    };
  })();
  cached.catch(() => {
    cached = undefined;
  });
  return cached;
}
