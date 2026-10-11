// UI wave 1 part b: criteria 22 (Tooltip) and 19 (icon-only controls show a Tooltip with their name).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import { MenuIcon } from '@/components/ui/icons';
import { Tooltip } from '@/components/ui/tooltip';

const LABEL = 'שמירה';

const setup = () => {
  render(
    <Tooltip label={LABEL}>
      <Button variant="soft">טריגר</Button>
    </Tooltip>,
  );
  return screen.getByRole('button', { name: 'טריגר' });
};

const hover = (el: Element) => {
  fireEvent.pointerEnter(el, { pointerType: 'mouse' });
  fireEvent.pointerMove(el, { pointerType: 'mouse' });
};

describe('Tooltip', () => {
  it('[22] is closed until something opens it', () => {
    setup();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('[22] appears on focus', async () => {
    const trigger = setup();
    act(() => trigger.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(LABEL);
  });

  it('[22] appears on hover', async () => {
    const trigger = setup();
    hover(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(LABEL);
  });

  it('[22] closes on Escape', async () => {
    const trigger = setup();
    act(() => trigger.focus());
    await screen.findByRole('tooltip');
    fireEvent.keyDown(trigger, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('[22] closes on blur', async () => {
    const trigger = setup();
    act(() => trigger.focus());
    await screen.findByRole('tooltip');
    act(() => trigger.blur());
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('[22] stays open while the pointer rests on the trigger (WCAG 1.4.13 persistent)', async () => {
    const trigger = setup();
    hover(trigger);
    await screen.findByRole('tooltip');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('[22] stays open when the pointer moves from the trigger onto the tooltip (WCAG 1.4.13 hoverable)', async () => {
    const trigger = setup();
    hover(trigger);
    const tip = await screen.findByRole('tooltip');
    const content = tip.closest('[data-state]') ?? tip;
    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    hover(content);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('[22] a hover-opened tooltip still closes on Escape', async () => {
    const trigger = setup();
    hover(trigger);
    await screen.findByRole('tooltip');
    fireEvent.keyDown(trigger, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });
});

describe('icon-only control (19)', () => {
  const iconOnly = () => {
    render(
      <Button iconOnly label="פתיחת התפריט">
        <MenuIcon />
      </Button>,
    );
    return screen.getByRole('button', { name: 'פתיחת התפריט' });
  };

  it('[19] shows a Tooltip carrying its name on focus', async () => {
    const trigger = iconOnly();
    act(() => trigger.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent('פתיחת התפריט');
  });

  it('[19] shows a Tooltip carrying its name on hover', async () => {
    const trigger = iconOnly();
    hover(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('פתיחת התפריט');
  });
});
