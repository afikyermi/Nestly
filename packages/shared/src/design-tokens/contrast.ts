import { colors as defaultColors } from './tokens.js';
import { contrastPairs, pairName, type ContrastPair } from './contrast-pairs.js';

const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = (hex: string): number => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) throw new RangeError(`Not a #RRGGBB colour: ${hex}`);
  const [r = 0, g = 0, b = 0] = [match[1], match[2], match[3]].map((part) => channel(parseInt(part ?? '', 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (foreground: string, background: string): number => {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

export interface PairResult {
  readonly name: string;
  readonly pair: ContrastPair;
  readonly ratio: number;
}

// `palette` defaults to the real tokens; a test passes a modified copy.
export const computeContrast = (
  palette: Readonly<Record<string, string>> = defaultColors,
  pairs: readonly ContrastPair[] = contrastPairs,
): PairResult[] =>
  pairs.map((pair) => {
    const fg = palette[pair.foreground];
    const bg = palette[pair.background];
    if (fg === undefined || bg === undefined) throw new RangeError(`Unknown token in ${pairName(pair)}`);
    return { name: pairName(pair), pair, ratio: contrastRatio(fg, bg) };
  });
