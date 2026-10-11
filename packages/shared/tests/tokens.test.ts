import { describe, expect, it } from 'vitest';
import {
  breakpoints,
  colorRoles,
  colors,
  fontFamily,
  fontWeights,
  motion,
  radius,
  shadows,
  spacingBase,
  spacingRhythm,
  typeStyles,
  zIndex,
} from '../src/design-tokens/index.js';
import {
  documentedColors,
  documentedEasing,
  documentedShadows,
  documentedSpacing,
  numbersByName,
  typographyRows,
} from './tokens-doc.js';

const rec = (o: object): Record<string, unknown> => Object.fromEntries(Object.entries(o));
const sorted = (o: object): string[] => Object.keys(o).sort();
const noSpaces = (s: string): string => s.replaceAll(/\s+/g, '');

describe('token source matches docs/design/tokens.md exactly', () => {
  it('[UI-7] colour: every documented name has the documented value, and the source has no extras', () => {
    const documented = documentedColors();
    expect(Object.keys(documented)).toHaveLength(27);
    expect(sorted(colors)).toEqual(sorted(documented));
    for (const [name, value] of Object.entries(documented)) {
      expect(String(rec(colors)[name]).toUpperCase(), name).toBe(value);
    }
  });

  it('[UI-7] colour values are 6-digit hex with no alpha', () => {
    for (const value of Object.values(colors)) expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('[UI-7] border is marked decorative and input is the field border', () => {
    expect(colorRoles.border).toBe('decorative');
    expect(colorRoles.input).toBe('field-border');
    expect(Object.keys(colorRoles)).not.toContain('ring');
  });

  it('[UI-7] the nine type styles: size, line height and weight, no extras', () => {
    const documented = typographyRows();
    expect(Object.keys(documented)).toHaveLength(9);
    expect(sorted(typeStyles)).toEqual(sorted(documented));
    for (const [name, style] of Object.entries(documented)) {
      expect(rec(typeStyles)[name], name).toEqual(style);
    }
  });

  it('[UI-7] no type style is smaller than 13px or heavier than 600', () => {
    for (const s of Object.values(typeStyles)) {
      expect(s.size).toBeGreaterThanOrEqual(13);
      expect(s.weight).toBeLessThan(700);
    }
  });

  it('[UI-7] font stack: Rubik first, ending system-ui, sans-serif', () => {
    expect(fontFamily.sans).toMatch(/^"?Rubik/);
    expect(fontFamily.sans).toMatch(/system-ui,\s*sans-serif$/);
  });

  it('[UI-7] font weights: normal 400, medium 500, semibold 600, no extras', () => {
    expect(fontWeights).toEqual({ normal: 400, medium: 500, semibold: 600 });
  });

  it('[UI-7] spacing: 4px base and the documented rhythm values, no extras', () => {
    const doc = documentedSpacing();
    expect(spacingBase).toBe(doc.base);
    expect(Object.values(spacingRhythm).sort((a, b) => a - b)).toEqual([...doc.rhythm].sort((a, b) => a - b));
  });

  it('[UI-7] radius: sm 8, md 12, lg 16, xl 24, and full, no extras', () => {
    const doc = numbersByName('ריווח, פינות וצללים', 'פינות');
    expect(doc).toEqual({ sm: 8, md: 12, lg: 16, xl: 24 });
    expect(sorted(radius)).toEqual([...sorted(doc), 'full'].sort());
    for (const [k, v] of Object.entries(doc)) expect(rec(radius)[k], k).toBe(v);
    expect(radius.full).toBeGreaterThanOrEqual(999);
  });

  it('[UI-7] three shadows: card, raised, bar, with the documented values', () => {
    const doc = documentedShadows();
    expect(sorted(doc)).toEqual(['bar', 'card', 'raised']);
    expect(sorted(shadows)).toEqual(sorted(doc));
    for (const [k, v] of Object.entries(doc)) {
      expect(noSpaces(String(rec(shadows)[k])).toLowerCase(), k).toBe(noSpaces(v).toLowerCase());
    }
  });

  it('[UI-7] motion: fast 150, base 200, slow 300 ms and the documented easing, no extras', () => {
    const doc = numbersByName('מצבים, מגע ותנועה', 'תנועה', 'ms');
    expect(doc).toEqual({ fast: 150, base: 200, slow: 300 });
    expect(motion.duration).toEqual(doc);
    expect(noSpaces(motion.easing)).toBe(noSpaces(documentedEasing()));
  });

  it('[UI-7] z-index: base 0 to dialog 60, no extras', () => {
    const doc = numbersByName('מצבים, מגע ותנועה', 'z-index');
    expect(Object.keys(doc)).toHaveLength(7);
    expect(zIndex).toEqual(doc);
  });

  it('[UI-7] breakpoints: sm 640, md 768, lg 1024, no extras', () => {
    const doc = numbersByName('מצבים, מגע ותנועה', 'breakpoints');
    expect(doc).toEqual({ sm: 640, md: 768, lg: 1024 });
    expect(breakpoints).toEqual(doc);
  });

  it('[UI-7] the source defines no dark-mode values', () => {
    expect(sorted(colors).some((n) => n.includes('dark'))).toBe(false);
  });
});
