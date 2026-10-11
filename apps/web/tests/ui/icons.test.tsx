// UI wave 1 part b: criterion 24 (Icon module). Derived from .work/ui-wave-1/spec.md.
import { render } from '@testing-library/react';
import { createElement } from 'react';
import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';
import * as icons from '@/components/ui/icons';

type IconComponent = ComponentType<{ className?: string }>;

// Every export of the module is an icon component (a function or a forwardRef/memo object).
const isComponent = (value: unknown): value is IconComponent =>
  typeof value === 'function' || (typeof value === 'object' && value !== null && '$$typeof' in value);

const iconEntries: [string, IconComponent][] = [];
for (const [name, value] of Object.entries<unknown>(icons)) {
  if (isComponent(value)) iconEntries.push([name, value]);
}

describe('Icon module', () => {
  it('[24] exports icons, including the nest icon', () => {
    expect(iconEntries.length).toBeGreaterThan(0);
    expect(iconEntries.some(([name]) => /nest/i.test(name))).toBe(true);
  });

  it.each(iconEntries)('[24] %s renders stroke-width="1.75" and aria-hidden="true"', (_name, Icon) => {
    const { container } = render(createElement(Icon));
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('stroke-width', '1.75');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(iconEntries)('[24] %s keeps stroke-width and aria-hidden when given a className', (_name, Icon) => {
    const { container } = render(createElement(Icon, { className: 'size-5' }));
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('stroke-width', '1.75');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
