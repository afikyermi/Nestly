// The single source of the design values (docs/design/tokens.md is the spec).
// tools/build-design-tokens.js reads this file directly with Node's type
// stripping, so it holds plain data only: no imports, no enums, no runtime code.
// Dark mode is not defined (decision of 11.10.2026): there is one set of values.
// The values are the "plum on white" redesign (Claude Design round 7, Afik 27.10.2026; docs/design/handoff-2026-10-27/).

export const colors = {
  background: '#FFFFFF',
  foreground: '#1D1B1D',
  card: '#FFFFFF',
  'card-foreground': '#1D1B1D',
  popover: '#FFFFFF',
  'popover-foreground': '#1D1B1D',
  // Muted plum: the top bar, the primary button and the selected mark only, never a large surface.
  primary: '#805B75',
  'primary-foreground': '#FFFFFF',
  // Links, text and icons on pastel, the primary hover.
  'primary-strong': '#6A4B61',
  // Plum pastel: the like counter, my chat message.
  'primary-soft': '#F2E8EF',
  // A secondary button is neutral: no plum fill.
  secondary: '#F2F0F1',
  'secondary-foreground': '#1D1B1D',
  muted: '#F2F0F1',
  'muted-foreground': '#6B6168',
  accent: '#E9E7E8',
  // Warm sand pastel (child journey, highlights).
  'accent-soft': '#F5ECDD',
  destructive: '#B3261E',
  'destructive-soft': '#FCEEEC',
  success: '#2E6B45',
  'success-soft': '#E6F0E9',
  warning: '#8A5300',
  'warning-soft': '#FBF0DC',
  border: '#E9E7E8',
  input: '#8B7E87',
  ring: '#805B75',
  badge: '#F2E8EF',
  'badge-foreground': '#543B4C',
  // The top bar's background: the same value as primary, a role of its own.
  'brand-bar': '#805B75',
  // The pregnancy card, a selected chip, "only you see this" areas.
  'brand-subtle': '#F9F4F7',
  // The child card, the sponsored area, a promoted listing.
  warm: '#F5ECDD',
  'warm-foreground': '#6E5126',
  // The egg in the mark only: never text.
  egg: '#DEC093',
  // The hairline between feed items.
  divider: '#E9E7E8',
  // Initials avatars: one of six pastels, picked from the person's id; text is foreground.
  'avatar-1': '#EBD9BC',
  'avatar-2': '#F3D5C5',
  'avatar-3': '#D3E3EE',
  'avatar-4': '#D6E6D1',
  'avatar-5': '#E3D4DE',
  'avatar-6': '#E2DDEF',
} as const;

// `border` and `divider` are decorative and never identify a control; `input` is
// the border of every field (3:1, see contrast-pairs.ts). `egg` is graphic only.
export const colorRoles = {
  border: 'decorative',
  divider: 'decorative',
  input: 'field-border',
  egg: 'brand-graphic-only',
} as const;

// Assistant (Hebrew and Latin), bundled from @fontsource-variable/assistant. The wordmark's
// Fredoka exists only as outlined paths inside the logo SVG, never as a web font.
export const fontFamily = {
  sans: '"Assistant Variable", system-ui, sans-serif',
} as const;

// Assistant is lighter than Rubik at the same weight: headings and names use 700 and 800.
export const fontWeights = { normal: 400, medium: 500, semibold: 600, bold: 700, heavy: 800 } as const;

// Sizes and line heights in px; the generator converts to rem. Minimum 13px.
export const typeStyles = {
  display: { size: 30, line: 36, weight: 800 },
  h1: { size: 24, line: 30, weight: 800 },
  h2: { size: 19, line: 25, weight: 700 },
  h3: { size: 17, line: 22, weight: 700 },
  lead: { size: 19, line: 27, weight: 500 },
  body: { size: 17, line: 26, weight: 400 },
  label: { size: 15, line: 20, weight: 600 },
  small: { size: 15, line: 22, weight: 400 },
  caption: { size: 13, line: 18, weight: 500 },
} as const;

// Tailwind scale on a 4px base. The named values are the layout rhythm.
export const spacingBase = 4;
export const spacingRhythm = {
  'card-padding': 16,
  'card-padding-lg': 20,
  'card-gap': 12,
  'section-gap': 24,
  'section-gap-lg': 32,
  'screen-margin': 16,
} as const;

// Fields are 10, cards 14 (desktop), sheets 20.
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, full: 9999 } as const;

// White page: a card is a 1px outline, not a soft drop shadow.
export const shadows = {
  card: '0 0 0 1px #D8D4D7',
  raised: '0 6px 20px -8px rgb(63 44 57 / .25)',
  sheet: '0 -10px 40px -10px rgb(63 44 57 / .35)',
  bar: '0 1px 0 #E9E7E8',
} as const;

export const motion = {
  duration: { fast: 150, base: 200, slow: 300, ripple: 600 },
  easing: 'cubic-bezier(.2, .8, .2, 1)',
} as const;

export const zIndex = {
  base: 0,
  sticky: 10,
  scrolltop: 20,
  drawer: 30,
  popover: 40,
  toast: 50,
  dialog: 60,
} as const;

export const breakpoints = { sm: 640, md: 768, lg: 1024 } as const;
