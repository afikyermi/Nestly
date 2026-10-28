import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// The six illustrations of the redesign (27.10.2026, docs/design/handoff-2026-10-27/illustrations): ripple circles, one shape in sand and
// one ink line. No faces, no babies, no belly (direction.md, images). Only for empty states, errors and onboarding. Decorative, so always
// aria-hidden. Every colour is a token class (fill-*, stroke-*), never a hex.
interface IllustrationProps {
  /** Placement only (margin, alignment, max width). */
  className?: string | undefined;
  /** Decorative and always aria-hidden: there is no name to give. */
  'aria-label'?: never;
}

/** All six share one 168×120 drawing area; `width` is the drawn width in px (the height follows). */
function Svg({ width, className, children }: IllustrationProps & { width: number; children: ReactNode }) {
  return (
    <svg
      width={width}
      height={Math.round((width * 120) / 168)}
      viewBox="0 0 168 120"
      aria-hidden="true"
      focusable="false"
      className={cn('h-auto max-w-full', className)}
    >
      {children}
    </svg>
  );
}

// The ripples every illustration stands on: a pale plum disc and two thin rings.
function Ripples() {
  return (
    <>
      <circle cx="84" cy="70" r="56" className="fill-brand-subtle" />
      <circle cx="84" cy="70" r="42" strokeWidth={1.5} fill="none" className="stroke-primary opacity-25" />
      <circle cx="84" cy="70" r="28" strokeWidth={1.5} fill="none" className="stroke-primary opacity-25" />
    </>
  );
}

// Welcome and onboarding: the nest of waves holding its egg.
export function WelcomeIllustration({ className }: IllustrationProps) {
  return (
    <Svg width={220} className={className}>
      <Ripples />
      <ellipse cx="84" cy="48" rx="14" ry="18" transform="rotate(-12 84 48)" className="fill-egg" />
      <path d="M50 62h68c0 19-15.2 33-34 33S50 81 50 62z" className="fill-primary" />
      <path d="M61 74c7.6-4.5 15.2-4.5 23 0s15.4 4.5 23 0" strokeWidth={3} strokeLinecap="round" fill="none" className="stroke-card" />
    </Svg>
  );
}

// The registration steps: the same nest, smaller.
export function RegistrationIllustration({ className }: IllustrationProps) {
  return (
    <Svg width={120} className={className}>
      <Ripples />
      <ellipse cx="84" cy="48" rx="14" ry="18" transform="rotate(-12 84 48)" className="fill-egg" />
      <path d="M50 62h68c0 19-15.2 33-34 33S50 81 50 62z" className="fill-primary" />
      <path d="M61 74c7.6-4.5 15.2-4.5 23 0s15.4 4.5 23 0" strokeWidth={3} strokeLinecap="round" fill="none" className="stroke-card" />
    </Svg>
  );
}

// An empty feed: the nest with a few sand strokes above it.
export function EmptyFeedIllustration({ className }: IllustrationProps) {
  return (
    <Svg width={120} className={className}>
      <Ripples />
      <path d="M52 68h64c0 18-14.3 31-32 31S52 86 52 68z" className="fill-primary" />
      <path d="M62 79c7-4 14-4 22 0s15 4 22 0" strokeWidth={3} strokeLinecap="round" fill="none" className="stroke-card" />
      <path d="M96 38l4-8M104 46l8-3M88 34l0-9" strokeWidth={3} strokeLinecap="round" fill="none" className="stroke-egg" />
    </Svg>
  );
}

// No search results: a magnifier over a wave.
export function NoResultsIllustration({ className }: IllustrationProps) {
  return (
    <Svg width={120} className={className}>
      <Ripples />
      <path d="M34 92c10-6 20-6 30 0s20 6 30 0 20-6 30 0" strokeWidth={3} strokeLinecap="round" fill="none" className="stroke-primary opacity-40" />
      <circle cx="80" cy="58" r="20" strokeWidth={3} className="fill-card stroke-foreground" />
      <path d="M95 73l14 14" strokeWidth={4} strokeLinecap="round" fill="none" className="stroke-foreground" />
      <circle cx="74" cy="53" r="5" className="fill-egg" />
    </Svg>
  );
}

// A screen that failed to load: two broken waves and a sand circle.
export function ErrorIllustration({ className }: IllustrationProps) {
  return (
    <Svg width={120} className={className}>
      <Ripples />
      <path d="M30 80c9-6 18-6 27 0s18 6 22 3" strokeWidth={3.5} strokeLinecap="round" fill="none" className="stroke-primary" />
      <path d="M92 77c4-3 11-3 18 1s14 5 23 0" strokeWidth={3.5} strokeLinecap="round" fill="none" className="stroke-primary" />
      <path d="M84 50v14M84 72v.5" strokeWidth={4} strokeLinecap="round" fill="none" className="stroke-foreground" />
      <circle cx="84" cy="62" r="22" strokeWidth={3} fill="none" className="stroke-egg" />
    </Svg>
  );
}

// No conversations yet: two bubbles.
export function NoChatsIllustration({ className }: IllustrationProps) {
  return (
    <Svg width={120} className={className}>
      <Ripples />
      <rect x="44" y="40" width="58" height="38" rx="14" className="fill-primary" />
      <path d="M58 78l-6 10 14-10z" className="fill-primary" />
      <rect x="72" y="58" width="56" height="34" rx="14" strokeWidth={2.5} className="fill-card stroke-foreground" />
      <circle cx="90" cy="75" r="3" className="fill-foreground" />
      <circle cx="100" cy="75" r="3" className="fill-foreground" />
      <circle cx="110" cy="75" r="3" className="fill-foreground" />
    </Svg>
  );
}

// No reviews yet: a star with a sand centre.
export function NoReviewsIllustration({ className }: IllustrationProps) {
  return (
    <Svg width={120} className={className}>
      <Ripples />
      <path d="M84 40l9 18 20 3-14.5 14 3.4 20L84 85.5 66.1 95l3.4-20L55 61l20-3z" strokeWidth={2.5} strokeLinejoin="round" className="fill-card stroke-foreground" />
      <circle cx="84" cy="68" r="6" className="fill-egg" />
    </Svg>
  );
}
