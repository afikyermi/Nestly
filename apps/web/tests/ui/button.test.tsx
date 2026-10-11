// UI wave 1 part b: criteria 17, 19, 21 (Button). Derived from .work/ui-wave-1/spec.md.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { MenuIcon } from '@/components/ui/icons';

describe('Button', () => {
  it('[21] defaults to type="button" and does not submit a surrounding form', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>המשך</Button>
      </form>,
    );
    const button = screen.getByRole('button', { name: 'המשך' });
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('[21] an explicit type="submit" is honoured', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">שליחה</Button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'שליחה' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['primary', {}],
    ['soft', { variant: 'soft' as const }],
    ['text', { variant: 'text' as const }],
    ['lg', { size: 'lg' as const }],
    ['block', { block: true }],
  ])('[21] variant/size %s renders a named button that calls its handler once', (_name, props) => {
    const onClick = vi.fn();
    render(
      <Button {...props} onClick={onClick}>
        המשך
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('[21] renders as a link element when given a link target', () => {
    render(<Button href="#welcome">התחלה</Button>);
    const link = screen.getByRole('link', { name: 'התחלה' });
    expect(link).toHaveAttribute('href', '#welcome');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('[21] disabled is inert: native disabled, handler never called', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        המשך
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'המשך' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('[21] hostile children render as text, not markup', () => {
    render(<Button>{'<img src=x onerror=alert(1)>'}</Button>);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('button')).toHaveTextContent('<img src=x onerror=alert(1)>');
  });

  describe('pending (DR-2)', () => {
    it('[21] keeps the label, sets aria-busy="true" and is not disabled', () => {
      render(<Button pending>שליחה</Button>);
      const button = screen.getByRole('button', { name: 'שליחה' });
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).not.toBeDisabled();
      expect(button).not.toHaveAttribute('disabled');
      expect(button).not.toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveTextContent('שליחה');
    });

    it('[21] renders a loader icon at the inline start (before the label in DOM order), hidden from AT', () => {
      render(<Button pending>שליחה</Button>);
      const button = screen.getByRole('button');
      const svg = button.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      const first = button.firstChild;
      expect(first === svg || (first instanceof Element && first.contains(svg))).toBe(true);
    });

    it('[21] shows no loader and no aria-busy when not pending', () => {
      render(<Button>שליחה</Button>);
      const button = screen.getByRole('button');
      expect(button).not.toHaveAttribute('aria-busy', 'true');
      expect(button.querySelector('svg')).toBeNull();
    });

    it('[21] stays focusable', () => {
      render(<Button pending>שליחה</Button>);
      const button = screen.getByRole('button');
      expect(button.tabIndex).toBeGreaterThanOrEqual(0);
      button.focus();
      expect(button).toHaveFocus();
    });

    it('[21] activation while pending does not call the handler (no double submit), however often', () => {
      const onClick = vi.fn();
      render(
        <Button pending onClick={onClick}>
          שליחה
        </Button>,
      );
      const button = screen.getByRole('button');
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('[21] a pending submit button does not submit its form', () => {
      const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
      render(
        <form onSubmit={onSubmit}>
          <Button type="submit" pending>
            שליחה
          </Button>
        </form>,
      );
      fireEvent.click(screen.getByRole('button'));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('[21] leaving pending restores activation; entering it blocks it again', () => {
      const onClick = vi.fn();
      const { rerender } = render(
        <Button pending onClick={onClick}>
          שליחה
        </Button>,
      );
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(0);
      rerender(<Button onClick={onClick}>שליחה</Button>);
      expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy', 'true');
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
      rerender(
        <Button pending onClick={onClick}>
          שליחה
        </Button>,
      );
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyboard reach (17)', () => {
    it('[17] enabled button and link are natively tabbable and activatable by Enter/Space', () => {
      render(
        <>
          <Button>כפתור</Button>
          <Button href="#x">קישור</Button>
        </>,
      );
      const button = screen.getByRole('button', { name: 'כפתור' });
      const link = screen.getByRole('link', { name: 'קישור' });
      // Native elements are activated by Enter (and Space for buttons) in a real browser;
      // the e2e suite presses the keys. Here: not removed from the tab order, and focusable.
      expect(button.tagName).toBe('BUTTON');
      expect(link.tagName).toBe('A');
      for (const el of [button, link]) {
        expect(el.tabIndex).toBeGreaterThanOrEqual(0);
        el.focus();
        expect(el).toHaveFocus();
      }
    });

    it('[17] disabled button is not reachable', () => {
      render(<Button disabled>המשך</Button>);
      const button = screen.getByRole('button');
      button.focus();
      expect(button).not.toHaveFocus();
    });
  });

  describe('icon-only (19)', () => {
    it('[19] takes its accessible name from the required label; the icon is hidden', () => {
      render(
        <Button iconOnly label="פתיחת התפריט">
          <MenuIcon />
        </Button>,
      );
      const button = screen.getByRole('button', { name: 'פתיחת התפריט' });
      expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
