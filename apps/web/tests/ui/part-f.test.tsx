// UI wave 1 part f: criteria 38 (TopBar), 39 (BottomNavigation), 40 (SideDrawer), 41 (AppShell), with 17 and 19
// and the part-e review addendum (className is placement only). Derived from .work/ui-wave-1/spec.md only.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/app-shell';
import { BottomNavigation } from '@/components/shared/bottom-navigation';
import { SideDrawer } from '@/components/shared/side-drawer';
import { TopBar } from '@/components/shared/top-bar';

afterEach(() => vi.restoreAllMocks());

const MENU = 'פתיחת התפריט';
const NAV = 'ניווט ראשי';
const TITLE = 'תפריט';
const CLOSE = 'סגירת התפריט';
const SKIP = 'דילוג לתוכן הראשי';

const Icon = ({ id }: { id: string }) => <svg data-testid={`icon-${id}`} aria-hidden="true" />;

const items = (current?: string) => [
  { key: 'home', label: 'בית', href: '/home', icon: <Icon id="home" />, ...(current === 'home' ? { current: true } : {}) },
  { key: 'feed', label: 'פיד', href: '/feed', icon: <Icon id="feed" />, ...(current === 'feed' ? { current: true } : {}) },
  { key: 'me', label: 'פרופיל', href: '/me', icon: <Icon id="me" />, ...(current === 'me' ? { current: true } : {}) },
];

/** A mouse press on the page outside the open drawer (the backdrop covers the page). */
const pressOutside = () => {
  fireEvent.pointerDown(document.body, { pointerType: 'mouse', button: 0 });
  fireEvent.mouseDown(document.body);
  fireEvent.pointerUp(document.body, { pointerType: 'mouse', button: 0 });
  fireEvent.click(document.body);
};

const hover = (el: Element) => {
  fireEvent.pointerEnter(el, { pointerType: 'mouse' });
  fireEvent.pointerMove(el, { pointerType: 'mouse' });
};

