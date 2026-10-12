import type { ReactNode } from 'react';
import { AlertIcon } from '../ui/icons';

export interface InlineAlertProps {
  /** `error` is the only variant in wave 1. */
  variant?: 'error';
  children: ReactNode;
}

// A form-level message (the login error, ERR-001). The icon and the text carry the meaning,
// the soft red background only supports them, so it is never colour alone.
export function InlineAlert({ variant = 'error', children }: InlineAlertProps) {
  return (
    <div
      role="alert"
      data-variant={variant}
      className="flex items-start gap-2.5 rounded-md bg-destructive-soft px-3.5 py-3 text-body text-destructive"
    >
      <AlertIcon className="mt-0.5 size-6 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
