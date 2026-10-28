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
  text('foreground', 'background', 17.12),
  text('foreground', 'card', 17.12),
  text('foreground', 'muted', 15.09),
  text('muted-foreground', 'background', 5.94),
  text('muted-foreground', 'card', 5.94),
  text('muted-foreground', 'muted', 5.24),
  text('primary-foreground', 'primary', 5.72),
  text('primary-foreground', 'primary-strong', 7.52),
  text('primary-strong', 'background', 7.52),
  text('primary-strong', 'card', 7.52),
  text('primary-strong', 'primary-soft', 6.29),
  text('foreground', 'primary-soft', 14.32),
  text('foreground', 'accent-soft', 14.61),
  text('primary-strong', 'accent-soft', 6.42),
  text('destructive', 'card', 6.54),
  text('destructive', 'background', 6.54),
  text('destructive', 'destructive-soft', 5.78),
  text('primary-foreground', 'destructive', 6.54),
  text('success', 'card', 6.35),
  text('success', 'success-soft', 5.45),
  text('warning', 'card', 6.33),
  text('warning', 'warning-soft', 5.61),
  graphic('input', 'card', 3.87),
  graphic('input', 'background', 3.87),
  graphic('ring', 'card', 5.72),
  graphic('ring', 'background', 5.72),
  graphic('ring', 'primary-soft', 4.78),
  // Pastel alone carries no information (tokens.md): reported, never asserted.
  { foreground: 'primary-soft', background: 'card', documented: 1.2, threshold: null },
  text('badge-foreground', 'badge', 8.34),
  text('primary-foreground', 'brand-bar', 5.72),
  text('foreground', 'brand-subtle', 15.74),
  text('primary-strong', 'brand-subtle', 6.92),
  text('warm-foreground', 'warm', 6.25),
  text('foreground', 'secondary', 15.09),
  text('muted-foreground', 'brand-subtle', 5.46),
  text('foreground', 'avatar-1', 12.38),
  text('foreground', 'avatar-2', 12.34),
  text('foreground', 'avatar-3', 13.04),
  text('foreground', 'avatar-4', 13.12),
  text('foreground', 'avatar-5', 12.01),
  text('foreground', 'avatar-6', 12.9),
];

export const pairName = (pair: ContrastPair): string => `${pair.foreground} / ${pair.background}`;