describe('TopBar (38)', () => {
  it('[38] renders exactly one header landmark with the Hamburger named by menuLabel', () => {
    const { container } = render(<TopBar onMenuClick={() => undefined} menuLabel={MENU} />);
    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: MENU })).toBeInTheDocument();
  });

  it('[38] shows the Logo ("Nestly" is exposed once)', () => {
    const { container } = render(<TopBar onMenuClick={() => undefined} menuLabel={MENU} />);
    const exposed = Array.from(container.querySelectorAll('[aria-label="Nestly"], a, [role="img"]')).filter(
      (el) => (el.getAttribute('aria-label') ?? el.textContent) === 'Nestly',
    );
    expect(exposed.length).toBeGreaterThanOrEqual(1);
    const text = (container.textContent ?? '').replace(/\s/g, '');
    expect(text.split('Nestly').length - 1).toBeLessThanOrEqual(1);
  });

  it('[38] with no actions it renders nothing else: one button, no search, no chat, no bell, no other link or field', () => {
    const { container } = render(<TopBar onMenuClick={() => undefined} menuLabel={MENU} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(container.querySelector('input, select, textarea')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('[38] the actions slot accepts caller nodes, inside the header, after which the Hamburger is still there', () => {
    render(
      <TopBar
        onMenuClick={() => undefined}
        menuLabel={MENU}
        actions={
          <>
            <a href="/chat">צאט</a>
            <span data-testid="extra">x</span>
          </>
        }
      />,
    );
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'צאט' })).toBeInTheDocument();
    expect(within(header).getByTestId('extra')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: MENU })).toBeInTheDocument();
  });

  it('[38] null / false / empty-fragment actions render like no actions (boundary)', () => {
    for (const actions of [null, false, undefined, <></>]) {
      const { unmount } = render(<TopBar onMenuClick={() => undefined} menuLabel={MENU} actions={actions} />);
      expect(screen.getAllByRole('button')).toHaveLength(1);
      expect(screen.queryByRole('link')).toBeNull();
      unmount();
    }
  });

  it('[38] clicking the Hamburger calls onMenuClick once; Enter and Space activate it (17)', async () => {
    const user = userEvent.setup();
    const onMenuClick = vi.fn();
    render(<TopBar onMenuClick={onMenuClick} menuLabel={MENU} />);
    const button = screen.getByRole('button', { name: MENU });
    await user.click(button);
    expect(onMenuClick).toHaveBeenCalledTimes(1);
    act(() => button.blur());
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onMenuClick).toHaveBeenCalledTimes(2);
    await user.keyboard(' ');
    expect(onMenuClick).toHaveBeenCalledTimes(3);
  });

  it('[38][17] the Hamburger is the first Tab stop and is a plain button that does not submit a form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <TopBar onMenuClick={() => undefined} menuLabel={MENU} />
      </form>,
    );
    await user.tab();
    const button = screen.getByRole('button', { name: MENU });
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('[38][19] the Hamburger shows a Tooltip with its name on hover', async () => {
    render(<TopBar onMenuClick={() => undefined} menuLabel={MENU} />);
    hover(screen.getByRole('button', { name: MENU }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(MENU);
  });

  it('[38][19] the Hamburger shows a Tooltip with its name on focus; blur closes it', async () => {
    render(<TopBar onMenuClick={() => undefined} menuLabel={MENU} />);
    const button = screen.getByRole('button', { name: MENU });
    act(() => button.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(MENU);
    act(() => button.blur());
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('[38][19] the Hamburger icon is hidden from assistive technology, so the name is exactly menuLabel', () => {
    render(<TopBar onMenuClick={() => undefined} menuLabel={MENU} />);
    const button = screen.getByRole('button', { name: MENU });
    const svg = button.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect((button.textContent ?? '').trim()).toBe('');
  });

  it('[38] menuButtonRef (object ref) receives the Hamburger button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<TopBar onMenuClick={() => undefined} menuLabel={MENU} menuButtonRef={ref} />);
    expect(ref.current).toBe(screen.getByRole('button', { name: MENU }));
  });

  it('[38] menuButtonRef (callback ref) is called with the button, and with null on unmount', () => {
    const cb = vi.fn();
    const { unmount } = render(<TopBar onMenuClick={() => undefined} menuLabel={MENU} menuButtonRef={cb} />);
    expect(cb).toHaveBeenCalledWith(screen.getByRole('button', { name: MENU }));
    unmount();
    expect(cb).toHaveBeenLastCalledWith(null);
  });

  it('[38] the label is whatever the caller passes, rendered as text, not as markup', () => {
    const hostile = '<img src=x onerror=alert(1)> "\' &amp;';
    const { container } = render(<TopBar onMenuClick={() => undefined} menuLabel={hostile} />);
    expect(screen.getByRole('button', { name: hostile })).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('[38] className (placement) lands on the rendered component', () => {
    const { container } = render(<TopBar onMenuClick={() => undefined} menuLabel={MENU} className="probe-top" />);
    expect(container.querySelector('.probe-top')).not.toBeNull();
  });
});

describe('BottomNavigation (39)', () => {
  it('[39] renders one nav landmark named by label', () => {
    const { container } = render(<BottomNavigation items={items('feed')} label={NAV} />);
    expect(container.querySelectorAll('nav')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: NAV })).toBeInTheDocument();
  });

  it('[39] items come from props: one link per item with its label as the name, its href, and its icon node', () => {
    render(<BottomNavigation items={items()} label={NAV} />);
    const nav = screen.getByRole('navigation', { name: NAV });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/home', '/feed', '/me']);
    expect(links.map((l) => l.textContent?.trim())).toEqual(['בית', 'פיד', 'פרופיל']);
    for (const [i, id] of ['home', 'feed', 'me'].entries()) {
      expect(links[i]).toContainElement(screen.getByTestId(`icon-${id}`));
    }
    expect(within(nav).getByRole('link', { name: 'פיד' })).toBe(links[1]);
  });

  it('[39] exactly one item has aria-current="page": the current one', () => {
    for (const key of ['home', 'feed', 'me']) {
      const { container, unmount } = render(<BottomNavigation items={items(key)} label={NAV} />);
      const current = container.querySelectorAll('[aria-current]');
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveAttribute('aria-current', 'page');
      expect(current[0]).toBe(screen.getByRole('link', { name: items().find((i) => i.key === key)?.label ?? '' }));
      unmount();
    }
  });

  it('[39] with no current item there is no aria-current at all (boundary), and non-current items never carry aria-current="false"', () => {
    const { container } = render(<BottomNavigation items={items()} label={NAV} />);
    expect(container.querySelector('[aria-current]')).toBeNull();
    const { container: c2 } = render(<BottomNavigation items={items('home')} label={NAV} />);
    expect(c2.querySelectorAll('[aria-current="false"]')).toHaveLength(0);
  });

  it('[39] changing which item is current moves aria-current (no stale marker)', () => {
    const { container, rerender } = render(<BottomNavigation items={items('home')} label={NAV} />);
    expect(container.querySelector('[aria-current="page"]')).toHaveTextContent('בית');
    rerender(<BottomNavigation items={items('me')} label={NAV} />);
    expect(container.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(container.querySelector('[aria-current="page"]')).toHaveTextContent('פרופיל');
  });

  it('[39] the current item differs from the others by more than colour (a class or structure difference exists)', () => {
    render(<BottomNavigation items={items('feed')} label={NAV} />);
    const current = screen.getByRole('link', { name: 'פיד' });
    const other = screen.getByRole('link', { name: 'בית' });
    // Weight itself is asserted on the computed style in the browser spec; here: the markup differs beyond the
    // aria attribute, so the difference is carried by something other than the colour token alone.
    expect(current.className).not.toBe(other.className);
  });

  it('[39] stories shapes: 3 items (AC-005) and 5 items both render every item, in order', () => {
    const five = [
      ...items(),
      { key: 'a', label: 'ד', href: '/d', icon: <Icon id="d" /> },
      { key: 'b', label: 'ה', href: '/e', icon: <Icon id="e" /> },
    ];
    const { unmount } = render(<BottomNavigation items={items('home')} label={NAV} />);
    expect(screen.getAllByRole('link')).toHaveLength(3);
    unmount();
    render(<BottomNavigation items={five} label={NAV} />);
    expect(screen.getAllByRole('link').map((l) => l.textContent?.trim())).toEqual(['בית', 'פיד', 'פרופיל', 'ד', 'ה']);
  });

  it('[39] zero items (empty state) renders the named nav without links and does not throw', () => {
    render(<BottomNavigation items={[]} label={NAV} />);
    expect(screen.getByRole('navigation', { name: NAV })).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('[39] one item renders one link', () => {
    render(<BottomNavigation items={items('home').slice(0, 1)} label={NAV} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('[39][17] Tab visits the items in order; Enter activates each as a native link', async () => {
    const user = userEvent.setup();
    const { container } = render(<BottomNavigation items={items('home')} label={NAV} />);
    const clicked: string[] = [];
    container.addEventListener('click', (e) => {
      e.preventDefault();
      const a = e.target instanceof Element ? e.target.closest('a') : null;
      clicked.push(a?.getAttribute('href') ?? '');
    });
    for (const name of ['בית', 'פיד', 'פרופיל']) {
      await user.tab();
      expect(screen.getByRole('link', { name })).toHaveFocus();
      await user.keyboard('{Enter}');
    }
    expect(clicked).toEqual(['/home', '/feed', '/me']);
  });

  it('[39] the icon does not add to the accessible name (name is exactly the label)', () => {
    render(<BottomNavigation items={items()} label={NAV} />);
    for (const link of screen.getAllByRole('link')) {
      const clone = document.createElement('div');
      clone.append(link.cloneNode(true));
      for (const hidden of Array.from(clone.querySelectorAll('[aria-hidden="true"]'))) hidden.remove();
      expect((clone.textContent ?? '').trim()).toBe(link.textContent?.trim());
    }
  });

  it('[39] a label with markup characters is text, not markup', () => {
    const hostile = [{ key: 'x', label: '<b>bold</b>&amp;', href: '/x', icon: <Icon id="x" /> }];
    const { container } = render(<BottomNavigation items={hostile} label={'<i>nav</i>'} />);
    expect(container.querySelector('b, i')).toBeNull();
    expect(screen.getByRole('navigation', { name: '<i>nav</i>' })).toBeInTheDocument();
  });

  it('[39] className (placement) lands on the rendered component', () => {
    const { container } = render(<BottomNavigation items={items()} label={NAV} className="probe-nav" />);
    expect(container.querySelector('.probe-nav')).not.toBeNull();
  });
});

/** A controlled harness: the trigger lives outside the drawer, as the Hamburger does. */
function Harness({ initial = false, children }: { initial?: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        {MENU}
      </button>
      <p>page text</p>
      <SideDrawer open={open} onOpenChange={setOpen} title={TITLE} closeLabel={CLOSE}>
        {children ?? <a href="/one">אחד</a>}
      </SideDrawer>
    </div>
  );
}

describe('SideDrawer (40)', () => {
  it('[40] is closed by default: no dialog, and its content is not in the document', () => {
    render(
      <SideDrawer open={false} onOpenChange={() => undefined} title={TITLE} closeLabel={CLOSE}>
        <a href="/one">אחד</a>
      </SideDrawer>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('link', { name: 'אחד' })).toBeNull();
    expect(screen.queryByRole('button', { name: CLOSE })).toBeNull();
  });

  it('[40] open: a dialog named by title, with the children and a close control named by closeLabel', () => {
    render(
      <SideDrawer open onOpenChange={() => undefined} title={TITLE} closeLabel={CLOSE}>
        <a href="/one">אחד</a>
      </SideDrawer>,
    );
    const dialog = screen.getByRole('dialog', { name: TITLE });
    expect(within(dialog).getByRole('link', { name: 'אחד' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: CLOSE })).toBeInTheDocument();
  });

  it('[40] opens when the trigger sets open, and the dialog is absent before', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: MENU }));
    expect(await screen.findByRole('dialog', { name: TITLE })).toBeInTheDocument();
  });

  it('[40] focus moves into the dialog on open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: MENU }));
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it('[40] focus is trapped: Tab and Shift+Tab many times never leave the dialog', async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <a href="/one">אחד</a>
        <a href="/two">שניים</a>
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: MENU }));
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement), `Tab ${i}`).toBe(true);
    }
    for (let i = 0; i < 8; i += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement), `Shift+Tab ${i}`).toBe(true);
    }
  });

  it('[40] content outside the dialog is hidden from assistive technology while open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: MENU }));
    await screen.findByRole('dialog', { name: TITLE });
    expect(screen.queryByRole('button', { name: MENU })).toBeNull(); // getByRole ignores aria-hidden subtrees
  });

  it('[40] Escape closes it (onOpenChange(false)) and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: MENU });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: TITLE });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('[40] the close control closes it and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: MENU });
    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: CLOSE }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('[40] a press outside the drawer (the backdrop) closes it and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: MENU });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: TITLE });
    pressOutside();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('[40] a press inside the drawer does not close it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: MENU }));
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    await user.click(within(dialog).getByRole('heading', { name: TITLE }));
    await user.click(within(dialog).getByRole('link', { name: 'אחד' }));
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
  });

  it('[40] is controlled: each dismissal asks onOpenChange(false) exactly once and does not close by itself', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <SideDrawer open onOpenChange={onOpenChange} title={TITLE} closeLabel={CLOSE}>
        <a href="/one">אחד</a>
      </SideDrawer>,
    );
    await user.click(screen.getByRole('button', { name: CLOSE }));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
  });

  it('[40] never calls onOpenChange(true) by itself on mount or rerender', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <SideDrawer open={false} onOpenChange={onOpenChange} title={TITLE} closeLabel={CLOSE}>
        x
      </SideDrawer>,
    );
    rerender(
      <SideDrawer open={false} onOpenChange={onOpenChange} title={TITLE} closeLabel={CLOSE}>
        y
      </SideDrawer>,
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('[40] page scroll locks while open and is released after close', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const locked = () =>
      getComputedStyle(document.body).overflow === 'hidden' ||
      getComputedStyle(document.documentElement).overflow === 'hidden' ||
      document.body.hasAttribute('data-scroll-locked');
    expect(locked()).toBe(false);
    await user.click(screen.getByRole('button', { name: MENU }));
    await screen.findByRole('dialog', { name: TITLE });
    expect(locked()).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(locked()).toBe(false));
  });

  it('[40] opens, closes and opens again (the already-done state): the second open works and focus returns again', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: MENU });
    for (let i = 0; i < 3; i += 1) {
      await user.click(trigger);
      await screen.findByRole('dialog', { name: TITLE });
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(trigger).toHaveFocus();
    }
  });

  it('[40] initially open (open from the first render) shows the dialog with focus inside', async () => {
    render(<Harness initial />);
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it('[40][19] the close control is icon-only: no visible text, its icon is aria-hidden, and it shows a Tooltip with its name', async () => {
    render(
      <SideDrawer open onOpenChange={() => undefined} title={TITLE} closeLabel={CLOSE}>
        x
      </SideDrawer>,
    );
    const close = screen.getByRole('button', { name: CLOSE });
    expect((close.textContent ?? '').trim()).toBe('');
    expect(close.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    act(() => close.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(CLOSE);
  });

  it('[40] the title and labels are rendered as text, not markup', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    render(
      <SideDrawer open onOpenChange={() => undefined} title={hostile} closeLabel={'<u>x</u>'}>
        x
      </SideDrawer>,
    );
    expect(screen.getByRole('dialog', { name: hostile })).toBeInTheDocument();
    expect(document.querySelector('img, u')).toBeNull();
  });

  it('[40] empty children (boundary) still gives a dialog with a close control', () => {
    render(
      <SideDrawer open onOpenChange={() => undefined} title={TITLE} closeLabel={CLOSE}>
        {null}
      </SideDrawer>,
    );
    expect(within(screen.getByRole('dialog', { name: TITLE })).getByRole('button', { name: CLOSE })).toBeInTheDocument();
  });
});

const shellProps = {
  navItems: items('feed'),
  navLabel: NAV,
  menuLabel: MENU,
  drawerTitle: TITLE,
  drawerCloseLabel: CLOSE,
  skipLinkLabel: SKIP,
  menu: <a href="/settings">הגדרות</a>,
};

const shell = (over: Partial<Parameters<typeof AppShell>[0]> = {}) => (
  <AppShell {...shellProps} {...over}>
    <h1>כותרת</h1>
    <a href="/in-main">בתוך התוכן</a>
  </AppShell>
);

describe('AppShell (41)', () => {
  it('[41] exactly one main, one header, one nav', () => {
    const { container } = render(shell());
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(container.querySelectorAll('nav')).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
  });

  it('[41] the landmark counts stay at one with the drawer open, and with topBarActions supplied', async () => {
    const user = userEvent.setup();
    const { container } = render(shell({ topBarActions: <a href="/chat">צאט</a> }));
    await user.click(screen.getByRole('button', { name: MENU }));
    await screen.findByRole('dialog', { name: TITLE });
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(document.querySelectorAll('nav')).toHaveLength(1);
  });

  it('[41] children render inside main, and only there; the nav is named navLabel and holds the items; the header holds the Hamburger', () => {
    render(shell());
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { name: 'כותרת' })).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: 'בתוך התוכן' })).toBeInTheDocument();
    expect(within(main).queryByRole('navigation')).toBeNull();
    expect(within(main).queryByRole('banner')).toBeNull();
    const nav = screen.getByRole('navigation', { name: NAV });
    expect(within(nav).getAllByRole('link')).toHaveLength(3);
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('פיד');
    expect(within(screen.getByRole('banner')).getByRole('button', { name: MENU })).toBeInTheDocument();
    expect(main.contains(screen.getByRole('banner'))).toBe(false);
    expect(main.contains(nav)).toBe(false);
  });

  it('[41] topBarActions render in the header', () => {
    render(shell({ topBarActions: <a href="/chat">צאט</a> }));
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'צאט' })).toBeInTheDocument();
  });

  it('[41] the drawer is closed on load: no dialog, and the menu body is not in the document', () => {
    render(shell());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('link', { name: 'הגדרות' })).toBeNull();
  });

  it('[41] the first Tab stop is the skip link (text = skipLinkLabel), before the Hamburger, nav and content', async () => {
    const user = userEvent.setup();
    render(shell());
    await user.tab();
    const skip = screen.getByRole('link', { name: SKIP });
    expect(skip).toHaveFocus();
    expect(skip.getAttribute('href') ?? '').toMatch(/^#.+/);
    await user.tab();
    expect(screen.getByRole('button', { name: MENU })).toHaveFocus();
  });

  it('[41] activating the skip link (Enter) moves focus to main', async () => {
    const user = userEvent.setup();
    render(shell());
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('[41] activating the skip link by click moves focus to main, and the skip link target is the main element', async () => {
    const user = userEvent.setup();
    render(shell());
    const skip = screen.getByRole('link', { name: SKIP });
    const target = skip.getAttribute('href')?.slice(1) ?? '';
    expect(document.getElementById(target)).toBe(screen.getByRole('main'));
    await user.click(skip);
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('[41] opening the drawer from the Hamburger shows a dialog named drawerTitle with the menu and a close control named drawerCloseLabel', async () => {
    const user = userEvent.setup();
    render(shell());
    await user.click(screen.getByRole('button', { name: MENU }));
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    expect(within(dialog).getByRole('link', { name: 'הגדרות' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: CLOSE })).toBeInTheDocument();
  });

  it('[41][40] AppShell owns the drawer state: Escape, the close control and a backdrop press each close it and focus returns to the Hamburger', async () => {
    const user = userEvent.setup();
    render(shell());
    const hamburger = screen.getByRole('button', { name: MENU });
    for (const how of ['escape', 'close', 'backdrop'] as const) {
      await user.click(hamburger);
      await screen.findByRole('dialog', { name: TITLE });
      if (how === 'escape') await user.keyboard('{Escape}');
      else if (how === 'close') await user.click(screen.getByRole('button', { name: CLOSE }));
      else pressOutside();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(hamburger, how).toHaveFocus();
    }
  });

  it('[41] the Hamburger opens the drawer on Enter and on Space', async () => {
    const user = userEvent.setup();
    render(shell());
    const hamburger = screen.getByRole('button', { name: MENU });
    act(() => hamburger.focus());
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: TITLE });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.keyboard(' ');
    expect(await screen.findByRole('dialog', { name: TITLE })).toBeInTheDocument();
  });

  it('[41] works with no children (empty state): still one main, header and nav', () => {
    const { container } = render(
      <AppShell
        navItems={[]}
        navLabel={NAV}
        menuLabel={MENU}
        drawerTitle={TITLE}
        drawerCloseLabel={CLOSE}
        skipLinkLabel={SKIP}
        menu={null}
      >
        {null}
      </AppShell>,
    );
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(container.querySelectorAll('nav')).toHaveLength(1);
  });

  it('[41] renders with no Router, Query, auth or any other provider around it (RouteGuard wraps it, not the other way)', () => {
    expect(() => render(shell())).not.toThrow();
  });

  it('[41] className (placement) lands on the rendered component', () => {
    const { container } = render(<AppShell {...Object.assign({}, shellProps, { className: 'probe-shell' })}>x</AppShell>);
    expect(container.querySelector('.probe-shell')).not.toBeNull();
  });

  it('[41] copy is passed as props: the strings given are the strings shown (nothing hard-coded to Hebrew defaults)', () => {
    render(
      shell({ navLabel: 'Main', menuLabel: 'Open menu', drawerTitle: 'Menu', drawerCloseLabel: 'Close', skipLinkLabel: 'Skip' }),
    );
    expect(screen.getByRole('link', { name: 'Skip' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: SKIP })).toBeNull();
    expect(screen.queryByRole('button', { name: MENU })).toBeNull();
  });
});

describe('AppShell imports no auth, router or data code (41)', () => {
  const srcRoot = path.resolve(__dirname, '../../src');
  const BANNED_PACKAGE = /^(react-router|react-router-dom|@tanstack\/|@supabase\/|swr|axios|zustand|jotai|redux|@reduxjs\/)/;
  const BANNED_LOCAL = /(^|\/)(auth|router|routes|routing|api|query|queries|supabase|session|route-guard)(\/|\.|$)/i;

  const resolveLocal = (spec: string, from: string): string | null => {
    const base = spec.startsWith('@/') ? path.join(srcRoot, spec.slice(2)) : path.resolve(path.dirname(from), spec);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
      if (existsSync(candidate) && /\.(ts|tsx)$/.test(candidate)) return candidate;
    }
    return null;
  };

  const specifiers = (file: string): string[] => {
    const text = readFileSync(file, 'utf8');
    const found: string[] = [];
    for (const m of text.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      found.push(m[1] ?? m[2] ?? m[3] ?? '');
    }
    return found;
  };

  it('[41] the transitive imports of layout/app-shell.tsx name no router, auth, query or data module', () => {
    const entry = path.join(srcRoot, 'components/layout/app-shell.tsx');
    expect(existsSync(entry)).toBe(true);
    const seen = new Set<string>();
    const offenders: string[] = [];
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const spec of specifiers(file)) {
        if (BANNED_PACKAGE.test(spec)) offenders.push(`${path.relative(srcRoot, file)} -> ${spec}`);
        if (spec.startsWith('.') || spec.startsWith('@/')) {
          if (BANNED_LOCAL.test(spec)) offenders.push(`${path.relative(srcRoot, file)} -> ${spec}`);
          const resolved = resolveLocal(spec, file);
          if (resolved) walk(resolved);
        }
      }
    };
    walk(entry);
    expect(seen.size).toBeGreaterThan(1);
    expect(offenders).toEqual([]);
  });

  it('[41] no component calls fetch or touches storage', () => {
    const entry = path.join(srcRoot, 'components/layout/app-shell.tsx');
    const text = readFileSync(entry, 'utf8');
    expect(text).not.toMatch(/\bfetch\s*\(|localStorage|sessionStorage|XMLHttpRequest/);
  });
});
