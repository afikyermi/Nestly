// UI wave 1 part e: criteria 34 (Logo, illustrations), 35 (AuthLayout), 36 (Avatar), 37 (MenuItem), with 17.
// Derived from .work/ui-wave-1/spec.md (criteria + API + addenda) only.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthLayout } from '@/components/layout/auth-layout';
import { RegistrationIllustration, WelcomeIllustration } from '@/components/shared/illustrations';
import { Logo } from '@/components/shared/logo';
import { MenuItem } from '@/components/shared/menu-item';
import { Avatar } from '@/components/ui/avatar';

afterEach(() => vi.restoreAllMocks());

/** A simple accessible-name computation: aria-label, else the text left after dropping aria-hidden parts. */
const nameOf = (el: Element): string => {
  const label = el.getAttribute('aria-label');
  if (label !== null && label !== '') return label;
  const holder = document.createElement("div");
  holder.append(el.cloneNode(true));
  for (const hidden of Array.from(holder.querySelectorAll('[aria-hidden="true"]'))) hidden.remove();
  return (holder.textContent ?? '').trim();
};

/** Elements of the container that expose an accessible name (not hidden from assistive technology). */
const namedElements = (container: HTMLElement): Element[] =>
  Array.from(container.querySelectorAll('*')).filter((el) => {
    if (el.closest('[aria-hidden="true"]')) return false;
    return el.matches('a, button, img, [role]') && nameOf(el) !== '';
  });

