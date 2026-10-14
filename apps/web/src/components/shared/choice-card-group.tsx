import { useId, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { CheckIcon } from '../ui/icons';

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
}

interface ChoiceCardGroupBaseProps {
  legend: string;
  /** The input group name. */
  name: string;
  options: ChoiceOption[];
  error?: boolean;
  disabled?: boolean;
  /** Id of the caller's error message (or hint). */
  'aria-describedby'?: string | undefined;
}

export interface SingleChoiceCardGroupProps extends ChoiceCardGroupBaseProps {
  multiple?: false;
  value?: string | null;
  onChange?: (value: string) => void;
}

export interface MultiChoiceCardGroupProps extends ChoiceCardGroupBaseProps {
  /** Several cards can be ticked: native checkboxes, no arrow-key movement. */
  multiple: true;
  values: readonly string[];
  /** Pairs of option values never ticked together: ticking one unticks the other. */
  exclusivePairs?: readonly (readonly [string, string])[];
  /** The new ticked values, in option order. */
  onChange?: (values: string[]) => void;
}

export type ChoiceCardGroupProps = SingleChoiceCardGroupProps | MultiChoiceCardGroupProps;

// Which way the page reads: the nearest dir attribute, else the document's.
function isRtl(element: HTMLElement): boolean {
  const own = element.closest('[dir]')?.getAttribute('dir') ?? document.documentElement.dir;
  return own === 'rtl';
}

// The ticked values after one card is toggled: it flips, and when it turns on its partner in an exclusive pair is unticked.
function toggled(
  options: ChoiceOption[],
  values: readonly string[],
  pairs: readonly (readonly [string, string])[],
  changed: string,
): string[] {
  const turnsOn = !values.includes(changed);
  const partners = pairs.flatMap(([a, b]) => (a === changed ? [b] : b === changed ? [a] : []));
  return options
    .map((option) => option.value)
    .filter((v) => (v === changed ? turnsOn : values.includes(v) && !(turnsOn && partners.includes(v))));
}

// Compact variant: radio semantics (single) or checkbox semantics (multiple) in a fieldset with a legend. The selected card
// shows a check mark, a 2px primary border and primary-strong text, never the pastel alone. In multiple mode the mark is a
// rounded square, not a circle.
// Single: arrow keys move the selection; in RTL, Right goes to the previous card and Left to the next.
// Multiple: every card is a tab stop and Space toggles it.
export function ChoiceCardGroup(props: ChoiceCardGroupProps) {
  const { legend, name, options, error, disabled, 'aria-describedby': describedBy } = props;
  const prefix = useId();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const multiple = props.multiple === true;
  const value = props.multiple === true ? null : props.value;

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (props.multiple === true) return;
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
    props.onChange?.(target.value);
  }

  return (
    <fieldset
      role={multiple ? undefined : 'radiogroup'}
      disabled={disabled}
      aria-invalid={error && !multiple ? true : undefined}
      aria-describedby={describedBy}
      className="m-0 grid min-w-0 gap-2 border-0 p-0"
    >
      <legend className="mb-1.5 p-0 text-label text-foreground">{legend}</legend>
      {options.map((option, index) => {
        const id = `${prefix}-${index}`;
        const selected = props.multiple === true ? props.values.includes(option.value) : value === option.value;
        // With nothing selected the first card is the tab stop, as in a native radio group. Checkboxes are all tab stops.
        const tabbable = multiple || selected || (value == null && index === 0);
        return (
          <div key={option.value} className="relative">
            <input
              ref={(node) => {
                refs.current[index] = node;
              }}
              id={id}
              type={multiple ? 'checkbox' : 'radio'}
              name={name}
              value={option.value}
              checked={selected}
              tabIndex={tabbable ? 0 : -1}
              // A plain fieldset cannot carry aria-invalid (only radiogroup can), so in multiple mode each checkbox does.
              aria-invalid={error && multiple ? true : undefined}
              onChange={() => {
                if (props.multiple === true) props.onChange?.(toggled(options, props.values, props.exclusivePairs ?? [], option.value));
                else props.onChange?.(option.value);
              }}
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
                  'grid size-6 shrink-0 place-items-center border-2',
                  multiple ? 'rounded-sm' : 'rounded-full',
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
