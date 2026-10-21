import { useEffect, useId, useRef, type ReactNode } from 'react';
import { JOURNEY_STAGES, POST_AUDIENCES } from '@nestly/shared';
import { ChoiceCardGroup, type ChoiceOption } from '@/components/shared/choice-card-group';
import { FieldHint } from '@/components/shared/field-message';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TextArea } from '@/components/ui/text-area';
import { STAGE_LABELS } from '@/lib/child-fields';
import { charactersLeft, isAudience, isStageTag, type PostFormErrors, type PostFormValues } from './post-form';
import {
  ANONYMOUS_FIXED_TEXT,
  ANONYMOUS_LABEL,
  ANONYMOUS_NOTICE_TEXT,
  AUDIENCE_LABELS,
  AUDIENCE_LEGEND,
  BODY_LABEL,
  CANCEL_LABEL,
  EDIT_FORM_LABEL,
  EVERYONE_ONLY_TEXT,
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
  /** Leaves the form without sending: "ביטול" shows only when given. */
  onCancel?: () => void;
  /** Create: the "פרסום אנונימי" box is checked. Edit: the post is anonymous (its audience is fixed). Default false. */
  anonymous?: boolean;
  /** Create only: the first line only (text and send); the box, the audience and the tag are not shown yet (feed-composer c2). */
  compact?: boolean;
  /** Create only: the box was toggled. */
  onAnonymousChange?: (checked: boolean) => void;
  /**
   * The writer's posts are named and for everyone, with no tag (a Professional; professional-posting D2, D3, DR-2): no box, no audience or
   * tag group, no name notice; the fixed line "הפוסט יוצג לכולם" stands in for the audience group. Default false.
   */
  everyoneOnly?: boolean;
  /** I5: the composer's pictures (create only, shown with the rest of the options): rendered after the text. */
  attachments?: ReactNode;
  /** I10: a Group post is always for everyone in the Group: the audience group gives way to this fixed line. */
  fixedAudienceText?: string;
}

// The composer and the edit form (FR-FEED-002, FR-FEED-005, OP-033; F3.1b, F3.4): the text, "פרסום אנונימי" (create only), who sees the
// post, an optional stage tag. A checked box takes the audience group out (an anonymous post is for everyone) and swaps the name notice for
// the anonymous one; the edit of an anonymous post shows a fixed line instead of the group. A writer whose posts are for everyone only (a
// Professional) gets the text, one fixed line and the button. Display only: what submitting does comes in as props.
export function PostForm(props: PostFormProps) {
  const { mode, values, errors, saving, failure, focus, onChange, onSubmit, onCancel, anonymous = false, onAnonymousChange, compact = false, everyoneOnly = false, attachments, fixedAudienceText } = props;
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
      aria-describedby={mode === 'create' && !compact ? noticeId : undefined}
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
      {everyoneOnly ? (
        compact ? null : <FieldHint id={noticeId}>{EVERYONE_ONLY_TEXT}</FieldHint>
      ) : mode === 'create' && !compact ? (
        <div className="flex flex-col gap-1.5">
          <Checkbox checked={anonymous} onCheckedChange={(checked) => onAnonymousChange?.(checked)}>
            {ANONYMOUS_LABEL}
          </Checkbox>
          {anonymous ? <FieldHint id={noticeId}>{ANONYMOUS_NOTICE_TEXT}</FieldHint> : null}
        </div>
      ) : null}
      {mode === 'edit' && anonymous ? <p className="text-small text-muted-foreground">{ANONYMOUS_FIXED_TEXT}</p> : null}
      {fixedAudienceText !== undefined && !compact && !everyoneOnly ? <p className="text-small text-muted-foreground">{fixedAudienceText}</p> : null}
      {anonymous || compact || everyoneOnly || fixedAudienceText !== undefined ? null : (
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
      )}
      {compact || everyoneOnly ? null : (
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
      )}
      {/* I5: the pictures come after the options, just before "פרסום" (the text, then its options, keep their keyboard order) */}
      {mode === 'create' && !compact && attachments !== undefined ? attachments : null}
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
