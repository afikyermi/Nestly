import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Abstract, in-house illustrations in the palette: a nest, leaves, soft shapes. No baby, no
// pregnancy, no family (direction.md, images). Decorative, so always aria-hidden. Every colour
// is a token class (fill-*, stroke-*), never a hex.
interface IllustrationProps {
  className?: string | undefined;
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
      <path d="M60 40c-2-10-10-16-20-16 0 10 8 16 20 16Z" className="fill-success-soft stroke-success" strokeWidth={2} strokeLinejoin="round" />
      <path d="M60 40c2-10 10-16 20-16 0 10-8 16-20 16Z" className="fill-success-soft stroke-success" strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}
