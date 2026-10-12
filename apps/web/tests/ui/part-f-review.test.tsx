// UI wave 1 part f, the "Addendum after the part-f review" (spec.md): focus return to the Hamburger when it was not
// focused at open, BottomNavigation with more than one `current`, and Escape with the close control focused or not.
// Derived from .work/ui-wave-1/spec.md only. Test names carry the addendum line they assert:
//   [R-focus]  AppShell: focus returns to the Hamburger even if it was not focused when the drawer opened
//   [R-multi]  BottomNavigation: more than one `current` -> only the first is current
//   [R-esc]    Escape: close control focused (tooltip first, then drawer) / focus elsewhere in the drawer (one Escape)
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/app-shell';
import { BottomNavigation } from '@/components/shared/bottom-navigation';
import { SideDrawer } from '@/components/shared/side-drawer';

const MENU = 'פתיחת התפריט';
const NAV = 'ניווט ראשי';
const TITLE = 'תפריט';
const CLOSE = 'סגירת התפריט';
const SKIP = 'דילוג לתוכן הראשי';

const Icon = ({ id }: { id: string }) => <svg data-testid={`icon-${id}`} aria-hidden="true" />;

const navItems = (currents: string[]) =>
  ['home', 'feed', 'me'].map((key) => ({
    key,
    label: { home: 'בית', feed: 'פיד', me: 'פרופיל' }[key] ?? key,
    href: `/${key}`,
    icon: <Icon id={key} />,
    ...(currents.includes(key) ? { current: true } : {}),
  }));

const shell = () => (
  <AppShell
    navItems={navItems(['feed'])}
    navLabel={NAV}
    menuLabel={MENU}
    drawerTitle={TITLE}
    drawerCloseLabel={CLOSE}
    skipLinkLabel={SKIP}
    menu={
      <>
        <a href="/settings">הגדרות</a>
        <a href="/help">עזרה</a>
      </>
    }
  >
    <h1>כותרת</h1>
    <a href="/in-main">בתוך התוכן</a>
  </AppShell>
);

const pressOutside = () => {
  fireEvent.pointerDown(document.body, { pointerType: 'mouse', button: 0 });
  fireEvent.mouseDown(document.body);
  fireEvent.pointerUp(document.body, { pointerType: 'mouse', button: 0 });
  fireEvent.click(document.body);
};

/** Opens the drawer the way a click does in Safari / Firefox on macOS: the click arrives, the button is not focused. */
const openWithoutFocusingHamburger = (hamburger: HTMLElement) => {
  fireEvent.click(hamburger);
};

