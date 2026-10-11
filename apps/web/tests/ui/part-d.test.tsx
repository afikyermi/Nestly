// UI wave 1 part d: criteria 29 (DateInput), 30 (ChoiceCardGroup), 31 (StepIndicator), 32 (Checkbox),
// 33 (InlineAlert), with 17 (keyboard). Derived from .work/ui-wave-1/spec.md (criteria + API + addenda) only.
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChoiceCardGroup } from '@/components/shared/choice-card-group';
import { DateInput } from '@/components/shared/date-input';
import type { DateParts } from '@/components/shared/date-input';
import { InlineAlert } from '@/components/shared/inline-alert';
import { StepIndicator } from '@/components/shared/step-indicator';
import { FormField } from '@/components/shared/form-field';
import { Checkbox } from '@/components/ui/checkbox';

afterEach(() => vi.restoreAllMocks());

const EMPTY: DateParts = { day: '', month: '', year: '' };
const FIELD_NAMES = ['יום', 'חודש', 'שנה'];

/** A controlled DateInput that records every emitted value. */
function ControlledDate({ onSeen, initial = EMPTY }: { onSeen: (v: DateParts) => void; initial?: DateParts }) {
  const [value, setValue] = useState<DateParts>(initial);
  return (
    <DateInput
      legend="תאריך לידה"
      value={value}
      onChange={(v) => {
        onSeen(v);
        setValue(v);
      }}
    />
  );
}

