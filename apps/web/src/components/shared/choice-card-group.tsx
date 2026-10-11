import { useId, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { CheckIcon } from '../ui/icons';

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
}

export interface ChoiceCardGroupProps {
  legend: string;
  /** The radio group name. */
  name: string;
  options: ChoiceOption[];
  value?: string | null;
  error?: boolean;
  disabled?: boolean;
  /** Id of the caller's error message (or hint). */
  'aria-describedby'?: string | undefined;
  onChange?: (value: string) => void;
}

// Which way the page reads: the nearest dir attribute, else the document's.
function isRtl(element: HTMLElement): boolean {
  const own = element.closest('[dir]')?.getAttribute('dir') ?? document.documentElement.dir;
  return own === 'rtl';
}

// Compact variant: single choice, radio semantics in a fieldset with a legend. The selected card
// shows a check mark, a 2px primary border and primary-strong text, never the pastel alone.
// Arrow keys move the selection; in RTL, Right goes to the previous card and Left to the next.
export function ChoiceCardGroup({ legend, name, options, value, error, disabled, 'aria-describedby': describedBy, onChange }: ChoiceCardGroupProps) {
  const prefix = useId();
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    const rtl = isRtl(event.currentTarget);
    let step = 0;
    if (event.key === 'ArrowDown') step = 1;
    else if (event.key === 'ArrowUp') step = -1;
    else if (event.key === 'ArrowRight') step = rtl ? -1 : 1;
    else if (event.key === 'ArrowLeft') step = rtl ? 1 : -1;
    if (step === 0 || options.length === 0) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    const target = options[next];
    if (target === undefined) return;
    refs.current[next]?.focus();
    onChange?.(target.value);
  }

  return (
    <fieldset
      role="radiogroup"
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className="m-0 grid min-w-0 gap-2 border-0 p-0"
    >
      <legend className="mb-1.5 p-0 text-label text-foreground">{legend}</legend>
      {options.map((option, index) => {
        const id = `${prefix}-${index}`;
        const selected = value === option.value;
        // With nothing selected the first card is the tab stop, as in a native radio group.
        const tabbable = selected || (value == null && index === 0);
        return (
          <div key={option.value} className="relative">
            <input
              ref={(node) => {
                refs.current[index] = node;
              }}
              id={id}
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              tabIndex={tabbable ? 0 : -1}
              onChange={() => onChange?.(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className="peer sr-only"
            />
            <label
              htmlFor={id}
              className={cn(
                'flex min-h-13 cursor-pointer items-center gap-3 rounded-lg border-2 bg-card px-3.5 py-3 text-body text-foreground',
                'transition-colors duration-fast ease-standard',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
                'peer-disabled:cursor-not-allowed peer-disabled:text-muted-foreground',
                selected
                  ? 'border-primary bg-primary-soft text-primary-strong'
                  : error
                    ? 'border-destructive'
                    : 'border-input',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full border-2',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                )}
              >
                {selected ? <CheckIcon className="size-4" /> : null}
              </span>
              <span className="flex flex-col">
                <span className={selected ? 'font-semibold' : undefined}>{option.label}</span>
                {option.description ? (
                  <span className="text-small text-muted-foreground">{option.description}</span>
                ) : null}
              </span>
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}
