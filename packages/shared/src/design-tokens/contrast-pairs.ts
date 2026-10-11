import type { colors } from './tokens.js';

export type ColorName = keyof typeof colors;

export interface ContrastPair {
  readonly foreground: ColorName;
  readonly background: ColorName;
  // The ratio written in docs/design/tokens.md, section on contrast. The
  // contrast test checks the computed ratio against it within 0.01.
  readonly documented: number;
  // 4.5 text, 3 border, icon and focus ring. null: informational, not asserted.
  readonly threshold: 4.5 | 3 | null;
}

const text = (foreground: ColorName, background: ColorName, documented: number): ContrastPair => ({
  foreground,
  background,
  documented,
  threshold: 4.5,
});
const graphic = (foreground: ColorName, background: ColorName, documented: number): ContrastPair => ({
  foreground,
  background,
  documented,
  threshold: 3,
});

export const contrastPairs: readonly ContrastPair[] = [
  text('foreground', 'background', 12.28),
  text('foreground', 'card', 12.92),
  text('foreground', 'muted', 11.43),
  text('muted-foreground', 'background', 6.23),
  text('muted-foreground', 'card', 6.55),
  text('muted-foreground', 'muted', 5.8),
  text('primary-foreground', 'primary', 5.06),
  text('primary-foreground', 'primary-strong', 7.29),
  text('primary-strong', 'background', 6.93),
  text('primary-strong', 'card', 7.29),
  text('primary-strong', 'primary-soft', 6.07),
  text('foreground', 'primary-soft', 10.75),
  text('foreground', 'accent-soft', 10.8),
  text('primary-strong', 'accent-soft', 6.1),
  text('destructive', 'card', 6.54),
  text('destructive', 'background', 6.21),
  text('destructive', 'destructive-soft', 5.66),
  text('primary-foreground', 'destructive', 6.54),
  text('success', 'card', 6.35),
  text('success', 'success-soft', 5.45),
  text('warning', 'card', 6.33),
  text('warning', 'warning-soft', 5.61),
  graphic('input', 'card', 3.47),
  graphic('input', 'background', 3.3),
  graphic('ring', 'card', 5.06),
  graphic('ring', 'background', 4.81),
  graphic('ring', 'primary-soft', 4.22),
  // Pastel alone carries no information (tokens.md): reported, never asserted.
  { foreground: 'primary-soft', background: 'card', documented: 1.2, threshold: null },
];

export const pairName = (pair: ContrastPair): string => `${pair.foreground} / ${pair.background}`;
