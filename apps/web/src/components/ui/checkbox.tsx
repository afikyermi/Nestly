import type { ChangeEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CheckIcon } from './icons';

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
  'aria-describedby'?: string | undefined;
  /** FormField hands its invalid state over here; it combines with `error`. */
  'aria-invalid'?: boolean | undefined;
  /** The label. It may contain links (inline links in running text, WCAG 2.5.8). */
  children: ReactNode;
  onCheckedChange?: (checked: boolean) => void;
}

// A native checkbox, so Space toggles it and the platform announces it. The whole label row is
// the touch target (at least 44 high); the box itself is 20, with the `input` border (3:1), and checked it is a primary fill with a white
// tick (the native control drawn with appearance-none and a background image). An error is a destructive outline on the box, and the
// caller's message text carries it for everyone.
export function Checkbox({ error, 'aria-invalid': ariaInvalid, children, onCheckedChange, ...rest }: CheckboxProps) {
  return (
    <label className="flex min-h-11 items-start gap-3 text-small text-foreground">
      <span className="relative grid size-6 shrink-0 place-items-center">
        <input
          {...rest}
          type="checkbox"
          aria-invalid={error || ariaInvalid ? true : undefined}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onCheckedChange?.(event.target.checked)}
          className={cn(
            'peer size-6 cursor-pointer appearance-none rounded-sm border border-input bg-card',
            'transition-colors duration-fast ease-standard checked:border-primary checked:bg-primary',
            'disabled:cursor-not-allowed disabled:bg-muted disabled:checked:bg-muted-foreground',
            'aria-invalid:outline-2 aria-invalid:outline-offset-2 aria-invalid:outline-destructive',
          )}
        />
        <CheckIcon className="pointer-events-none absolute inset-0 m-auto hidden size-4 stroke-3 text-primary-foreground peer-checked:block" />
      </span>
      <span>{children}</span>
    </label>
  );
}
