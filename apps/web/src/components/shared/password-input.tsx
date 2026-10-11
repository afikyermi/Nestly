import { useId, useState, type ChangeEventHandler, type FocusEventHandler } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '../ui/button';
import { EyeIcon, EyeOffIcon } from '../ui/icons';
import { inputStyles } from '../ui/text-input';

export interface PasswordRule {
  id: string;
  text: string;
  met: boolean;
}

export interface PasswordInputProps {
  value?: string;
  defaultValue?: string;
  autoComplete?: 'current-password' | 'new-password';
  error?: boolean;
  /** Rules the caller checks; each shows "✓ text" when met and plain text when not. */
  rules?: PasswordRule[];
  /** Accessible name of the show/hide toggle (copy lives with the caller). */
  toggleLabel: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean | undefined;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
}

// Paste is never blocked (WCAG 3.3.8): there is no onPaste handler here.
export function PasswordInput({
  rules = [],
  toggleLabel,
  error,
  'aria-invalid': ariaInvalid,
  'aria-describedby': describedBy,
  ...rest
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const rulesId = useId();
  const invalid = error ?? ariaInvalid;
  const described = [describedBy, rules.length > 0 ? rulesId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          {...rest}
          type={visible ? 'text' : 'password'}
          dir="ltr"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={described === '' ? undefined : described}
          className={cn(inputStyles, 'ps-14 text-start')}
        />
        <Button
          iconOnly
          label={toggleLabel}
          aria-pressed={visible}
          disabled={rest.disabled}
          onClick={() => setVisible((v) => !v)}
          className="absolute end-0.5 top-0.5"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      </div>
      {rules.length > 0 ? (
        <ul id={rulesId} className="flex flex-col gap-1">
          {rules.map((rule) => (
            <li key={rule.id} className={cn('text-small', rule.met ? 'text-success' : 'text-muted-foreground')}>
              {rule.met ? <span aria-hidden="true">✓ </span> : null}
              {rule.text}
              <span className="sr-only">{rule.met ? ' (התקיים)' : ' (עדיין לא)'}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
