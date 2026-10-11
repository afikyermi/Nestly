import type { ReactElement } from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

interface TooltipProps {
  // The tooltip text. For an icon-only control it equals the control's accessible name.
  label: string;
  // The one element that triggers it. It must be focusable and accept a ref.
  children: ReactElement;
}

// Shows on hover and on keyboard focus, closes on Escape and blur, and stays open while
// the pointer is over it (WCAG 1.4.13). Radix does the three; this wrapper fixes the look
// and the portal layer. Each tooltip brings its own provider so it works alone.
export function Tooltip({ label, children }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-popover max-w-64 rounded-sm bg-foreground px-3 py-1.5 text-caption text-background"
          >
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