describe('AppShell: focus returns to the Hamburger when it was not focused at open [R-focus]', () => {
  const dismissals = ['escape', 'close', 'backdrop'] as const;

  for (const how of dismissals) {
    it(`[R-focus] focus on <body> at open, closed by ${how}: the Hamburger gets focus`, async () => {
      const user = userEvent.setup();
      render(shell());
      const hamburger = screen.getByRole('button', { name: MENU });
      act(() => hamburger.blur());
      expect(document.body).toHaveFocus();
      openWithoutFocusingHamburger(hamburger);
      await screen.findByRole('dialog', { name: TITLE });
      if (how === 'escape') {
        await user.keyboard('{Escape}');
        if (screen.queryByRole('dialog')) await user.keyboard('{Escape}'); // a first Escape may only close a Tooltip
      } else if (how === 'close') await user.click(screen.getByRole('button', { name: CLOSE }));
      else pressOutside();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(hamburger).toHaveFocus();
    });
  }

  it('[R-focus] focus on a link in the page content at open (not the Hamburger): the Hamburger gets focus on close', async () => {
    const user = userEvent.setup();
    render(shell());
    const hamburger = screen.getByRole('button', { name: MENU });
    const link = screen.getByRole('link', { name: 'בתוך התוכן' });
    act(() => link.focus());
    expect(link).toHaveFocus();
    openWithoutFocusingHamburger(hamburger);
    await screen.findByRole('dialog', { name: TITLE });
    await user.click(screen.getByRole('button', { name: CLOSE }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(hamburger).toHaveFocus();
  });

  it('[R-focus] repeated: unfocused open, close, then a second unfocused open and close still lands on the Hamburger', async () => {
    const user = userEvent.setup();
    render(shell());
    const hamburger = screen.getByRole('button', { name: MENU });
    for (let i = 0; i < 3; i += 1) {
      act(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
      openWithoutFocusingHamburger(hamburger);
      await screen.findByRole('dialog', { name: TITLE });
      await user.click(screen.getByRole('button', { name: CLOSE }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(hamburger, `round ${i}`).toHaveFocus();
    }
  });

  it('[R-focus] the keyboard path (Hamburger focused at open) still returns focus to the Hamburger', async () => {
    const user = userEvent.setup();
    render(shell());
    const hamburger = screen.getByRole('button', { name: MENU });
    act(() => hamburger.focus());
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: TITLE });
    await user.click(screen.getByRole('button', { name: CLOSE }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(hamburger).toHaveFocus();
  });
});

describe('BottomNavigation: more than one `current` [R-multi]', () => {
  it('[R-multi] two current items: exactly one aria-current="page", the first', () => {
    const { container } = render(<BottomNavigation items={navItems(['home', 'feed'])} label={NAV} />);
    const current = container.querySelectorAll('[aria-current]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('aria-current', 'page');
    expect(current[0]).toBe(screen.getByRole('link', { name: 'בית' }));
    expect(screen.getByRole('link', { name: 'פיד' })).not.toHaveAttribute('aria-current');
  });

  it('[R-multi] "first" means first in the items order, not the key order or the last one given', () => {
    const { container } = render(<BottomNavigation items={navItems(['me', 'feed'])} label={NAV} />);
    expect(container.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(container.querySelector('[aria-current="page"]')).toBe(screen.getByRole('link', { name: 'פיד' }));
  });

  it('[R-multi] all three current: still exactly one, the first', () => {
    const { container } = render(<BottomNavigation items={navItems(['home', 'feed', 'me'])} label={NAV} />);
    expect(container.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(container.querySelector('[aria-current="page"]')).toBe(screen.getByRole('link', { name: 'בית' }));
  });

  it('[R-multi] the later current item renders as an ordinary item (same styling as a never-current one)', () => {
    render(<BottomNavigation items={navItems(['home', 'feed'])} label={NAV} />);
    const first = screen.getByRole('link', { name: 'בית' });
    const second = screen.getByRole('link', { name: 'פיד' });
    const ordinary = screen.getByRole('link', { name: 'פרופיל' });
    expect(second.className).toBe(ordinary.className);
    expect(first.className).not.toBe(second.className);
  });

  it('[R-multi] after the surplus current is removed the first stays current (no flicker to the other)', () => {
    const { container, rerender } = render(<BottomNavigation items={navItems(['home', 'feed'])} label={NAV} />);
    rerender(<BottomNavigation items={navItems(['home'])} label={NAV} />);
    expect(container.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(container.querySelector('[aria-current="page"]')).toBe(screen.getByRole('link', { name: 'בית' }));
  });
});

function Harness({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        {MENU}
      </button>
      <SideDrawer
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        title={TITLE}
        closeLabel={CLOSE}
      >
        <a href="/one">אחד</a>
        <a href="/two">שניים</a>
      </SideDrawer>
    </div>
  );
}

describe('Escape inside the drawer [R-esc]', () => {
  it('[R-esc] close control focused with its Tooltip showing: at most two Escapes; the first closes the Tooltip if the drawer stays open; the drawer ends closed with focus on the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: MENU });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    const close = within(dialog).getByRole('button', { name: CLOSE });
    act(() => close.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(CLOSE);
    await user.keyboard('{Escape}');
    if (screen.queryByRole('dialog')) {
      await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
      await user.keyboard('{Escape}');
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('[R-esc] close control focused: the drawer is not left open after two Escapes, and onOpenChange(false) is asked exactly once', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: MENU }));
    const close = within(await screen.findByRole('dialog', { name: TITLE })).getByRole('button', { name: CLOSE });
    act(() => close.focus());
    await screen.findByRole('tooltip');
    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onOpenChange.mock.calls.filter(([v]) => v === false)).toHaveLength(1);
    expect(onOpenChange.mock.calls.some(([v]) => v === true)).toBe(false);
  });

  it('[R-esc] close control focused: the Tooltip is gone once the drawer is gone (no orphan tooltip)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: MENU }));
    const close = within(await screen.findByRole('dialog', { name: TITLE })).getByRole('button', { name: CLOSE });
    act(() => close.focus());
    await screen.findByRole('tooltip');
    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('[R-esc] focus on a link elsewhere in the drawer: one Escape closes it and focus returns to the trigger', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', { name: MENU });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    const link = within(dialog).getByRole('link', { name: 'שניים' });
    act(() => link.focus());
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull()); // a stale Tooltip must not absorb the Escape
    expect(link).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onOpenChange.mock.calls.filter(([v]) => v === false)).toHaveLength(1);
    expect(trigger).toHaveFocus();
  });

  it('[R-esc] in AppShell, focus on a menu link: one Escape closes the drawer and focus is on the Hamburger', async () => {
    const user = userEvent.setup();
    render(shell());
    const hamburger = screen.getByRole('button', { name: MENU });
    await user.click(hamburger);
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    act(() => within(dialog).getByRole('link', { name: 'עזרה' }).focus());
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(hamburger).toHaveFocus();
  });

  it('[R-esc] in AppShell, close control focused: at most two Escapes close it, focus on the Hamburger', async () => {
    const user = userEvent.setup();
    render(shell());
    const hamburger = screen.getByRole('button', { name: MENU });
    await user.click(hamburger);
    const close = within(await screen.findByRole('dialog', { name: TITLE })).getByRole('button', { name: CLOSE });
    act(() => close.focus());
    await screen.findByRole('tooltip');
    await user.keyboard('{Escape}');
    if (screen.queryByRole('dialog')) await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(hamburger).toHaveFocus();
  });
});
