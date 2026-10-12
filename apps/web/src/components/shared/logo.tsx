import { cn } from '@/lib/cn';
import { LogoWordmark, type LogoSize } from './logo-wordmark';

export interface LogoProps {
  size?: LogoSize;
  /** A link when set (to the home page), a static mark otherwise. */
  href?: string;
  className?: string;
  /** The name is fixed ("Nestly"); there is no prop for it. */
  'aria-label'?: never;
}

const base = 'inline-flex items-center gap-1 px-1 text-primary-strong no-underline';

// The accessible name is fixed: "Nestly". The wordmark inside is aria-hidden so the name is
// not read twice.
export function Logo({ size = 'default', href, className }: LogoProps) {
  const content = <LogoWordmark size={size} />;
  if (href !== undefined) {
    return (
      <a href={href} aria-label="Nestly" className={cn(base, 'min-h-11 min-w-11', size === 'big' && 'gap-1.5', className)}>
        {content}
      </a>
    );
  }
  return (
    <span role="img" aria-label="Nestly" className={cn(base, size === 'big' && 'gap-1.5', className)}>
      {content}
    </span>
  );
}
