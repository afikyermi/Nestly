import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Abstract, in-house illustrations in the palette: a nest, leaves, soft shapes. No baby, no
// pregnancy, no family (direction.md, images). Decorative, so always aria-hidden. Every colour
// is a token class (fill-*, stroke-*), never a hex.
interface IllustrationProps {
  /** Placement only (margin, alignment, max width). */
  className?: string | undefined;
  /** Decorative and always aria-hidden: there is no name to give. */
  'aria-label'?: never;
}

function Svg({ width, height, className, children }: IllustrationProps & { width: number; height: number; children: ReactNode }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      className={cn('h-auto max-w-full', className)}
    >
      {children}
    </svg>
  );
}

// The nest of the welcome illustration.
function Nest() {
  return (
    <>
      <path d="M46 100h128" className="stroke-primary-strong" strokeWidth={3} strokeLinecap="round" fill="none" />
      <path
        d="M48 100c0 26 28 42 62 42s62-16 62-42"
        className="fill-primary-soft stroke-primary-strong"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path
        d="M62 114c16 6 30 8 48 8s34-3 48-9M70 128c12 4 26 6 40 6s28-2 40-7"
        className="stroke-primary opacity-55"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

export function WelcomeIllustration({ className }: IllustrationProps) {
  return (
    <Svg width={220} height={170} className={className}>
      <circle cx={110} cy={88} r={78} className="fill-accent-soft" />
      <path d="M40 60c18-22 44-30 66-26" className="stroke-primary opacity-35" strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d="M172 52c-10-10-24-14-38-12" className="stroke-primary opacity-35" strokeWidth={2} strokeLinecap="round" fill="none" />
      <ellipse cx={96} cy={86} rx={17} ry={22} className="fill-card stroke-primary-strong" strokeWidth={2.5} />
      <ellipse cx={126} cy={90} rx={15} ry={19} className="fill-primary-soft stroke-primary-strong" strokeWidth={2.5} />
      <Nest />
      <path d="M170 128c10-6 16-16 16-26M178 112c6 2 10 0 12-4" className="stroke-success" strokeWidth={2.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function RegistrationIllustration({ className }: IllustrationProps) {
  return (
    <Svg width={120} height={84} className={className}>
      <circle cx={60} cy={44} r={38} className="fill-accent-soft" />
      <path d="M24 50h72" className="stroke-primary-strong" strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <path d="M26 50c0 14 15 22 34 22s34-8 34-22" className="fill-primary-soft stroke-primary-strong" strokeWidth={2.5} />
      <path
        d="M60 22c-4-6-14-5-14 3 0 6 8 11 14 15 6-4 14-9 14-15 0-8-10-9-14-3Z"
        className="fill-primary opacity-85"
      />
    </Svg>
  );
}

// The empty feed: a small, quiet nest with two leaves. Nothing figurative.
export function EmptyFeedIllustration({ className }: IllustrationProps) {
  return (
    <Svg width={96} height={72} className={className}>
      <circle cx={48} cy={38} r={32} className="fill-accent-soft" />
      <path d="M22 42h52" className="stroke-primary-strong" strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <path d="M24 42c0 12 11 18 24 18s24-6 24-18" className="fill-primary-soft stroke-primary-strong" strokeWidth={2.5} />
      <path d="M62 30c6-2 10-8 10-14M66 22c4 0 6-1 8-4" className="stroke-success" strokeWidth={2.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
