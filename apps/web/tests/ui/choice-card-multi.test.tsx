// F1.3 pass b, criterion 6 [AC-089 · VAL-039]: the multi-select mode of ChoiceCardGroup.
// Derived from .work/register-profile-step/spec.md criterion 6 and the interface given for pass b.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceCardGroup } from '@/components/shared/choice-card-group';

const OPTIONS = [
  { value: 'planning', label: 'מתכננים' },
  { value: 'pregnant', label: 'בהריון' },
  { value: 'has_child', label: 'יש לנו ילד או ילדה' },
];
const PAIRS = [['planning', 'pregnant']] as const;

function Harness({ initial = [], onSeen, error = false }: { initial?: string[]; onSeen?: (v: string[]) => void; error?: boolean }) {
  const [values, setValues] = useState<string[]>(initial);
  return (
    <>
      <ChoiceCardGroup
        multiple
        legend="השלב במסע"
        name="stage"
        options={OPTIONS}
        values={values}
        exclusivePairs={PAIRS}
        error={error}
        aria-describedby="stage-error"
        onChange={(v) => {
          onSeen?.(v);
          setValues(v);
        }}
      />
      <p id="stage-error">יש לבחור לפחות אפשרות אחת</p>
    </>
  );
}

const box = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) });
const checkedNow = () =>
  screen
    .getAllByRole('checkbox')
    .filter((c) => c instanceof HTMLInputElement && c.checked)
    .map((c) => c.getAttribute('value'));

describe('F1.3 criterion 6 [AC-089 · VAL-039] ChoiceCardGroup multi-select', () => {
  it('[AC-089] a fieldset named by the legend with three native checkboxes in order, no radiogroup; Tab reaches each, Space toggles', async () => {
    const seen = vi.fn();
    const { container } = render(<Harness onSeen={seen} />);
    const group = screen.getByRole('group', { name: 'השלב במסע' });
    expect(group.tagName).toBe('FIELDSET');
    expect(container.querySelector('fieldset > legend')).toHaveTextContent('השלב במסע');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    for (const b of boxes) {
      expect(b.tagName).toBe('INPUT');
      expect(b).toHaveAttribute('type', 'checkbox');
    }
    expect(boxes.map((b) => b.getAttribute('value'))).toEqual(['planning', 'pregnant', 'has_child']);

    // Tab reaches each card in order; Space toggles the focused one.
    await userEvent.tab();
    expect(boxes[0]).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(boxes[0]).toBeChecked();
    await userEvent.tab();
    expect(boxes[1]).toHaveFocus();
    await userEvent.tab();
    expect(boxes[2]).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(boxes[2]).toBeChecked();
    await userEvent.keyboard(' ');
    expect(boxes[2]).not.toBeChecked();
    // onChange returns values in option order
    expect(seen).toHaveBeenLastCalledWith(['planning']);
  });

  it('[VAL-039] the exclusive pair: ticking one unticks the other (both ways); has_child combines with either; the DOM never holds both checked', async () => {
    const seen = vi.fn();
    render(<Harness onSeen={seen} />);
    const both = () => {
      const now = checkedNow();
      return now.includes('planning') && now.includes('pregnant');
    };

    await userEvent.click(box('מתכננים'));
    expect(checkedNow()).toEqual(['planning']);
    await userEvent.click(box('בהריון'));
    expect(checkedNow()).toEqual(['pregnant']);
    expect(seen).toHaveBeenLastCalledWith(['pregnant']);
    expect(both()).toBe(false);

    await userEvent.click(box('מתכננים'));
    expect(checkedNow()).toEqual(['planning']);
    expect(both()).toBe(false);

    await userEvent.click(box('יש לנו ילד או ילדה'));
    expect(checkedNow()).toEqual(['planning', 'has_child']);
    expect(seen).toHaveBeenLastCalledWith(['planning', 'has_child']); // option order
    await userEvent.click(box('בהריון'));
    expect(checkedNow()).toEqual(['pregnant', 'has_child']);
    expect(seen).toHaveBeenLastCalledWith(['pregnant', 'has_child']);
    expect(both()).toBe(false);

    // Untick works and leaves the rest.
    await userEvent.click(box('בהריון'));
    expect(checkedNow()).toEqual(['has_child']);
  });

  it('[AC-089] with error: aria-invalid on each checkbox, aria-describedby on the fieldset; without error neither invalid', () => {
    const { rerender } = render(<Harness error />);
    for (const b of screen.getAllByRole('checkbox')) expect(b).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('group', { name: 'השלב במסע' })).toHaveAttribute('aria-describedby', 'stage-error');
    rerender(<Harness error={false} />);
    for (const b of screen.getAllByRole('checkbox')) expect(b).not.toHaveAttribute('aria-invalid', 'true');
  });
});
