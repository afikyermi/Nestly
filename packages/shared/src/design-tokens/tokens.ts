// The single source of the design values (docs/design/tokens.md is the spec).
// tools/build-design-tokens.js reads this file directly with Node's type
// stripping, so it holds plain data only: no imports, no enums, no runtime code.
// Dark mode is not defined (decision of 11.10.2026): there is one set of values.

export const colors = {
  background: '#FFF8F2',
  foreground: '#3B2F2A',
  card: '#FFFFFF',
  'card-foreground': '#3B2F2A',
  popover: '#FFFFFF',
  'popover-foreground': '#3B2F2A',
  primary: '#B5502C',
  'primary-foreground': '#FFFFFF',
  'primary-strong': '#8F3E21',
  'primary-soft': '#FDE6D8',
  secondary: '#FDE6D8',
  'secondary-foreground': '#8F3E21',
  muted: '#FBEFE6',
  'muted-foreground': '#6B5A51',
  accent: '#FBEFE6',
  'accent-soft': '#E3EEDF',
  destructive: '#B3261E',
  'destructive-soft': '#FCEBE8',
  success: '#2E6B45',
  'success-soft': '#E6F0E9',
  warning: '#8A5300',
  'warning-soft': '#FBF0DC',
  border: '#F1E6DD',
  input: '#9C8579',
  ring: '#B5502C',
  badge: '#FDE6D8',
  'badge-foreground': '#8F3E21',
} as const;

// `border` is a decorative divider and never identifies a control; `input` is
// the border of every field (3:1, see contrast-pairs.ts).
export const colorRoles = {
  border: 'decorative',
  input: 'field-border',
} as const;

export const fontFamily = {
  sans: '"Rubik Variable", system-ui, sans-serif',
} as const;

// Weights in the UI: 500 for actions, 600 for headings and the active state, no 700 or more.
export const fontWeights = { normal: 400, medium: 500, semibold: 600 } as const;

// Sizes and line heights in px; the generator converts to rem. Minimum 13px.
export const typeStyles = {
  display: { size: 34, line: 42, weight: 600 },
  h1: { size: 28, line: 36, weight: 600 },
  h2: { size: 24, line: 32, weight: 600 },
  h3: { size: 20, line: 28, weight: 600 },
  lead: { size: 19, line: 30, weight: 400 },
  body: { size: 17, line: 28, weight: 400 },
  label: { size: 15, line: 22, weight: 600 },
  small: { size: 15, line: 24, weight: 400 },
  caption: { size: 13, line: 20, weight: 400 },
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

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 } as const;

export const shadows = {
  card: '0 1px 2px rgb(59 47 42 / .05), 0 4px 16px rgb(59 47 42 / .07)',
  raised: '0 8px 32px rgb(59 47 42 / .14)',
  bar: '0 1px 0 #F1E6DD, 0 2px 10px rgb(59 47 42 / .04)',
} as const;

export const motion = {
  duration: { fast: 150, base: 200, slow: 300 },
  easing: 'cubic-bezier(.2, 0, 0, 1)',
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
