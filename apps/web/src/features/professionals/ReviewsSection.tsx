import { useId, useRef, useState, type FormEvent } from 'react';
import type { ProfessionalPage, ProfessionalReviewItem } from '@nestly/shared';
import { StarRating } from '@/components/domain/star-rating';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { MoreActionsMenu } from '@/components/ui/more-actions-menu';
import { SelectInput } from '@/components/ui/select-input';
import { TextArea } from '@/components/ui/text-area';
import { useProCall } from '@/hooks/use-pro-call';
import { formatPostTime } from '@/lib/format-post-time';
import {
  ACTION_FAILED,
  CANCEL,
  DELETE_REVIEW,
  DELETE_REVIEW_CONFIRM,
  DELETE_REVIEW_YES,
  EDIT_REVIEW,
  EDITED_LABEL,
  MY_REVIEW_HEADING,
  MY_REVIEW_NOTE,
  NO_REVIEWS,
  REPORT_REVIEW,
  REVIEW_ALREADY,
  REVIEW_DELETED,
  REVIEW_GONE,
  REVIEW_HELD,
  REVIEW_NOT_EDITABLE,
  REVIEW_NOTE,
  REVIEW_RATING_LABEL,
  REVIEW_RATING_REQUIRED,
  REVIEW_SAVED,
  REVIEW_SEND,
  REVIEW_TEXT_LABEL,
  REVIEW_TEXT_REQUIRED,
  REVIEW_UPDATE,
  REVIEW_UPDATED,
  REVIEWS_HEADING,
  WRITE_REVIEW,
  reviewStars,
  reviewStarsLabel,
} from '@/lib/professional-texts';
import { deleteReview, editReview, writeReview } from '@/services/api/professionals';

const RATING_OPTIONS = [5, 4, 3, 2, 1].map((value) => ({ value: String(value), label: `${reviewStars(value)} (${reviewStarsLabel(value)})` }));

export interface ReviewsSectionProps {
  page: ProfessionalPage;
  /** Reload the page after a change (the average, the list and the own review move). */
  onChanged: () => Promise<void>;
  /** What happened, for the screen's polite region. */
  onStatus: (text: string) => void;
  /** Opens the report window for a review. */
  onReport: (reviewId: string) => void;
}

/** "נערכה" with the edit's time beside the review's own (§11.21, §11.8). */
function ReviewTime({ review }: { review: ProfessionalReviewItem }) {
  return (
    <p className="mt-1 text-small text-muted-foreground">
      <time dateTime={review.at}>{formatPostTime(review.at)}</time>
      {review.editedAt === null ? null : (
        <>
          {' · '}
          {EDITED_LABEL} <time dateTime={review.editedAt}>{formatPostTime(review.editedAt)}</time>
        </>
      )}
    </p>
  );
}

