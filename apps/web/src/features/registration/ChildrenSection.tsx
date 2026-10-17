import { useEffect, useId, useRef } from 'react';
import { MAX_CHILDREN } from '@nestly/shared';
import { DateInput } from '@/components/shared/date-input';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { MinusIcon, PlusIcon } from '@/components/ui/icons';
import { SelectInput } from '@/components/ui/select-input';
import { TextInput } from '@/components/ui/text-input';
import { FieldError } from '@/components/shared/field-message';
import { BIRTH_DATE_LABEL, CHILDREN_LIMIT_TEXT, CHILD_NAME_LABEL, CHILD_SEX_LABEL, SEX_OPTIONS, SEX_PLACEHOLDER } from '@/lib/child-fields';
import { EMPTY_CHILD, type ChildErrors, type ChildForm } from './step1-form';

export interface ChildrenSectionProps {
  children: readonly ChildForm[];
  errors: Record<number, ChildErrors> | undefined;
  onChange: (children: ChildForm[]) => void;
}

function cardName(child: ChildForm, index: number): string {
  const name = child.name.trim();
  return name === '' ? `ילד או ילדה ${index + 1}` : name;
}

// The children of the "יש לנו ילד או ילדה" choice (FR-REG-002, FR-REG-003): a card per child, "הוספת ילד נוסף" up to
// MAX_CHILDREN (VAL-040), a remove button on each card once there are two or more. Focus follows the action: to the new
// card's name on add, to the add button on remove.
export function ChildrenSection({ children, errors, onChange }: ChildrenSectionProps) {
  const noteId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<'new-card' | 'add-button' | null>(null);
  const atMax = children.length >= MAX_CHILDREN;

  useEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (target === 'new-card') {
      const cards = listRef.current?.querySelectorAll<HTMLElement>('[role="group"]');
      cards?.[cards.length - 1]?.querySelector<HTMLElement>('input')?.focus();
    } else if (target === 'add-button') {
      addRef.current?.querySelector<HTMLElement>('button')?.focus();
    }
  }, [children.length]);

  function update(index: number, patch: Partial<ChildForm>) {
    onChange(children.map((child, i) => (i === index ? { ...child, ...patch } : child)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div ref={listRef} className="flex flex-col gap-4">
        {children.map((child, index) => (
          <ChildCard
            key={index}
            child={child}
            heading={cardName(child, index)}
            errors={errors?.[index]}
            removable={children.length >= 2}
            onChange={(patch) => update(index, patch)}
            onRemove={() => {
              focusAfter.current = 'add-button';
              onChange(children.filter((_, i) => i !== index));
            }}
          />
        ))}
      </div>
      <div ref={addRef} className="flex flex-col gap-1.5">
        <Button
          variant="soft"
          block
          aria-disabled={atMax ? true : undefined}
          aria-describedby={atMax ? noteId : undefined}
          onClick={() => {
            if (atMax) return;
            focusAfter.current = 'new-card';
            onChange([...children, { ...EMPTY_CHILD }]);
          }}
        >
          <PlusIcon className="size-5" />
          הוספת ילד נוסף
        </Button>
        {atMax ? (
          <p id={noteId} className="text-small text-muted-foreground">
            {CHILDREN_LIMIT_TEXT}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface ChildCardProps {
  child: ChildForm;
  heading: string;
  errors: ChildErrors | undefined;
  removable: boolean;
  onChange: (patch: Partial<ChildForm>) => void;
  onRemove: () => void;
}

function ChildCard({ child, heading, errors, removable, onChange, onRemove }: ChildCardProps) {
  const headingId = useId();
  const birthErrorId = useId();
  return (
    <div role="group" aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4 rounded-lg bg-card p-card-padding shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} dir="auto" className="min-w-0 break-words text-h3">
          {heading}
        </h2>
        {removable ? (
          <Button iconOnly label={`הסרת הפרטים של ${heading}`} onClick={onRemove}>
            <MinusIcon />
          </Button>
        ) : null}
      </div>
      <FormField label={CHILD_NAME_LABEL} {...(errors?.name !== undefined ? { error: errors.name } : {})}>
        {(control) => (
          <TextInput {...control} autoComplete="off" value={child.name} onChange={(event) => onChange({ name: event.target.value })} />
        )}
      </FormField>
      <FormField label={CHILD_SEX_LABEL} {...(errors?.sex !== undefined ? { error: errors.sex } : {})}>
        {(control) => (
          <SelectInput {...control} placeholder={SEX_PLACEHOLDER} options={SEX_OPTIONS} value={child.sex} onChange={(sex) => onChange({ sex })} />
        )}
      </FormField>
      <div className="flex flex-col gap-1.5">
        <DateInput
          legend={BIRTH_DATE_LABEL}
          value={child.birthDate}
          error={errors?.birthDate !== undefined}
          aria-describedby={errors?.birthDate !== undefined ? birthErrorId : undefined}
          onChange={(birthDate) => onChange({ birthDate })}
        />
        {errors?.birthDate !== undefined ? <FieldError id={birthErrorId}>{errors.birthDate}</FieldError> : null}
      </div>
    </div>
  );
}