describe('Logo (34)', () => {
  it('[34] as a link: role link, accessible name exactly "Nestly", href kept', () => {
    render(<Logo href="/welcome" />);
    const link = screen.getByRole('link', { name: 'Nestly' });
    expect(link).toHaveAttribute('href', '/welcome');
    expect(nameOf(link)).toBe('Nestly');
  });

  it('[34] static: no link, no button, and the name "Nestly" is exposed, never doubled', () => {
    const { container } = render(<Logo />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    const names = namedElements(container).map((el) => nameOf(el));
    expect(names).toContain('Nestly');
    expect(names.every((n) => n === 'Nestly')).toBe(true);
    const text = (container.textContent ?? '').replace(/\s/g, '');
    expect(text.split('Nestly').length - 1).toBeLessThanOrEqual(1);
  });

  it('[34] the link name is "Nestly" for both sizes', () => {
    const { rerender } = render(<Logo href="/" size="default" />);
    expect(screen.getByRole('link', { name: 'Nestly' })).toBeInTheDocument();
    rerender(<Logo href="/" size="big" />);
    expect(screen.getByRole('link', { name: 'Nestly' })).toBeInTheDocument();
  });

  it('[34] sizes default and big render differently; omitting size equals "default"', () => {
    const big = render(<Logo size="big" />).container.innerHTML;
    const def = render(<Logo size="default" />).container.innerHTML;
    const omitted = render(<Logo />).container.innerHTML;
    expect(big).not.toBe(def);
    expect(omitted).toBe(def);
  });

  it('[34] className is applied to the rendered logo (static and link)', () => {
    const a = render(<Logo className="probe-x" />).container;
    expect(a.querySelector('.probe-x')).not.toBeNull();
    const b = render(<Logo href="/" className="probe-y" />).container;
    expect(b.querySelector('.probe-y')).not.toBeNull();
  });

  it('[34] the wordmark comes from one module: replacing logo-wordmark replaces what Logo draws', async () => {
    vi.resetModules();
    vi.doMock('@/components/shared/logo-wordmark', async (importOriginal) => {
      const original = await importOriginal<Record<string, unknown>>();
      const replaced: Record<string, unknown> = {};
      for (const key of Object.keys(original)) {
        replaced[key] =
          typeof original[key] === 'function' ? () => <span data-testid="swapped-wordmark" /> : original[key];
      }
      return replaced;
    });
    const { Logo: FreshLogo } = await import('@/components/shared/logo');
    render(<FreshLogo href="/" />);
    vi.doUnmock('@/components/shared/logo-wordmark');
    expect(screen.getByTestId('swapped-wordmark')).toBeInTheDocument();
  });

  it('[17] the link logo is reached by Tab and Enter activates it (a native link click)', async () => {
    const user = userEvent.setup();
    const { container } = render(<Logo href="/welcome" />);
    const onClick = vi.fn((e: Event) => e.preventDefault());
    container.addEventListener('click', onClick);
    await user.tab();
    expect(screen.getByRole('link', { name: 'Nestly' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('[17] the static logo is not a tab stop', async () => {
    const user = userEvent.setup();
    render(<Logo />);
    await user.tab();
    expect(document.body).toHaveFocus();
  });
});

describe('Illustrations (34)', () => {
  const HEX = /#[0-9a-fA-F]{3,8}\b/;
  for (const [name, Illustration] of [
    ['WelcomeIllustration', WelcomeIllustration],
    ['RegistrationIllustration', RegistrationIllustration],
  ] as const) {
    it(`[34] ${name}: aria-hidden, no accessible name, nothing for a screen reader`, () => {
      const { container } = render(<Illustration />);
      const root = container.firstElementChild;
      expect(root).not.toBeNull();
      expect(root).toHaveAttribute('aria-hidden', 'true');
      expect(container.querySelector('title, desc, [aria-label], [aria-labelledby], [role="img"]')).toBeNull();
      expect(screen.queryByRole('img')).toBeNull();
      expect(container.querySelector('a, button, input, [tabindex]')).toBeNull();
    });

    it(`[34] ${name}: no hex colour in any attribute or style of the rendered SVG`, () => {
      const { container } = render(<Illustration />);
      expect(container.querySelector('svg')).not.toBeNull();
      const offenders: string[] = [];
      for (const el of Array.from(container.querySelectorAll('*'))) {
        for (const attr of Array.from(el.attributes)) {
          if (attr.name === 'id' || attr.name === 'href' || attr.name === 'xlink:href') continue;
          if (HEX.test(attr.value)) offenders.push(`${el.tagName}[${attr.name}=${attr.value}]`);
        }
      }
      expect(offenders).toEqual([]);
    });

    it(`[34] ${name}: fills and strokes are token variables, currentColor, none or a reference`, () => {
      const { container } = render(<Illustration />);
      const allowed = /^(none|currentColor|inherit|url\(.+\)|var\(--[\w-]+(,.*)?\))$/;
      const bad: string[] = [];
      for (const el of Array.from(container.querySelectorAll('*'))) {
        for (const prop of ['fill', 'stroke', 'stop-color', 'color']) {
          const v = el.getAttribute(prop);
          if (v !== null && !allowed.test(v.trim())) bad.push(`${el.tagName}[${prop}=${v}]`);
        }
        const style = el.getAttribute('style') ?? '';
        if (/rgb\(|rgba\(|hsl\(|#[0-9a-f]{3}/i.test(style)) bad.push(`${el.tagName}[style=${style}]`);
      }
      expect(bad).toEqual([]);
    });

    it(`[34] ${name}: className lands on the illustration`, () => {
      const { container } = render(<Illustration className="probe-z" />);
      expect(container.querySelector('.probe-z')).not.toBeNull();
    });
  }
});

describe('AuthLayout (35)', () => {
  it('[35] renders back slot, body and actions, in that document order', () => {
    render(
      <AuthLayout back={<button type="button">חזרה</button>} actions={<button type="button">המשך</button>}>
        <p>גוף הטופס</p>
      </AuthLayout>,
    );
    const back = screen.getByRole('button', { name: 'חזרה' });
    const body = screen.getByText('גוף הטופס');
    const actions = screen.getByRole('button', { name: 'המשך' });
    expect(back.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(body.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('[35] back and actions are optional: the body alone renders with no stray controls', () => {
    const { container } = render(
      <AuthLayout>
        <p>רק גוף</p>
      </AuthLayout>,
    );
    expect(screen.getByText('רק גוף')).toBeInTheDocument();
    expect(container.querySelector('button, a, input')).toBeNull();
  });

  it('[35] it adds no landmark of its own (the page supplies main)', () => {
    const { container } = render(
      <AuthLayout back={<span>b</span>} actions={<span>a</span>}>
        <p>x</p>
      </AuthLayout>,
    );
    expect(container.querySelector('main, header, footer, nav, aside, section, form, [role]')).toBeNull();
    for (const role of ['main', 'banner', 'contentinfo', 'navigation', 'complementary', 'region', 'form']) {
      expect(screen.queryByRole(role)).toBeNull();
    }
  });

  it('[35] slot content keeps its behaviour: events fire, tab order follows the document order', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onGo = vi.fn();
    render(
      <AuthLayout
        back={
          <button type="button" onClick={onBack}>
            חזרה
          </button>
        }
        actions={
          <button type="button" onClick={onGo}>
            המשך
          </button>
        }
      >
        <input aria-label="שדה" />
      </AuthLayout>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'חזרה' })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('שדה')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'המשך' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('[35] a very long unbroken body string does not drop the actions', () => {
    render(
      <AuthLayout actions={<button type="button">המשך</button>}>
        <p>{'א'.repeat(5000)}</p>
      </AuthLayout>,
    );
    expect(screen.getByRole('button', { name: 'המשך' })).toBeInTheDocument();
  });
});

describe('Avatar (36)', () => {
  const shows = (container: HTMLElement, text: string) => (container.textContent ?? '').trim() === text;

  it('[36] "נועה רז" shows "נר"', () => {
    const { container } = render(<Avatar name="נועה רז" decorative />);
    expect(shows(container, 'נר')).toBe(true);
  });

  it('[36] three words use the first two only', () => {
    const { container } = render(<Avatar name="נועה בן רז" decorative />);
    expect(shows(container, 'נב')).toBe(true);
  });

  it('[36] one word gives one letter', () => {
    const { container } = render(<Avatar name="נועה" decorative />);
    expect(shows(container, 'נ')).toBe(true);
  });

  it('[36] extra whitespace around and between words is ignored', () => {
    const { container } = render(<Avatar name="   נועה    רז  " decorative />);
    expect(shows(container, 'נר')).toBe(true);
  });

  it('[36] Latin names work the same way (case not specified)', () => {
    const { container } = render(<Avatar name="jane doe" decorative />);
    expect((container.textContent ?? '').trim()).toMatch(/^jd$/i);
  });

  it('[36] a first letter outside the BMP is not cut into a lone surrogate', () => {
    const { container } = render(<Avatar name="𠀀𠀁 רז" decorative />);
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(container.textContent ?? '').not.toMatch(lone);
  });

  for (const [label, name] of [
    ['empty', ''],
    ['whitespace only', '   '],
    ['absent', undefined],
  ] as const) {
    it(`[36] ${label} name: no initials, a generic person icon (an svg, aria-hidden) instead`, () => {
      const { container } = render(name === undefined ? <Avatar decorative /> : <Avatar name={name} decorative />);
      expect((container.textContent ?? '').trim()).toBe('');
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.closest('[aria-hidden="true"]')).not.toBeNull();
    });
  }

  it('[36] decorative: hidden from assistive technology, no name, even when a label is also passed', () => {
    const { container } = render(<Avatar name="נועה רז" label="תמונת פרופיל" decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByLabelText('נועה רז')).toBeNull();
    expect(screen.queryByLabelText('תמונת פרופיל')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('[36] not decorative with a name: the accessible name is the name', () => {
    render(<Avatar name="נועה רז" />);
    expect(screen.getByRole('img', { name: 'נועה רז' })).toBeInTheDocument();
  });

  it('[36] not decorative, name and label both given: the name wins (API: name when not decorative)', () => {
    render(<Avatar name="נועה רז" label="תמונת פרופיל" />);
    expect(screen.getByRole('img', { name: 'נועה רז' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'תמונת פרופיל' })).toBeNull();
  });

  it('[36] not decorative, name empty: named by label (API line, Avatar)', () => {
    render(<Avatar name="" label="חשבון" />);
    expect(screen.getByRole('img', { name: 'חשבון' })).toBeInTheDocument();
  });

  it('[36] not decorative, name absent: named by label', () => {
    render(<Avatar label="חשבון" />);
    expect(screen.getByRole('img', { name: 'חשבון' })).toBeInTheDocument();
  });

  it('[36] the avatar is not a tab stop (it is not interactive)', async () => {
    const user = userEvent.setup();
    render(<Avatar name="נועה רז" />);
    await user.tab();
    expect(document.body).toHaveFocus();
  });
});

describe('MenuItem (37)', () => {
  it('[37] href renders a link named by its children, and no button', () => {
    render(<MenuItem href="/settings">הגדרות</MenuItem>);
    const link = screen.getByRole('link', { name: 'הגדרות' });
    expect(link).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('[37] onClick renders a button named by its children, and no link; click calls the action once', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<MenuItem onClick={onClick}>יציאה</MenuItem>);
    expect(screen.queryByRole('link')).toBeNull();
    const button = screen.getByRole('button', { name: 'יציאה' });
    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('[37] the icon slot renders and adds nothing to the accessible name', () => {
    render(
      <MenuItem href="/s" icon={<svg data-testid="ic" viewBox="0 0 1 1" />}>
        הגדרות
      </MenuItem>,
    );
    expect(screen.getByTestId('ic')).toBeInTheDocument();
    expect(nameOf(screen.getByRole('link'))).toBe('הגדרות');
  });

  it('[37] disabled button: aria-disabled="true"; click, Enter and Space do not call the action', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <MenuItem onClick={onClick} disabled>
        יציאה
      </MenuItem>,
    );
    const button = screen.getByRole('button', { name: 'יציאה' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    fireEvent.click(button);
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('[37] disabled link: aria-disabled="true" and activation does not navigate', async () => {
    const user = userEvent.setup();
    render(
      <MenuItem href="/settings" disabled>
        הגדרות
      </MenuItem>,
    );
    const link = screen.getByRole('link', { name: 'הגדרות' });
    expect(link).toHaveAttribute('aria-disabled', 'true');
    const hasHref = link.hasAttribute('href') && link.getAttribute('href') !== '';
    // Not navigable: either no usable href, or the click is cancelled (default prevented).
    const proceeded = fireEvent.click(link);
    expect(!hasHref || proceeded === false).toBe(true);
    const prevented: boolean[] = [];
    // React handles clicks at its root, so observe from the document (after the handler ran).
    document.addEventListener('click', (e) => prevented.push(e.defaultPrevented));
    link.focus();
    await user.keyboard('{Enter}');
    expect(!hasHref || prevented.every(Boolean)).toBe(true);
  });

  it('[37] enabled items do not carry aria-disabled="true"', () => {
    render(
      <>
        <MenuItem href="/a">א</MenuItem>
        <MenuItem onClick={() => undefined}>ב</MenuItem>
      </>,
    );
    for (const el of [screen.getByRole('link'), screen.getByRole('button')]) {
      expect(el).not.toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('[17] button item: Tab reaches it, Enter and Space each activate it once', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<MenuItem onClick={onClick}>יציאה</MenuItem>);
    await user.tab();
    expect(screen.getByRole('button', { name: 'יציאה' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('[17] link item: Tab reaches it and Enter activates it (a native link click)', async () => {
    const user = userEvent.setup();
    const { container } = render(<MenuItem href="/settings">הגדרות</MenuItem>);
    const seen = vi.fn((e: Event) => e.preventDefault());
    container.addEventListener('click', seen);
    await user.tab();
    expect(screen.getByRole('link', { name: 'הגדרות' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('[37] a very long label is kept whole in the accessible name', () => {
    const long = 'ארוך '.repeat(200).trim();
    render(<MenuItem href="/x">{long}</MenuItem>);
    expect(screen.getByRole('link', { name: long })).toBeInTheDocument();
  });
});
