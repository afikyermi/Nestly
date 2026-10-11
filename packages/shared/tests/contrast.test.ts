import { describe, expect, it } from 'vitest';
import { colors } from '../src/design-tokens/index.js';
import { documentedPairs, type DocumentedPair } from './tokens-doc.js';

// An independent WCAG 2.x implementation: the test must not lean on the code under test.
const lin = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (fg: string, bg: string): number => {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const pairs = documentedPairs();
const asserted = pairs.filter((p): p is DocumentedPair & { threshold: number } => p.threshold !== null);
const name = (p: DocumentedPair): string => `${p.foreground} / ${p.background}`;

const colorOf = (palette: Readonly<Record<string, string>>, token: string): string => {
  const value = palette[token];
  if (value === undefined) throw new Error(`token ${token} is not in the source`);
  return value;
};

// Every asserted pair that is below its threshold, or further than 0.01 from tokens.md.
const problems = (palette: Readonly<Record<string, string>>): string[] =>
  asserted.flatMap((p) => {
    const r = ratio(colorOf(palette, p.foreground), colorOf(palette, p.background));
    const out: string[] = [];
    if (r < p.threshold) out.push(`${name(p)} below ${p.threshold}`);
    if (Math.abs(r - p.ratio) > 0.01) out.push(`${name(p)} differs from tokens.md`);
    return out;
  });

describe('contrast, read from docs/design/tokens.md', () => {
  it('[UI-3] tokens.md lists 27 asserted pairs and one informational row', () => {
    expect(asserted).toHaveLength(27);
    expect(pairs).toHaveLength(28);
  });

  describe.each(asserted.map((p) => [name(p), p] as const))('[UI-3] %s', (_n, p) => {
    const computed = ratio(colorOf(colors, p.foreground), colorOf(colors, p.background));
    it(`[UI-3] is at or above ${p.threshold}`, () => {
      expect(computed).toBeGreaterThanOrEqual(p.threshold);
    });
    it(`[UI-3] is within 0.01 of the documented ${p.ratio}`, () => {
      expect(Math.abs(computed - p.ratio)).toBeLessThanOrEqual(0.01);
    });
  });

  it('[UI-3] the thresholds are 4.5 for text and 3 for border, icon and ring pairs only', () => {
    for (const p of asserted) expect([4.5, 3]).toContain(p.threshold);
    const three = asserted.filter((p) => p.threshold === 3).map(name);
    expect(three.every((n) => n.startsWith('input /') || n.startsWith('ring /'))).toBe(true);
    expect(three).toHaveLength(5);
  });

  it('[UI-3] the real palette has no problems', () => {
    expect(problems(colors)).toEqual([]);
  });

  it('[UI-4] negative proof: primary = #D9704A fails and names primary-foreground / primary', () => {
    const broken = { ...colors, primary: '#D9704A' };
    const found = problems(broken);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((f) => f.startsWith('primary-foreground / primary '))).toBe(true);
    expect(found.some((f) => f === 'primary-foreground / primary below 4.5')).toBe(true);
  });

  it('[UI-4] the negative copy does not change the real tokens', () => {
    expect(colors.primary).toBe('#B5502C');
  });

  it('[UI-5] the informational row primary-soft / card (1.20) exists and is not asserted against a threshold', () => {
    const info = pairs.find((p) => name(p) === 'primary-soft / card');
    expect(info?.threshold).toBeNull();
    expect(info?.ratio).toBe(1.2);
    expect(asserted.map(name)).not.toContain('primary-soft / card');
    // Its real ratio is far below 3 and 4.5; a test that asserted it would fail.
    expect(ratio(colors['primary-soft'], colors.card)).toBeLessThan(3);
    expect(problems(colors)).toEqual([]);
  });
});