describe('DateInput (29)', () => {
  it('[29] a fieldset group named by the legend holds three fields named יום, חודש, שנה', () => {
    const { container } = render(<DateInput legend="תאריך לידה" />);
    const group = screen.getByRole('group', { name: 'תאריך לידה' });
    expect(group.tagName).toBe('FIELDSET');
    expect(container.querySelector('fieldset > legend')).toHaveTextContent('תאריך לידה');
    for (const name of FIELD_NAMES) {
      expect(within(group).getByLabelText(name)).toBeInTheDocument();
    }
    expect(group.querySelectorAll('input')).toHaveLength(3);
  });

  it('[29] each field has a numeric inputMode', () => {
    render(<DateInput legend="תאריך לידה" />);
    for (const name of FIELD_NAMES) {
      expect(screen.getByLabelText(name)).toHaveAttribute('inputmode', 'numeric');
    }
  });

  it('[29] empty: all three fields are empty and not aria-invalid', () => {
    render(<DateInput legend="תאריך לידה" />);
    for (const name of FIELD_NAMES) {
      expect(screen.getByLabelText(name)).toHaveDisplayValue('');
      expect(screen.getByLabelText(name)).not.toHaveAttribute('aria-invalid', 'true');
    }
  });

  it('[29] filled: the value prop is shown in the matching fields', () => {
    render(<DateInput legend="תאריך לידה" value={{ day: '07', month: '11', year: '2024' }} />);
    expect(screen.getByLabelText('יום')).toHaveDisplayValue('07');
    expect(screen.getByLabelText('חודש')).toHaveDisplayValue('11');
    expect(screen.getByLabelText('שנה')).toHaveDisplayValue('2024');
  });

  it('[29] typing emits {day, month, year} as strings, only the typed part changes', async () => {
    const seen = vi.fn();
    render(<ControlledDate onSeen={seen} />);
    await userEvent.type(screen.getByLabelText('יום'), '15');
    expect(seen).toHaveBeenLastCalledWith({ day: '15', month: '', year: '' });
    await userEvent.type(screen.getByLabelText('חודש'), '03');
    expect(seen).toHaveBeenLastCalledWith({ day: '15', month: '03', year: '' });
    await userEvent.type(screen.getByLabelText('שנה'), '2024');
    const last: unknown = seen.mock.lastCall?.[0];
    expect(last).toEqual({ day: '15', month: '03', year: '2024' });
    expect(Object.values(last ?? {}).every((v) => typeof v === 'string')).toBe(true);
  });

  it('[29] it does not validate ranges: 99 / 13 / 0000 are emitted exactly as typed, with no error shown', async () => {
    const seen = vi.fn();
    render(<ControlledDate onSeen={seen} />);
    await userEvent.type(screen.getByLabelText('יום'), '99');
    await userEvent.type(screen.getByLabelText('חודש'), '13');
    await userEvent.type(screen.getByLabelText('שנה'), '0000');
    expect(seen).toHaveBeenLastCalledWith({ day: '99', month: '13', year: '0000' });
    for (const name of FIELD_NAMES) {
      expect(screen.getByLabelText(name)).not.toHaveAttribute('aria-invalid', 'true');
    }
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('[29] error sets aria-invalid="true" on every field; without error it does not', () => {
    const { rerender } = render(<DateInput legend="תאריך לידה" error />);
    for (const name of FIELD_NAMES) {
      expect(screen.getByLabelText(name)).toHaveAttribute('aria-invalid', 'true');
    }
    rerender(<DateInput legend="תאריך לידה" />);
    for (const name of FIELD_NAMES) {
      expect(screen.getByLabelText(name)).not.toHaveAttribute('aria-invalid', 'true');
    }
  });

  it('[29] disabled disables all three fields and accepts no typing', async () => {
    const onChange = vi.fn();
    render(<DateInput legend="תאריך לידה" disabled onChange={onChange} />);
    for (const name of FIELD_NAMES) expect(screen.getByLabelText(name)).toBeDisabled();
    await userEvent.type(screen.getByLabelText('יום'), '1');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('[17][29] Tab visits the three fields, one stop each', async () => {
    render(<DateInput legend="תאריך לידה" />);
    const order: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await userEvent.tab();
      order.push(document.activeElement?.id ?? '?');
    }
    const ids = FIELD_NAMES.map((n) => screen.getByLabelText(n).id);
    expect([...order].sort()).toEqual([...ids].sort());
    expect(new Set(order).size).toBe(3);
  });

  it('[29] two instances with different idPrefix have no duplicate ids', () => {
    const { container } = render(
      <>
        <DateInput legend="א" idPrefix="a" />
        <DateInput legend="ב" idPrefix="b" />
      </>,
    );
    const ids = Array.from(container.querySelectorAll('[id]')).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getAllByLabelText('יום')).toHaveLength(2);
  });

  it('[29] a very long pasted value is passed through as a string, not crashed on', () => {
    const seen = vi.fn();
    render(<ControlledDate onSeen={seen} />);
    fireEvent.change(screen.getByLabelText('שנה'), { target: { value: '9'.repeat(500) } });
    expect(seen).toHaveBeenCalled();
    const last: unknown = seen.mock.lastCall?.[0];
    expect(last).toEqual({ day: '', month: '', year: '9'.repeat(500) });
  });
});

const OPTIONS = [
  { value: 'pregnant', label: 'בהריון' },
  { value: 'newborn', label: 'יילוד', description: 'עד חצי שנה' },
  { value: 'toddler', label: 'פעוט' },
];

function ControlledChoice({ onSeen, initial = null }: { onSeen?: (v: string) => void; initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <ChoiceCardGroup
      legend="באיזה שלב אתם?"
      name="stage"
      options={OPTIONS}
      value={value}
      onChange={(v) => {
        onSeen?.(v);
        setValue(v);
      }}
    />
  );
}

describe('ChoiceCardGroup (30)', () => {
  it('[30] a fieldset group named by the legend holds one radio per option, all sharing the name', () => {
    const { container } = render(<ChoiceCardGroup legend="באיזה שלב אתם?" name="stage" options={OPTIONS} />);
    const group = screen.getByRole('radiogroup', { name: 'באיזה שלב אתם?' });
    expect(group.tagName).toBe('FIELDSET');
    expect(container.querySelector('fieldset > legend')).toHaveTextContent('באיזה שלב אתם?');
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const r of radios) expect(r).toHaveAttribute('name', 'stage');
    for (const o of OPTIONS) {
      expect(within(group).getByRole('radio', { name: new RegExp(o.label) })).toBeInTheDocument();
    }
  });

  it('[30] a description is rendered as text next to its option', () => {
    render(<ChoiceCardGroup legend="ל" name="stage" options={OPTIONS} />);
    expect(screen.getByText('עד חצי שנה')).toBeVisible();
  });

  // The "✓ mark" may be the glyph or an icon (SPEC says "✓ mark"); either way it exists only on the selected card.
  const marks = (root: HTMLElement) => (root.textContent?.match(/✓/g) ?? []).length + root.querySelectorAll('svg').length;

  it('[30] unselected (null and absent value): no radio is checked and no ✓ mark', () => {
    const { rerender, container } = render(<ChoiceCardGroup legend="ל" name="s" options={OPTIONS} value={null} />);
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
    expect(marks(container)).toBe(0);
    rerender(<ChoiceCardGroup legend="ל" name="s" options={OPTIONS} />);
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
    expect(marks(container)).toBe(0);
  });

  it('[30] selected: exactly that radio is checked and exactly one ✓ mark shows', () => {
    const { container } = render(<ChoiceCardGroup legend="ל" name="s" options={OPTIONS} value="newborn" />);
    const checked = screen.getAllByRole('radio', { checked: true });
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAccessibleName(/יילוד/);
    expect(marks(container)).toBe(1);
  });

  it('[30] the ✓ glyph is not part of the radio accessible name (the checked state is announced by the radio)', () => {
    render(<ChoiceCardGroup legend="ל" name="s" options={OPTIONS} value="newborn" />);
    expect(screen.getByRole('radio', { checked: true })).toHaveAccessibleName(expect.not.stringContaining('✓'));
  });

  it('[30] at most one option is selected: a value that matches no option selects none', () => {
    render(<ChoiceCardGroup legend="ל" name="s" options={OPTIONS} value="nope" />);
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
  });

  it('[30] clicking an option emits its value; clicking another moves the selection (never two)', async () => {
    const seen = vi.fn();
    render(<ControlledChoice onSeen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /בהריון/ }));
    expect(seen).toHaveBeenLastCalledWith('pregnant');
    await userEvent.click(screen.getByRole('radio', { name: /פעוט/ }));
    expect(seen).toHaveBeenLastCalledWith('toddler');
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
    expect(screen.getByRole('radio', { checked: true })).toHaveAccessibleName(/פעוט/);
  });

  it('[17][30] keyboard: Tab enters the group on the selected card; ArrowDown / ArrowUp move the selection', async () => {
    const seen = vi.fn();
    render(<ControlledChoice onSeen={seen} initial="pregnant" />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: /בהריון/ })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(seen).toHaveBeenLastCalledWith('newborn');
    expect(screen.getByRole('radio', { checked: true })).toHaveAccessibleName(/יילוד/);
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('radio', { checked: true })).toHaveAccessibleName(/בהריון/);
  });

  it('[30] error: the radios stay a group of radios, nothing is selected by the error alone', () => {
    render(<ChoiceCardGroup legend="ל" name="s" options={OPTIONS} error />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
  });

  it('[30] disabled disables every radio and emits nothing', async () => {
    const onChange = vi.fn();
    render(<ChoiceCardGroup legend="ל" name="s" options={OPTIONS} disabled onChange={onChange} />);
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled();
    await userEvent.click(screen.getByText('בהריון'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('[30] zero options renders the group with no radio and does not crash; one option works', () => {
    const { rerender } = render(<ChoiceCardGroup legend="ל" name="s" options={[]} />);
    expect(screen.getByRole('radiogroup', { name: 'ל' })).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    rerender(<ChoiceCardGroup legend="ל" name="s" options={[{ value: 'pregnant', label: 'בהריון' }]} value="pregnant" />);
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });
});

describe('StepIndicator (31)', () => {
  it('[31] (1,2) renders the text "שלב 1 מתוך 2"', () => {
    render(<StepIndicator current={1} total={2} />);
    expect(screen.getByText('שלב 1 מתוך 2')).toBeInTheDocument();
  });

  it('[31] (2,2) renders "שלב 2 מתוך 2"', () => {
    render(<StepIndicator current={2} total={2} />);
    expect(screen.getByText('שלב 2 מתוך 2')).toBeInTheDocument();
  });

  it('[31] the bar is aria-hidden and carries no text; the text is not hidden', () => {
    const { container } = render(<StepIndicator current={1} total={2} />);
    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden, 'a bar with aria-hidden="true"').not.toBeNull();
    expect(hidden?.textContent ?? '').toBe('');
    expect(screen.getByText('שלב 1 מתוך 2').closest('[aria-hidden="true"]')).toBeNull();
  });

  it('[31] the bar is not a progressbar role (the text carries the information once)', () => {
    render(<StepIndicator current={1} total={2} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('[31] boundary: (1,1) and (3,5) are valid', () => {
    const { rerender } = render(<StepIndicator current={1} total={1} />);
    expect(screen.getByText('שלב 1 מתוך 1')).toBeInTheDocument();
    rerender(<StepIndicator current={3} total={5} />);
    expect(screen.getByText('שלב 3 מתוך 5')).toBeInTheDocument();
  });

  it.each([
    [0, 2],
    [-1, 2],
    [3, 2],
    [1, 0],
    [0, 0],
    [1, -3],
  ])('[31] (%i,%i) throws RangeError', (current, total) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<StepIndicator current={current} total={total} />)).toThrow(RangeError);
  });
});

describe('Checkbox (32)', () => {
  it('[32] unchecked and checked states, with the label as the accessible name', () => {
    const { rerender } = render(<Checkbox checked={false}>אני מסכים</Checkbox>);
    expect(screen.getByRole('checkbox', { name: 'אני מסכים' })).not.toBeChecked();
    rerender(<Checkbox checked>אני מסכים</Checkbox>);
    expect(screen.getByRole('checkbox', { name: 'אני מסכים' })).toBeChecked();
  });

  it('[32] defaultChecked starts checked', () => {
    render(<Checkbox defaultChecked>אני מסכים</Checkbox>);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('[32] the label may contain links, which are reachable as links and part of the name', () => {
    render(
      <Checkbox>
        אני מסכים ל<a href="/terms">תנאי השימוש</a> ול<a href="/privacy">מדיניות הפרטיות</a>
      </Checkbox>,
    );
    expect(screen.getByRole('link', { name: 'תנאי השימוש' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'מדיניות הפרטיות' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('checkbox')).toHaveAccessibleName(expect.stringContaining('תנאי השימוש'));
  });

  it('[32] clicking a link in the label does not toggle the checkbox', async () => {
    const onCheckedChange = vi.fn();
    const stop = (e: Event) => e.preventDefault(); // jsdom does not navigate; keep the click inert
    document.addEventListener('click', stop);
    render(
      <Checkbox onCheckedChange={onCheckedChange}>
        אני מסכים ל<a href="/terms">תנאי השימוש</a>
      </Checkbox>,
    );
    await userEvent.click(screen.getByRole('link', { name: 'תנאי השימוש' }));
    document.removeEventListener('click', stop);
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('[17][32] Tab reaches it and Space toggles it on and off, reporting the new state', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox onCheckedChange={onCheckedChange}>אני מסכים</Checkbox>);
    await userEvent.tab();
    expect(screen.getByRole('checkbox')).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('checkbox')).toBeChecked();
    await userEvent.keyboard(' ');
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it('[32] clicking the label text toggles it', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox onCheckedChange={onCheckedChange}>אני מסכים</Checkbox>);
    await userEvent.click(screen.getByText('אני מסכים'));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
  });

  it('[32] controlled: checked stays as given until the parent changes it', async () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox checked={false} onCheckedChange={onCheckedChange}>
        אני מסכים
      </Checkbox>,
    );
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('[32] required is exposed to assistive technology', () => {
    render(<Checkbox required>אני מסכים</Checkbox>);
    const box = screen.getByRole('checkbox');
    const exposed = box.hasAttribute('required') || box.getAttribute('aria-required') === 'true';
    expect(exposed).toBe(true);
  });

  it('[32] not required: nothing claims it is required', () => {
    render(<Checkbox>אני מסכים</Checkbox>);
    expect(screen.getByRole('checkbox')).not.toBeRequired();
  });

  it('[32] error sets aria-invalid="true"; without error it does not', () => {
    const { rerender } = render(<Checkbox error>אני מסכים</Checkbox>);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
    rerender(<Checkbox>אני מסכים</Checkbox>);
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('[32] disabled: not toggled by click or Space, skipped by Tab', async () => {
    const onCheckedChange = vi.fn();
    render(
      <>
        <Checkbox disabled onCheckedChange={onCheckedChange}>
          אני מסכים
        </Checkbox>
        <button type="button">אחרי</button>
      </>,
    );
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.tab();
    expect(screen.getByRole('checkbox')).not.toHaveFocus();
    await userEvent.keyboard(' ');
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('[32] aria-label names a checkbox whose children are not text', () => {
    render(
      <Checkbox id="terms" name="terms" aria-label="תנאים">
        <span aria-hidden="true">*</span>
      </Checkbox>,
    );
    expect(screen.getByRole('checkbox', { name: 'תנאים' })).toBeInTheDocument();
  });
});

describe('InlineAlert (33)', () => {
  it('[33] error variant (the default) has role="alert" with the caller text', () => {
    render(<InlineAlert>פרטי ההתחברות שגויים</InlineAlert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('פרטי ההתחברות שגויים');
  });

  it('[33] variant="error" is the same as the default', () => {
    render(<InlineAlert variant="error">שגיאה</InlineAlert>);
    expect(screen.getByRole('alert')).toHaveTextContent('שגיאה');
  });

  it('[33] has an icon with aria-hidden="true", so it is not colour alone', () => {
    render(<InlineAlert>שגיאה</InlineAlert>);
    const icon = screen.getByRole('alert').querySelector('svg');
    expect(icon, 'an svg icon inside the alert').not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('[33] the icon adds no text: the alert text is exactly the caller text', () => {
    render(<InlineAlert>שגיאה</InlineAlert>);
    expect(screen.getByRole('alert').textContent?.trim()).toBe('שגיאה');
  });

  it('[33] markup in children (a link) and long text render intact', () => {
    const long = 'א'.repeat(600);
    render(
      <InlineAlert>
        {long} <a href="/reset">איפוס</a>
      </InlineAlert>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(long);
    expect(within(screen.getByRole('alert')).getByRole('link', { name: 'איפוס' })).toBeInTheDocument();
  });

  it('[33] hostile text is rendered as text, not as markup', () => {
    const { container } = render(<InlineAlert>{'<img src=x onerror=alert(1)>'}</InlineAlert>);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('<img src=x onerror=alert(1)>');
  });

  it('[33] two alerts are two separate alert regions', () => {
    render(
      <>
        <InlineAlert>א</InlineAlert>
        <InlineAlert>ב</InlineAlert>
      </>,
    );
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });
});

// Addendum after the part-d review: errors are announced, not only drawn.
describe('announced errors (addendum after the part-d review)', () => {
  it('[30] ChoiceCardGroup: a radiogroup (a fieldset) named by the legend', () => {
    const { container } = render(<ChoiceCardGroup legend="באיזה שלב אתם?" name="s" options={OPTIONS} />);
    const group = screen.getByRole('radiogroup', { name: 'באיזה שלב אתם?' });
    expect(group.tagName).toBe('FIELDSET');
    expect(container.querySelector('fieldset > legend')).toHaveTextContent('באיזה שלב אתם?');
  });

  it('[30] ChoiceCardGroup with error: the radiogroup has aria-invalid="true"; without error it does not', () => {
    const { rerender } = render(<ChoiceCardGroup legend="ל" name="s" options={OPTIONS} error />);
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-invalid', 'true');
    rerender(<ChoiceCardGroup legend="ל" name="s" options={OPTIONS} />);
    expect(screen.getByRole('radiogroup')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('[30] ChoiceCardGroup: aria-describedby on the radiogroup links to the caller message', () => {
    render(
      <>
        <ChoiceCardGroup legend="ל" name="s" options={OPTIONS} error aria-describedby="stage-error" />
        <p id="stage-error">יש לבחור שלב</p>
      </>,
    );
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-describedby', 'stage-error');
    expect(screen.getByRole('radiogroup')).toHaveAccessibleDescription('יש לבחור שלב');
  });

  it('[30] ChoiceCardGroup: without the prop there is no dangling aria-describedby', () => {
    render(<ChoiceCardGroup legend="ל" name="s" options={OPTIONS} />);
    const ref = screen.getByRole('radiogroup').getAttribute('aria-describedby');
    expect(ref === null || ref.split(/\s+/).every((id) => document.getElementById(id) !== null)).toBe(true);
  });

  it('[29] DateInput: aria-describedby on the fieldset links to the caller message', () => {
    const { container } = render(
      <>
        <DateInput legend="תאריך לידה" error aria-describedby="date-error" />
        <p id="date-error">תאריך לא תקין</p>
      </>,
    );
    const fieldset = container.querySelector('fieldset');
    expect(fieldset).toHaveAttribute('aria-describedby', 'date-error');
    expect(screen.getByRole('group', { name: 'תאריך לידה' })).toHaveAccessibleDescription('תאריך לא תקין');
  });

  it('[29] DateInput with error and aria-describedby: all three fields keep aria-invalid="true"', () => {
    render(<DateInput legend="תאריך לידה" error aria-describedby="date-error" />);
    for (const name of FIELD_NAMES) {
      expect(screen.getByLabelText(name)).toHaveAttribute('aria-invalid', 'true');
    }
  });

  it('[32] Checkbox inside FormField with an error: aria-invalid="true" and aria-describedby reach the input', () => {
    render(
      <FormField label="תנאים" error="יש לאשר את התנאים">
        {(c) => <Checkbox {...c}>אני מסכים</Checkbox>}
      </FormField>,
    );
    const box = screen.getByRole('checkbox');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    const ids = (box.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    expect(box).toHaveAccessibleDescription(expect.stringContaining('יש לאשר את התנאים'));
  });

  it('[32] Checkbox: aria-invalid and aria-describedby pass through on their own', () => {
    render(
      <>
        <Checkbox aria-invalid aria-describedby="why">
          אני מסכים
        </Checkbox>
        <p id="why">הסבר</p>
      </>,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('checkbox')).toHaveAccessibleDescription('הסבר');
  });

  it('[32] Checkbox: error and aria-invalid combine; neither overrides the other', () => {
    const { rerender } = render(
      <Checkbox error aria-invalid={false}>
        אני מסכים
      </Checkbox>,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
    rerender(
      <Checkbox error={false} aria-invalid>
        אני מסכים
      </Checkbox>,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
    rerender(
      <Checkbox error={false} aria-invalid={false}>
        אני מסכים
      </Checkbox>,
    );
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-invalid', 'true');
  });
});