// A Professional's reviews (FR-SERV-011, BR-072; §11.21): one per parent. A Regular viewer with an answered conversation writes one; its own is
// shown as "הביקורת שלך" with edit (prefilled) and delete. Every review shows its stars, text, time and "נערכה"; the writer is never named.
// Every review but the viewer's own can be reported (the reviewed Professional with its own four reasons, the screen decides).
export function ReviewsSection({ page, onChanged, onStatus, onReport }: ReviewsSectionProps) {
  const call = useProCall();
  const headingId = useId();
  const mine = page.myReview;
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState('');
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<{ rating?: string; text?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const running = useRef(false);

  async function once(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await work();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  const startEdit = (review: ProfessionalReviewItem) => {
    setRating(String(review.rating));
    setText(review.text);
    setErrors({});
    setFailure(null);
    setEditing(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = { ...(rating === '' ? { rating: REVIEW_RATING_REQUIRED } : {}), ...(text.trim() === '' ? { text: REVIEW_TEXT_REQUIRED } : {}) };
    setErrors(found);
    if (rating === '' || text.trim() === '') return;
    void once(async () => {
      const result = await call((token) => (editing ? editReview : writeReview)(token, page.id, Number(rating), text));
      if (result.kind === 'ok') {
        setEditing(false);
        setRating('');
        setText('');
        onStatus(editing ? REVIEW_UPDATED : REVIEW_SAVED);
        await onChanged();
      } else if (result.kind === 'unavailable') {
        setEditing(false);
        setFailure(REVIEW_GONE);
        await onChanged();
      } else if (result.kind === 'already-done') setFailure(mine === null ? REVIEW_HELD : REVIEW_ALREADY);
      else setFailure(result.kind === 'not-allowed' && editing ? REVIEW_NOT_EDITABLE : ACTION_FAILED);
    });
  };

  const remove = () =>
    once(async () => {
      const result = await call((token) => deleteReview(token, page.id));
      if (result.kind === 'ok' || result.kind === 'unavailable') {
        setConfirming(false);
        onStatus(result.kind === 'ok' ? REVIEW_DELETED : REVIEW_GONE);
        await onChanged();
      } else setFailure(ACTION_FAILED);
    });

  const showForm = editing || (mine === null && page.reviewableConversationId !== null);
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-h3">
        {REVIEWS_HEADING}
      </h2>
      {failure === null ? null : (
        <div className="mt-3">
          <InlineAlert>{failure}</InlineAlert>
        </div>
      )}
      {mine !== null && !editing ? (
        <div className="mt-3 rounded-lg bg-card p-4 shadow-card" data-testid="my-review">
          <h3 className="text-label">{MY_REVIEW_HEADING}</h3>
          <StarRating rating={mine.rating} label={reviewStarsLabel(mine.rating)} className="mt-1" />
          <p dir="auto" className="mt-1 whitespace-pre-line">
            {mine.text}
          </p>
          <ReviewTime review={mine} />
          <p className="mt-1 text-small text-muted-foreground">{MY_REVIEW_NOTE}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button type="button" variant="soft" onClick={() => startEdit(mine)}>
              {EDIT_REVIEW}
            </Button>
            <Button type="button" variant="text" onClick={() => setConfirming(true)}>
              {DELETE_REVIEW}
            </Button>
          </div>
        </div>
      ) : null}
      {showForm ? (
        <form className="mt-3 flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card" aria-label={editing ? EDIT_REVIEW : WRITE_REVIEW} onSubmit={submit}>
          <FormField label={REVIEW_RATING_LABEL} {...(errors.rating === undefined ? {} : { error: errors.rating })}>
            {(control) => <SelectInput {...control} options={RATING_OPTIONS} placeholder={REVIEW_RATING_LABEL} value={rating} onChange={setRating} />}
          </FormField>
          <FormField label={REVIEW_TEXT_LABEL} hint={REVIEW_NOTE} {...(errors.text === undefined ? {} : { error: errors.text })}>
            {(control) => <TextArea {...control} rows={3} dir="auto" value={text} onChange={(event) => setText(event.target.value)} />}
          </FormField>
          <div className="flex gap-3">
            <Button type="submit" pending={busy}>
              {editing ? REVIEW_UPDATE : REVIEW_SEND}
            </Button>
            {editing ? (
              <Button type="button" variant="text" onClick={() => setEditing(false)}>
                {CANCEL}
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
      {page.reviews.length === 0 ? (
        <p className="mt-2 text-muted-foreground">{NO_REVIEWS}</p>
      ) : (
        <ul aria-label={REVIEWS_HEADING} className="mt-3 flex flex-col gap-3">
          {page.reviews.map((item) => (
            <li key={item.id} className="rounded-lg bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <StarRating rating={item.rating} label={reviewStarsLabel(item.rating)} />
                {item.id === mine?.id ? (
                  <span className="text-small text-primary-strong">{MY_REVIEW_HEADING}</span>
                ) : (
                  <MoreActionsMenu
                    label={`${REPORT_REVIEW}: ${item.text.slice(0, 30)}`}
                    menuLabel={REPORT_REVIEW}
                    items={[{ key: 'report', label: REPORT_REVIEW, onSelect: () => onReport(item.id) }]}
                  />
                )}
              </div>
              <p dir="auto" className="mt-1 whitespace-pre-line">
                {item.text}
              </p>
              <ReviewTime review={item} />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirming}
        title={DELETE_REVIEW_CONFIRM}
        confirmLabel={DELETE_REVIEW_YES}
        cancelLabel={CANCEL}
        pending={busy}
        failure={failure}
        onConfirm={() => void remove()}
        onCancel={() => {
          if (!busy) setConfirming(false);
        }}
      />
    </section>
  );
}
