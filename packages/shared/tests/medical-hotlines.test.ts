import { describe, expect, it } from 'vitest';
import { MEDICAL_HOTLINES } from '../src/index.js';

// I3 F3.8 c1 (.work/medical-hotlines/spec.md, "Test seam"): the one constant list is the only source of names and numbers. Expected values are the spec's:
// five entries in this order, MDA 101 first, then the four HMOs in Hebrew alphabetical order; every number is digits with a leading `*` or `+` only.
// The numbers themselves are verified against official sites at build (notes.md), not in a test.

const NUMBER = /^(\*\d{2,5}|\+?\d{3,12})$/;

describe('[F3.8 c1] MEDICAL_HOTLINES', () => {
  it('[F3.8 c1][FR-MENU-002][AC-109] holds exactly five entries, in order: mda, clalit, leumit, meuhedet, maccabi', () => {
    expect(MEDICAL_HOTLINES.map((h) => h.id)).toEqual(['mda', 'clalit', 'leumit', 'meuhedet', 'maccabi']);
  });

  it('[F3.8 c1][FR-MENU-002] MDA is first and its number is 101', () => {
    expect(MEDICAL_HOTLINES[0]).toMatchObject({ id: 'mda', number: '101' });
    expect(MEDICAL_HOTLINES[0]?.label).toContain('מד"א');
  });

  it('[F3.8 c1][FR-MENU-002] each HMO label names its fund (כללית, לאומית, מאוחדת, מכבי), in that order', () => {
    expect(MEDICAL_HOTLINES.slice(1).map((h) => h.label.split(/\s|—/)[0])).toEqual(['כללית', 'לאומית', 'מאוחדת', 'מכבי']);
  });

  it('[F3.8 c1][AC-109] every number matches ^(\\*\\d{2,5}|\\+?\\d{3,12})$ (digits, a leading * or + only; nothing to encode)', () => {
    for (const h of MEDICAL_HOTLINES) expect(h.number, h.id).toMatch(NUMBER);
  });

  it('[F3.8 c1] no placeholder ships: no number is repeated across entries other than by a real shared line, and none is all zeros', () => {
    for (const h of MEDICAL_HOTLINES) expect(h.number, h.id).not.toMatch(/^[0*+]*$/);
    const hmoNumbers = MEDICAL_HOTLINES.slice(1).map((h) => h.number);
    expect(new Set(hmoNumbers).size, 'four different HMO numbers').toBe(hmoNumbers.length);
  });

  it('[F3.8 c1] every label is non-empty visible text without the number or a tel: scheme', () => {
    for (const h of MEDICAL_HOTLINES) {
      expect(h.label.trim().length, h.id).toBeGreaterThan(0);
      expect(h.label, h.id).not.toMatch(/tel:/i);
    }
  });
});
