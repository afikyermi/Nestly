import type { ReactElement } from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

interface TooltipProps {
  // The tooltip text. For an icon-only control it equals the control's accessible name.
  label: string;
  // The one element that triggers it. It must be focusable and accept a ref.
  children: ReactElement;
  /** No tooltip while true (the control shows the same text itself); the trigger stays the same element. */
  disabled?: boolean;
  /** Where the tooltip is drawn, when it must sit inside a landmark (the portal's default is `body`, outside every landmark). */
  container?: HTMLElement | null;
}

// Shows on hover and on keyboard focus, closes on Escape and blur, and stays open while
// the pointer is over it (WCAG 1.4.13). Radix does the three; this wrapper fixes the look
// and the portal layer. Each tooltip brings its own provider so it works alone.
export function Tooltip({ label, children, disabled = false, container }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        {disabled ? null : (
          <TooltipPrimitive.Portal {...(container === undefined || container === null ? {} : { container })}>
            <TooltipPrimitive.Content
              sideOffset={6}
              className="z-popover max-w-64 rounded-sm bg-foreground px-3 py-1.5 text-caption text-background"
            >
              {label}
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        )}
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
