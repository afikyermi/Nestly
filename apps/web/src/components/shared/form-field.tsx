import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { AlertIcon } from '../ui/icons';

export interface FormFieldControl {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': boolean | undefined;
}

export interface FormFieldProps {
  label: string;
  /** The control's id; generated when absent and passed to `children`. */
  htmlFor?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (control: FormFieldControl) => ReactNode;
}

// Label above the control (a placeholder is never the label), hint and error linked by
// `aria-describedby`. The error has an icon and text, so it is not colour alone.
export function FormField({ label, htmlFor, hint, error, optional, className, children }: FormFieldProps) {
  const generated = useId();
  const id = htmlFor ?? generated;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-label text-foreground">
        {label}
        {optional ? <span className="ms-1 font-normal text-muted-foreground">(לא חובה)</span> : null}
      </label>
      {children({
        id,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {hint ? (
        <p id={hintId} className="text-small text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-small text-destructive">
          <AlertIcon className="size-4.5" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
