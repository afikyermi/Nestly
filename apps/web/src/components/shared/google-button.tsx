import type { RefObject } from 'react';
import { Button } from '../ui/button';
import { InlineAlert } from './inline-alert';

export interface GoogleButtonProps {
  /** Pressed and waiting for the browser to leave: the button is disabled and busy. */
  busy?: boolean;
  /** The inline failure shown above the button; none when absent. */
  message?: string | null;
  onPress: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}

// "המשך עם Google" (FR-AUTH-005): a text button, no provider logo yet (F1.8 scope). It goes inside the screen's actions column, after the
// primary action. A failure shows as an alert right above it; the busy state is also said in a status line, as `aria-busy` alone is
// poorly announced.
export function GoogleButton({ busy = false, message = null, onPress, buttonRef }: GoogleButtonProps) {
  return (
    <>
      {message !== null ? <InlineAlert>{message}</InlineAlert> : null}
      <Button ref={buttonRef} variant="soft" size="lg" block pending={busy} disabled={busy} onClick={onPress}>
        המשך עם Google
      </Button>
      <span role="status" className="sr-only">
        {busy ? 'עוברים אל Google' : ''}
      </span>
    </>
  );
}
