import { cn } from '@/lib/cn';
import { LogoWordmark, type LogoSize, type LogoTone } from './logo-wordmark';

export interface LogoProps {
  size?: LogoSize;
  /** 'onBrand' on the plum top bar; 'plain' (default) on a light surface. */
  tone?: LogoTone;
  /** A link when set (to the home page), a static mark otherwise. */
  href?: string;
  className?: string;
  /** The name is fixed ("Nestly"); there is no prop for it. */
  'aria-label'?: never;
}

const base = 'inline-flex items-center px-1 no-underline';

// The accessible name is fixed: "Nestly". The wordmark inside is aria-hidden so the name is
// not read twice.
export function Logo({ size = 'default', tone = 'plain', href, className }: LogoProps) {
  const content = <LogoWordmark size={size} tone={tone} />;
  if (href !== undefined) {
    return (
      <a href={href} aria-label="Nestly" className={cn(base, 'min-h-11 min-w-11', className)}>
        {content}
      </a>
    );
  }
  return (
    <span role="img" aria-label="Nestly" className={cn(base, className)}>
      {content}
    </span>
  );
}
