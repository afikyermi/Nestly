import type { ChangeEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Exactly the props of the spec's API section: no className.
export interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  required?: boolean;
  error?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  /** The label. It may contain links (inline links in running text, WCAG 2.5.8). */
  children: ReactNode;
  onCheckedChange?: (checked: boolean) => void;
}

// A native checkbox, so Space toggles it and the platform announces it. The whole label row is
// the touch target (at least 44 high); the box itself stays 24. An error is a thicker
// destructive outline on the box, and the caller's message text carries it for everyone.
export function Checkbox({ error, children, onCheckedChange, ...rest }: CheckboxProps) {
  return (
    <label className="flex min-h-11 items-start gap-3 text-small text-foreground">
      <input
        {...rest}
        type="checkbox"
        aria-invalid={error ? true : undefined}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onCheckedChange?.(event.target.checked)}
        className={cn(
          'mt-0.5 size-6 shrink-0 accent-primary',
          'disabled:cursor-not-allowed',
          'aria-invalid:outline-2 aria-invalid:outline-offset-2 aria-invalid:outline-destructive',
        )}
      />
      <span className="pt-0.5">{children}</span>
    </label>
  );
}
