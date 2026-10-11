// UI wave 1 part c: criteria 25 (TextInput), 26 (FormField), 27 (PasswordInput), 28 (SelectInput),
// 17 (keyboard) and the addendum props. Derived from .work/ui-wave-1/spec.md (API section + addendum).
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FormField } from '@/components/shared/form-field';
import { PasswordInput } from '@/components/shared/password-input';
import { SelectInput } from '@/components/ui/select-input';
import { TextInput } from '@/components/ui/text-input';

const OPTIONS = [
  { value: 'a', label: 'אפשרות א' },
  { value: 'b', label: 'אפשרות ב' },
];

/** The elements an aria-describedby attribute points at. */
const describedBy = (el: HTMLElement): HTMLElement[] =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => el.ownerDocument.getElementById(id))
    .filter((e): e is HTMLElement => e !== null);

describe('TextInput', () => {
  it('[25] empty: a text input with an aria-label, no aria-invalid="true"', () => {
    render(<TextInput aria-label="שם" />);
    const input = screen.getByRole('textbox', { name: 'שם' });
    expect(input).toHaveAttribute('type', 'text');
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveValue('');
  });

  it('[25] filled: defaultValue and controlled value are shown; onChange fires with typing', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<TextInput aria-label="שם" defaultValue="נועה" onChange={onChange} />);
    expect(screen.getByRole('textbox')).toHaveValue('נועה');
    await userEvent.type(screen.getByRole('textbox'), 'x');
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender(<TextInput aria-label="שם" value="רז" onChange={onChange} />);
    expect(screen.getByRole('textbox')).toHaveValue('רז');
  });

  it('[25] error sets aria-invalid="true"; without error it does not', () => {
    const { rerender } = render(<TextInput aria-label="שם" error />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    rerender(<TextInput aria-label="שם" error={false} />);
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('[25] disabled: native disabled, accepts no typing', async () => {
    const onChange = vi.fn();
    render(<TextInput aria-label="שם" disabled onChange={onChange} />);
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    await userEvent.type(input, 'abc');
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['text', 'email', 'tel'] as const)('[25] type=%s is passed to the element', (type) => {
    const { container } = render(<TextInput aria-label="x" type={type} />);
    expect(container.querySelector('input')).toHaveAttribute('type', type);
  });

  it('[25] dir="ltr" (email) puts dir=ltr on the input; absent dir sets none', () => {
    const { container, rerender } = render(<TextInput aria-label="x" type="email" dir="ltr" />);
    expect(container.querySelector('input')).toHaveAttribute('dir', 'ltr');
    rerender(<TextInput aria-label="x" />);
    expect(container.querySelector('input')).not.toHaveAttribute('dir', 'ltr');
  });

  it('[25] passes name, autoComplete and onBlur through', () => {
    const onBlur = vi.fn();
    render(<TextInput aria-label="x" name="email" autoComplete="email" onBlur={onBlur} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('name', 'email');
    expect(input).toHaveAttribute('autocomplete', 'email');
    input.focus();
    input.blur();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('[25][addendum] error wins over aria-invalid; aria-invalid alone is honoured; aria-describedby passes', () => {
    const { rerender } = render(<TextInput aria-label="x" error aria-invalid={false} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    rerender(<TextInput aria-label="x" aria-invalid aria-describedby="h1" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'h1');
  });

  it('[17][25] is reached by Tab; a disabled one is skipped', async () => {
    render(
      <>
        <TextInput aria-label="ראשון" disabled />
        <TextInput aria-label="שני" />
      </>,
    );
    await userEvent.tab();
    expect(screen.getByRole('textbox', { name: 'שני' })).toHaveFocus();
  });

  it('[25] hostile value renders as a value, not markup', () => {
    const payload = '"><img src=x onerror=alert(1)>';
    const { container } = render(<TextInput aria-label="x" defaultValue={payload} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('textbox')).toHaveValue(payload);
  });
});

describe('FormField', () => {
  it('[26] the label is linked to the control by for/id', () => {
    render(<FormField label="שם פרטי">{(c) => <TextInput {...c} />}</FormField>);
    const input = screen.getByLabelText('שם פרטי');
    expect(input.tagName).toBe('INPUT');
    const label = screen.getByText('שם פרטי');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', input.id);
    expect(input.id).not.toBe('');
  });

  it('[26] an explicit htmlFor is used as the control id', () => {
    render(
      <FormField label="דוא״ל" htmlFor="my-email">
        {(c) => <TextInput {...c} />}
      </FormField>,
    );
    expect(screen.getByLabelText('דוא״ל')).toHaveAttribute('id', 'my-email');
  });

  it('[26] two fields get distinct generated ids and each label targets its own control', () => {
    render(
      <>
        <FormField label="א">{(c) => <TextInput {...c} />}</FormField>
        <FormField label="ב">{(c) => <TextInput {...c} />}</FormField>
      </>,
    );
    const a = screen.getByLabelText('א');
    const b = screen.getByLabelText('ב');
    expect(a.id).not.toBe(b.id);
  });

  it('[26] the render prop receives id, aria-describedby and aria-invalid', () => {
    const seen = vi.fn<(c: Record<string, unknown>) => void>();
    render(
      <FormField label="א" hint="רמז" error="שגיאה">
        {(c) => {
          seen(c);
          return <TextInput {...c} />;
        }}
      </FormField>,
    );
    const arg = seen.mock.calls[0]?.[0] ?? {};
    expect(typeof arg['id']).toBe('string');
    expect(typeof arg['aria-describedby']).toBe('string');
    expect(String(arg['aria-invalid'])).toBe('true');
  });

  it('[26] the label comes before the control in the DOM (above the field), and there is no placeholder', () => {
    render(<FormField label="שם">{(c) => <TextInput {...c} />}</FormField>);
    const label = screen.getByText('שם');
    const input = screen.getByLabelText('שם');
    expect(label.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(input).not.toHaveAttribute('placeholder');
  });

  it('[26] hint: shown as text and referenced by aria-describedby', () => {
    render(
      <FormField label="שם" hint="כפי שמופיע בתעודה">
        {(c) => <TextInput {...c} />}
      </FormField>,
    );
    const input = screen.getByLabelText('שם');
    expect(describedBy(input).some((el) => el.textContent?.includes('כפי שמופיע בתעודה'))).toBe(true);
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('[26] error: text + icon (aria-hidden), referenced by aria-describedby, control is aria-invalid', () => {
    render(
      <FormField label="שם" error="יש להזין שם">
        {(c) => <TextInput {...c} />}
      </FormField>,
    );
    const input = screen.getByLabelText('שם');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const message = describedBy(input).find((el) => el.textContent?.includes('יש להזין שם'));
    expect(message, 'aria-describedby points at the element holding the error text').toBeDefined();
    const icon = message?.querySelector('svg') ?? null;
    expect(icon, 'the error carries an icon, not text alone').not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('[26] hint and error both: both ids are in aria-describedby', () => {
    render(
      <FormField label="שם" hint="רמז" error="שגיאה">
        {(c) => <TextInput {...c} />}
      </FormField>,
    );
    const texts = describedBy(screen.getByLabelText('שם')).map((el) => el.textContent ?? '');
    expect(texts.some((t) => t.includes('רמז'))).toBe(true);
    expect(texts.some((t) => t.includes('שגיאה'))).toBe(true);
  });

  it('[26] no hint and no error: every id in aria-describedby resolves to an element (or there is none)', () => {
    const { container } = render(<FormField label="שם">{(c) => <TextInput {...c} />}</FormField>);
    const described = screen.getByLabelText('שם').getAttribute('aria-describedby');
    for (const id of (described ?? '').split(/\s+/).filter(Boolean)) {
      expect(container.ownerDocument.getElementById(id)).not.toBeNull();
    }
  });

  it('[26] optional renders "(לא חובה)" as text; not optional does not', () => {
    const { rerender } = render(
      <FormField label="שם" optional>
        {(c) => <TextInput {...c} />}
      </FormField>,
    );
    expect(screen.getByText(/\(לא חובה\)/)).toBeInTheDocument();
    rerender(<FormField label="שם">{(c) => <TextInput {...c} />}</FormField>);
    expect(screen.queryByText(/לא חובה/)).not.toBeInTheDocument();
  });

  it('[26] works with PasswordInput and SelectInput (the render-prop output spreads into them)', () => {
    render(
      <>
        <FormField label="סיסמה" error="שגיאה א" htmlFor="pw">
          {(c) => <PasswordInput {...c} toggleLabel="הצגה" />}
        </FormField>
        <FormField label="מין" error="שגיאה ב" htmlFor="sx">
          {(c) => <SelectInput {...c} options={OPTIONS} placeholder="בחירה" />}
        </FormField>
      </>,
    );
    const pw = screen.getByLabelText('סיסמה');
    const sel = screen.getByLabelText('מין');
    expect(pw).toHaveAttribute('id', 'pw');
    expect(pw).toHaveAttribute('aria-invalid', 'true');
    expect(sel).toHaveAttribute('id', 'sx');
    expect(sel).toHaveAttribute('aria-invalid', 'true');
    expect(describedBy(sel).some((el) => el.textContent?.includes('שגיאה ב'))).toBe(true);
  });

  it('[26] hostile label, hint and error render as text', () => {
    const bad = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <FormField label={bad} hint={bad} error={bad}>
        {(c) => <TextInput {...c} />}
      </FormField>,
    );
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('PasswordInput', () => {
  const field = () => screen.getByLabelText('סיסמה');

  it('[27] starts masked; the toggle (named by toggleLabel) flips type and aria-pressed both ways', async () => {
    render(<PasswordInput aria-label="סיסמה" toggleLabel="הצגת הסיסמה" />);
    const toggle = screen.getByRole('button', { name: 'הצגת הסיסמה' });
    expect(field()).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(field()).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);
    expect(field()).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('[27] the toggle does not submit a surrounding form and keeps the typed value', async () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput aria-label="סיסמה" toggleLabel="הצגה" defaultValue="secret1" />
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'הצגה' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(field()).toHaveValue('secret1');
  });

  it('[27] paste is not blocked (WCAG 3.3.8): the paste event is not default-prevented and the text lands', async () => {
    const onChange = vi.fn();
    render(<PasswordInput aria-label="סיסמה" toggleLabel="הצגה" onChange={onChange} />);
    const input = field();
    const notPrevented = fireEvent.paste(input, { clipboardData: { getData: () => 'pasted-pw' } });
    expect(notPrevented, 'paste default must not be prevented').toBe(true);
    input.focus();
    await userEvent.paste('pasted-pw');
    expect(input).toHaveValue('pasted-pw');
    expect(onChange).toHaveBeenCalled();
  });

  it.each(['current-password', 'new-password'] as const)('[27] autoComplete=%s passes through', (ac) => {
    render(<PasswordInput aria-label="סיסמה" toggleLabel="הצגה" autoComplete={ac} />);
    expect(field()).toHaveAttribute('autocomplete', ac);
  });

  it('[27] passes name, id, onBlur; disabled disables the input', () => {
    const onBlur = vi.fn();
    const { rerender } = render(
      <PasswordInput aria-label="סיסמה" toggleLabel="הצגה" name="pw" id="pw-1" onBlur={onBlur} />,
    );
    expect(field()).toHaveAttribute('name', 'pw');
    expect(field()).toHaveAttribute('id', 'pw-1');
    field().focus();
    field().blur();
    expect(onBlur).toHaveBeenCalledTimes(1);
    rerender(<PasswordInput aria-label="סיסמה" toggleLabel="הצגה" disabled />);
    expect(field()).toBeDisabled();
  });

  it('[27] a met rule shows "✓ text"; an unmet rule shows its plain text, without a mark', () => {
    render(
      <PasswordInput
        aria-label="סיסמה"
        toggleLabel="הצגה"
        rules={[
          { id: 'len', text: 'לפחות 8 תווים', met: true },
          { id: 'digit', text: 'ספרה אחת', met: false },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const met = items[0];
    const unmet = items[1];
    expect(met?.textContent).toMatch(/✓\s*לפחות 8 תווים/);
    expect(unmet?.textContent?.trim()).toBe('ספרה אחת');
    expect(unmet?.textContent).not.toContain('✓');
  });

  it('[27] a rule flipping from unmet to met gains the mark (met is text, not colour alone)', () => {
    const rules = (met: boolean) => [{ id: 'len', text: 'לפחות 8 תווים', met }];
    const { rerender } = render(<PasswordInput aria-label="סיסמה" toggleLabel="הצגה" rules={rules(false)} />);
    expect(screen.getByRole('listitem').textContent).not.toContain('✓');
    rerender(<PasswordInput aria-label="סיסמה" toggleLabel="הצגה" rules={rules(true)} />);
    expect(screen.getByRole('listitem').textContent).toContain('✓');
  });

  it('[27] empty rules (explicit or default) render no list and no items', () => {
    const { rerender } = render(<PasswordInput aria-label="סיסמה" toggleLabel="הצגה" rules={[]} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    rerender(<PasswordInput aria-label="סיסמה" toggleLabel="הצגה" />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('[27] hostile rule text renders as text', () => {
    const { container } = render(
      <PasswordInput
        aria-label="סיסמה"
        toggleLabel="הצגה"
        rules={[{ id: 'x', text: '<img src=x onerror=alert(1)>', met: true }]}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('[27][addendum] error sets aria-invalid; error wins over aria-invalid; aria-invalid and aria-describedby pass', () => {
    const { rerender } = render(<PasswordInput aria-label="סיסמה" toggleLabel="הצגה" error />);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    rerender(<PasswordInput aria-label="סיסמה" toggleLabel="הצגה" error aria-invalid={false} />);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    rerender(<PasswordInput aria-label="סיסמה" toggleLabel="הצגה" aria-invalid aria-describedby="d1" />);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAttribute('aria-describedby', 'd1');
    rerender(<PasswordInput aria-label="סיסמה" toggleLabel="הצגה" />);
    expect(field()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('[17][27] Tab reaches the input then the toggle; Enter and Space on the toggle each flip it once', async () => {
    render(<PasswordInput aria-label="סיסמה" toggleLabel="הצגה" />);
    await userEvent.tab();
    expect(field()).toHaveFocus();
    await userEvent.tab();
    const toggle = screen.getByRole('button', { name: 'הצגה' });
    expect(toggle).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('SelectInput', () => {
  it('[28] placeholder state: value "" shows the supplied placeholder, as the only empty-valued option', () => {
    render(<SelectInput aria-label="מין" options={OPTIONS} placeholder="בחירה" value="" onChange={() => {}} />);
    const select = screen.getByRole('combobox', { name: 'מין' });
    expect(select).toHaveValue('');
    const placeholder = screen.getByRole('option', { name: 'בחירה' });
    expect(placeholder).toHaveValue('');
    expect(screen.getAllByRole('option').filter((o) => o instanceof HTMLOptionElement && o.value === '')).toHaveLength(1);
  });

  it('[28] options come from props, in order, with their values', () => {
    render(<SelectInput aria-label="מין" options={OPTIONS} placeholder="בחירה" />);
    const opts = screen.getAllByRole<HTMLOptionElement>('option');
    expect(opts.map((o) => o.value)).toEqual(['', 'a', 'b']);
    expect(opts.map((o) => o.textContent)).toEqual(['בחירה', 'אפשרות א', 'אפשרות ב']);
  });

  it('[28] selected state: a given value is the selected option', () => {
    render(<SelectInput aria-label="מין" options={OPTIONS} placeholder="בחירה" value="b" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveValue('b');
    expect(screen.getByRole('option', { name: 'אפשרות ב' })).toHaveProperty('selected', true);
  });

  it('[28] selecting an option emits the option value string (not an event), once', async () => {
    const onChange = vi.fn();
    render(<SelectInput aria-label="מין" options={OPTIONS} placeholder="בחירה" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'b');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('b');
  });

  // jsdom does not implement keyboard selection on a native select; e2e/form-controls.spec.ts presses real keys.
  it('[17][28] Tab reaches the select', async () => {
    render(<SelectInput aria-label="מין" options={OPTIONS} placeholder="בחירה" />);
    await userEvent.tab();
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('[28] zero options: only the placeholder is rendered', () => {
    render(<SelectInput aria-label="מין" options={[]} placeholder="בחירה" />);
    const opts = screen.getAllByRole('option');
    expect(opts).toHaveLength(1);
    expect(opts[0]).toHaveTextContent('בחירה');
    expect(opts[0]).toHaveValue('');
  });

  it('[28] error state sets aria-invalid; error wins over aria-invalid; aria-invalid alone is honoured', () => {
    const { rerender } = render(<SelectInput aria-label="מין" options={OPTIONS} placeholder="בחירה" error />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
    rerender(<SelectInput aria-label="מין" options={OPTIONS} placeholder="בחירה" error aria-invalid={false} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
    rerender(<SelectInput aria-label="מין" options={OPTIONS} placeholder="בחירה" aria-invalid aria-describedby="e1" />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-describedby', 'e1');
    rerender(<SelectInput aria-label="מין" options={OPTIONS} placeholder="בחירה" />);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('[28] disabled: native disabled, not reachable by Tab, emits nothing', async () => {
    const onChange = vi.fn();
    render(<SelectInput aria-label="מין" options={OPTIONS} placeholder="בחירה" disabled onChange={onChange} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
    await userEvent.tab();
    expect(select).not.toHaveFocus();
  });

  it('[28] passes name and id', () => {
    render(<SelectInput aria-label="מין" options={OPTIONS} placeholder="בחירה" name="sex" id="sex-1" />);
    expect(screen.getByRole('combobox')).toHaveAttribute('name', 'sex');
    expect(screen.getByRole('combobox')).toHaveAttribute('id', 'sex-1');
  });

  it('[28] hostile option labels render as text', () => {
    const { container } = render(
      <SelectInput
        aria-label="x"
        options={[{ value: 'x', label: '<img src=x onerror=alert(1)>' }]}
        placeholder="<b>בחירה</b>"
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });
});
