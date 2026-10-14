import { AlertIcon } from '../ui/icons';

export interface FieldMessageProps {
  /** The id the control or group links with `aria-describedby`. */
  id: string;
  children: string;
}

// The hint line under a field or group, in the muted tone.
export function FieldHint({ id, children }: FieldMessageProps) {
  return (
    <p id={id} className="text-small text-muted-foreground">
      {children}
    </p>
  );
}

// The error line under a field or group: an alert with an icon and text, so it is never colour alone.
export function FieldError({ id, children }: FieldMessageProps) {
  return (
    <p id={id} role="alert" className="flex items-center gap-1.5 text-small text-destructive">
      <AlertIcon className="size-4.5" />
      <span>{children}</span>
    </p>
  );
}
