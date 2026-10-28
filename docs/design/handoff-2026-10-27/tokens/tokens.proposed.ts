// PROPOSED replacement for packages/shared/src/design-tokens/tokens.ts — Nestly redesign (Claude Design, round 7, 27.10.2026).
// Same names and shape as the current file, so tools/build-design-tokens.js and every component keep working;
// only values change, plus a few additions marked "+". Dark mode is still not defined.

export const colors = {
  background: '#FFFFFF', // white page (was cream)
  foreground: '#1D1B1D',
  card: '#FFFFFF',
  'card-foreground': '#1D1B1D',
  popover: '#FFFFFF',
  'popover-foreground': '#1D1B1D',
  primary: '#805B75', // muted plum — top bar, primary button, selected mark
  'primary-foreground': '#FFFFFF',
  'primary-strong': '#6A4B61', // links, text/icons on pastel, primary hover
  'primary-soft': '#F2E8EF', // plum pastel: counters, selected chip fill, my chat bubble
  secondary: '#F2F0F1', // neutral soft button (no plum fill)
  'secondary-foreground': '#1D1B1D',
  muted: '#F2F0F1',
  'muted-foreground': '#6B6168',
  accent: '#E9E7E8', // hover on muted surfaces
  'accent-soft': '#F5ECDD', // warm sand pastel: child journey, highlights (replaces sage)
  destructive: '#B3261E',
  'destructive-soft': '#FCEEEC',
  success: '#2E6B45',
  'success-soft': '#E6F0E9',
  warning: '#8A5300',
  'warning-soft': '#FBF0DC',
  border: '#E9E7E8', // decorative hairline between feed items and inside cards
  input: '#8B7E87', // field / checkbox / chip border, 3.87:1
  ring: '#805B75',
  badge: '#F2E8EF',
  'badge-foreground': '#543B4C',
  'brand-bar': '#805B75', // + top bar background (same value as primary, separate role)
  'brand-subtle': '#F9F4F7', // + pregnancy card, "only you see this" areas
  warm: '#F5ECDD', // + child card, sponsored zone
  'warm-foreground': '#6E5126', // + text on warm
  egg: '#DEC093', // + the egg in the mark only — never text
  divider: '#E9E7E8', // + hairline between feed items on phone
} as const;

export const colorRoles = {
  border: 'decorative',
  input: 'field-border',
  divider: 'decorative',
  egg: 'brand-graphic-only',
} as const;

// Assistant (Hebrew + Latin) via @fontsource-variable/assistant (weights 200–800).
// Fredoka is used ONLY inside the logo SVG (outlined paths in brand/), never loaded as a web font.
export const fontFamily = {
  sans: '"Assistant Variable", system-ui, sans-serif',
} as const;

// Changed: Assistant is lighter than Rubik at the same weight, so headings use 700/800.
export const fontWeights = { normal: 400, medium: 500, semibold: 600, bold: 700, heavy: 800 } as const;

// px; the generator converts to rem. Minimum stays 13px.
export const typeStyles = {
  display: { size: 30, line: 36, weight: 800 },
  h1: { size: 24, line: 30, weight: 800 },
  h2: { size: 19, line: 25, weight: 700 },
  h3: { size: 17, line: 22, weight: 700 },  // names in posts and comments
  lead: { size: 19, line: 27, weight: 500 }, // short posts (under ~120 chars)
  body: { size: 17, line: 26, weight: 400 },
  label: { size: 15, line: 20, weight: 600 },
  small: { size: 15, line: 22, weight: 400 },
  caption: { size: 13, line: 18, weight: 500 },
} as const;

export const spacingBase = 4;
export const spacingRhythm = {
  'card-padding': 16,
  'card-padding-lg': 20,
  'card-gap': 0,       // phone: feed items are full-bleed, separated by a 1px divider (no grey gaps)
  'card-gap-lg': 16,   // + desktop: cards with a 1px outline, 16 between
  'section-gap': 24,
  'section-gap-lg': 32,
  'screen-margin': 16,
} as const;

// Fields and chips are pills; cards are square on phone (full-bleed) and 14 on desktop.
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, '2xl': 28, full: 9999 } as const;

export const shadows = {
  card: '0 0 0 1px #D8D4D7',                         // desktop card outline (no soft drop shadow on white)
  raised: '0 6px 20px -8px rgb(63 44 57 / .25)',      // menu, popover, "3 new posts" pill
  sheet: '0 -10px 40px -10px rgb(63 44 57 / .35)',    // + bottom sheet
  bar: '0 1px 0 #E9E7E8',                             // bottom tab bar top edge
} as const;

// Kept from the current system (close to the design's values); + ripple for the like animation.
export const motion = {
  duration: { fast: 150, base: 200, slow: 300, ripple: 600 },
  easing: 'cubic-bezier(.2, .8, .2, 1)',
} as const;

export const zIndex = { base: 0, sticky: 10, scrolltop: 20, drawer: 30, popover: 40, toast: 50, dialog: 60 } as const;
export const breakpoints = { sm: 640, md: 768, lg: 1024 } as const;

// + component sizes from the design (px)
export const sizes = {
  'topbar-phone': 48, 'topbar-desktop': 64, 'tabbar': 60, 'hit': 44, 'avatar-s': 32, 'avatar-m': 40, 'avatar-l': 56,
} as const;
