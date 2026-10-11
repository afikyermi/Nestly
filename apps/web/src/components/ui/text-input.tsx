import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

// The field box shared by TextInput, PasswordInput and SelectInput. The border is the `input`
// token (3:1, tokens.md): `border` is decorative and never outlines a field. An error is a
// thicker destructive border, and FormField adds the icon and text, so it is never colour alone.
export const inputStyles = cn(
  'block min-h-12 w-full rounded-md border border-input bg-card px-3.5 text-body text-foreground',
  'placeholder:text-muted-foreground',
  'transition-colors duration-fast ease-standard',
  'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
  'aria-invalid:border-2 aria-invalid:border-destructive',
);

export interface TextInputProps
  extends Omit<ComponentProps<'input'>, 'type' | 'dir' | 'children' | 'aria-invalid'> {
  type?: 'text' | 'email' | 'tel';
  /** `error` sets `aria-invalid`; FormField hands its own invalid state over as `aria-invalid`. */
  error?: boolean;
  'aria-invalid'?: boolean | undefined;
  /** For LTR content inside the RTL form (email): text stays aligned to the start edge. */
  dir?: 'ltr';
}

// Its accessible name comes from FormField (`id`) or `aria-label`; it has none of its own.
export function TextInput({ type = 'text', error, 'aria-invalid': ariaInvalid, className, ...rest }: TextInputProps) {
  const invalid = error ?? ariaInvalid;
  return (
    <input
      {...rest}
      type={type}
      aria-invalid={invalid ? true : undefined}
      className={cn(inputStyles, rest.dir === 'ltr' && 'text-start', className)}
    />
  );
}
