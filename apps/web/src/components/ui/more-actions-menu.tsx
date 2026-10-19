import { useId, useRef } from 'react';
import { DropdownMenu } from 'radix-ui';
import { MoreIcon } from './icons';
import { Tooltip } from './tooltip';

export interface MoreActionsItem {
  /** Stable key within the menu. */
  key: string;
  /** The item's text and accessible name. */
  label: string;
  onSelect: () => void;
  /** Announced as disabled and skipped by the arrow keys (e.g. while its request is in flight). */
  disabled?: boolean;
}

export interface MoreActionsMenuProps {
  /** The icon button's accessible name and tooltip ("פעולות נוספות לפוסט"). */
  label: string;
  /** The menu's accessible name ("פעולות נוספות"). */
  menuLabel: string;
  items: readonly MoreActionsItem[];
  /** Open on first render (a story); the menu then owns its state as usual. */
  defaultOpen?: boolean;
  /** Controlled: whether the menu is open, and the change it asks for (the caller may close it on Back as well). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** A press outside the open menu, which closes it, with what was pressed (it may be a link). */
  onPressOutside?: (target: EventTarget | null) => void;
}

// An icon button that opens a short menu of actions on one thing (F3.9 c8; the menu F3.7 extends). Radix gives the menu pattern:
// `aria-haspopup="menu"` and `aria-expanded` on the button, Enter/Space/ArrowDown open it with focus on the first item, the arrows move,
// Escape or an outside click closes it and focus returns to the button (a press on another "⋯" closes it and opens that one at once). Not modal: the page stays in the accessibility tree and its
// landmarks stay valid while the menu is open; the menu is not portaled, so it stays inside the page's landmarks too. Display only: what
// each item does comes in as onSelect. The button carries `data-more-actions` so a screen can return focus to it after an action. Button
// and items are at least 44×44 px.
export function MoreActionsMenu({ label, menuLabel, items, defaultOpen = false, open, onOpenChange, onPressOutside }: MoreActionsMenuProps) {
  const menuNameId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set when the press that closes this menu landed on another menu's button: that button opens its menu and keeps the focus.
  const handedOver = useRef(false);
  return (
    <DropdownMenu.Root modal={false} defaultOpen={defaultOpen} {...(open === undefined ? {} : { open })} {...(onOpenChange === undefined ? {} : { onOpenChange })}>
      <Tooltip label={label}>
        <DropdownMenu.Trigger asChild>
          <button
            ref={buttonRef}
            type="button"
            aria-label={label}
            data-more-actions=""
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted"
          >
            <MoreIcon className="size-5" />
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Content
        aria-labelledby={menuNameId}
        onPointerDownOutside={(event) => {
          const pressed = event.detail.originalEvent.target;
          const other = pressed instanceof Element ? pressed.closest('[data-more-actions]') : null;
          handedOver.current = other !== null && other !== buttonRef.current;
          onPressOutside?.(pressed);
        }}
        onCloseAutoFocus={(event) => {
          // Every close returns focus to the button, an outside click included (a non-modal menu would leave it where the click went) -
          // except a press on another "⋯", whose menu is opening and would lose its focus (one press switches, ux-polish-b c8).
          event.preventDefault();
          if (handedOver.current) {
            handedOver.current = false;
            return;
          }
          buttonRef.current?.focus();
        }}
        align="end"
        sideOffset={4}
        className="z-popover min-w-44 rounded-md bg-card p-1 text-body text-card-foreground shadow-card"
      >
        <span id={menuNameId} hidden>
          {menuLabel}
        </span>
        {items.map((item) => (
          <DropdownMenu.Item
            key={item.key}
            onSelect={item.onSelect}
            {...(item.disabled === true ? { disabled: true } : {})}
            className="flex min-h-11 cursor-default items-center rounded-sm px-3 select-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
          >
            {item.label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
