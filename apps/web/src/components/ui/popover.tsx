import type { ReactNode } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

export interface PopoverProps {
  /** The element that opens it, usually a button; it carries its own accessible name. */
  trigger: ReactNode;
  /** The panel's accessible name. */
  label: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Open on first render (a story). */
  defaultOpen?: boolean;
  /** Placement only (the panel's width). */
  className?: string;
  children: ReactNode;
}

// A panel that opens under its trigger (the notification dropdown). Radix gives the pattern: `aria-expanded` on the trigger, Escape or a press
// outside closes it and focus returns to the trigger. Not modal: the page stays in the accessibility tree. The panel is not portaled, so it
// stays inside the landmark that holds the trigger. Display only: what it holds, and when it opens, come from the caller.
export function Popover({
  trigger,
  label,
  open,
  onOpenChange,
  defaultOpen = false,
  className,
  children,
}: PopoverProps) {
  return (
    <PopoverPrimitive.Root
      defaultOpen={defaultOpen}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Content
        align="end"
        sideOffset={4}
        aria-label={label}
        className={cn(
          "z-popover rounded-md bg-card text-card-foreground shadow-card",
          className,
        )}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  );
}
