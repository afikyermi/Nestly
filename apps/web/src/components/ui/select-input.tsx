import { useState, type ChangeEvent } from 'react';
import { cn } from '@/lib/cn';
import { ChevronDownIcon } from './icons';
import { inputStyles } from './text-input';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectInputProps {
  options: SelectOption[];
  /** `""` is the placeholder. Omit it for an uncontrolled select. */
  value?: string;
  /** The first option, with value `""` (the caller supplies the text). */
  placeholder: string;
  error?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean | undefined;
  onChange?: (value: string) => void;
}

// A native <select> (Q2): the platform picker is the more accessible control on mobile.
// Its name comes from FormField (`id`) or `aria-label`.
export function SelectInput({
  options,
  value,
  placeholder,
  error,
  onChange,
  'aria-invalid': ariaInvalid,
  ...rest
}: SelectInputProps) {
  const invalid = error ?? ariaInvalid;
  // Uncontrolled, the select starts on the placeholder; the shown text is muted while it is.
  const [own, setOwn] = useState('');
  const empty = (value ?? own) === '';
  return (
    <div className="relative">
      <select
        {...rest}
        {...(value === undefined ? { defaultValue: '' } : { value })}
        aria-invalid={invalid ? true : undefined}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          setOwn(event.target.value);
          onChange?.(event.target.value);
        }}
        className={cn(inputStyles, 'appearance-none pe-10', empty && 'text-muted-foreground')}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute end-3 top-3 size-6 text-muted-foreground" />
    </div>
  );
}
