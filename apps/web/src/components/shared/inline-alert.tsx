import type { ReactNode } from 'react';
import { AlertIcon } from '../ui/icons';

export interface InlineAlertProps {
  /** `error` is the only variant in wave 1. */
  variant?: 'error';
  children: ReactNode;
}

// A form-level message (the login error, ERR-001): a full-width strip. The icon and the text carry the meaning,
// the soft red background only supports them, so it is never colour alone.
export function InlineAlert({ variant = 'error', children }: InlineAlertProps) {
  return (
    <div
      role="alert"
      data-variant={variant}
      className="flex w-full items-start gap-2.5 rounded-md bg-destructive-soft px-4 py-3 text-body text-destructive"
    >
      <AlertIcon className="mt-0.5 size-5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
