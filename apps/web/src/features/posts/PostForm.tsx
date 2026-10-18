import { useEffect, useId, useRef } from 'react';
import { JOURNEY_STAGES, POST_AUDIENCES } from '@nestly/shared';
import { ChoiceCardGroup, type ChoiceOption } from '@/components/shared/choice-card-group';
import { FieldHint } from '@/components/shared/field-message';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { TextArea } from '@/components/ui/text-area';
import { STAGE_LABELS } from '@/lib/child-fields';
import { charactersLeft, isAudience, isStageTag, type PostFormErrors, type PostFormValues } from './post-form';
import {
  AUDIENCE_LABELS,
  AUDIENCE_LEGEND,
  BODY_LABEL,
  CANCEL_LABEL,
  EDIT_FORM_LABEL,
  NAME_NOTICE_TEXT,
  NEW_POST_LABEL,
  NO_TAG_LABEL,
  PUBLISH_LABEL,
  PUBLISHING_TEXT,
  remainingText,
  SAVE_LABEL,
  SAVING_TEXT,
  TAG_HINT_TEXT,
  TAG_LEGEND,
} from './posts-texts';

const AUDIENCE_OPTIONS: ChoiceOption[] = POST_AUDIENCES.map((value) => ({ value, label: AUDIENCE_LABELS[value] }));
const TAG_OPTIONS: ChoiceOption[] = [{ value: '', label: NO_TAG_LABEL }, ...JOURNEY_STAGES.map((value) => ({ value, label: STAGE_LABELS[value] }))];
/** The counter speaks only at this many characters left or fewer (c16). */
const COUNTER_FROM = 100;

/** Where focus goes after a change, once per `tick`: the text field, the first invalid field or the failure message. */
export interface PostFormFocus {
  target: 'body' | 'invalid' | 'message';
  tick: number;
}

export interface PostFormProps {
  mode: 'create' | 'edit';
  values: PostFormValues;
  errors: PostFormErrors;
  saving: boolean;
  failure: string | null;
  focus?: PostFormFocus;
  onChange: (values: PostFormValues) => void;
  onSubmit: () => void;
  /** Edit only: leaves the form without sending. */
  onCancel?: () => void;
}

// The composer and the edit form (FR-FEED-002, OP-033; F3.1b): the text, who sees the post, an optional stage tag. No anonymous
// control exists here (F3.4). Display only: what submitting does comes in as props.
export function PostForm({ mode, values, errors, saving, failure, focus, onChange, onSubmit, onCancel }: PostFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const ids = useId();
  const noticeId = `${ids}-notice`;
  const tagHintId = `${ids}-tag-hint`;

  useEffect(() => {
    if (focus === undefined || focus.tick === 0) return;
    const form = formRef.current;
    if (form === null) return;
    const target = focus.target === 'body' ? 'textarea' : focus.target === 'invalid' ? '[aria-invalid="true"]' : '[data-post-message]';
    form.querySelector<HTMLElement>(target)?.focus();
  }, [focus]);

  const left = charactersLeft(values.body);
  const counting = left <= COUNTER_FROM;
  const label = mode === 'create' ? (saving ? PUBLISHING_TEXT : PUBLISH_LABEL) : saving ? SAVING_TEXT : SAVE_LABEL;

  return (
    <form
      ref={formRef}
      data-testid="post-form"
      aria-label={mode === 'create' ? NEW_POST_LABEL : EDIT_FORM_LABEL}
      aria-describedby={mode === 'create' ? noticeId : undefined}
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!saving) onSubmit();
      }}
    >
      {failure !== null ? (
        <div data-post-message tabIndex={-1}>
          <InlineAlert>{failure}</InlineAlert>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <FormField label={BODY_LABEL} htmlFor={`${ids}-body`} {...(errors.body !== undefined ? { error: errors.body } : {})}>
          {(control) => <TextArea {...control} value={values.body} onChange={(event) => onChange({ ...values, body: event.target.value })} />}
        </FormField>
        {/* The polite region is always mounted; it speaks only in the limit's last 100 characters (c16). */}
        <p role="status" data-testid="post-counter" className="text-small text-muted-foreground empty:sr-only">
          {counting ? remainingText(left) : ''}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <ChoiceCardGroup
          legend={AUDIENCE_LEGEND}
          name="post-audience"
          options={AUDIENCE_OPTIONS}
          value={values.audience}
          onChange={(value) => {
            if (isAudience(value)) onChange({ ...values, audience: value });
          }}
        />
        {mode === 'create' ? <FieldHint id={noticeId}>{NAME_NOTICE_TEXT}</FieldHint> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <ChoiceCardGroup
          legend={TAG_LEGEND}
          name="post-stage-tag"
          options={TAG_OPTIONS}
          value={values.stageTag}
          aria-describedby={tagHintId}
          onChange={(value) => {
            if (value === '' || isStageTag(value)) onChange({ ...values, stageTag: value });
          }}
        />
        <FieldHint id={tagHintId}>{TAG_HINT_TEXT}</FieldHint>
      </div>
      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" block pending={saving} disabled={saving}>
          {label}
        </Button>
        {onCancel !== undefined ? (
          <Button variant="text" onClick={onCancel} className="self-center">
            {CANCEL_LABEL}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
