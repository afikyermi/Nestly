import { AlertIcon } from '@/components/ui/icons';

// The hint or error line of a group (the stage group, the date fieldset), which FormField does not wrap.
// The error carries an icon and text, so it is not colour alone.
export function FieldHint({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="text-small text-muted-foreground">
      {children}
    </p>
  );
}

export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} role="alert" className="flex items-center gap-1.5 text-small text-destructive">
      <AlertIcon className="size-4.5" />
      <span>{children}</span>
    </p>
  );
}
