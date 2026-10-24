import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { chatTextProblem, professionalTag, type ProfessionalPage } from '@nestly/shared';
import { StarRating } from '@/components/domain/star-rating';
import { PATHS } from '@/app/paths';
import { ReportSheet } from '@/components/domain/report-sheet';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { MoreActionsMenu } from '@/components/ui/more-actions-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { TextArea } from '@/components/ui/text-area';
import { useChatCall } from '@/hooks/use-chat-call';
import { useProCall } from '@/hooks/use-pro-call';
import { reportSheetProps, useReport } from '@/hooks/use-report';
import { conversationPath } from '@/lib/chat-link';
import { PRO_PROFILE_PATH } from '@/lib/professional-link';
import { documentTitle } from '@/lib/document-title';
import { ALREADY_REPORTED_STATUS, REPORT_RECEIVED_STATUS, REPORT_UNAVAILABLE_STATUS, REVIEW_REPORT_REASON_OPTIONS } from '@/lib/report-texts';
import {
  ABOUT_HEADING,
  ACTION_FAILED,
  ARTICLE_DISCLAIMER,
  ARTICLES_HEADING,
  CANCEL,
  EDIT_PROFILE,
  FOLLOW,
  FOLLOWING_NOTE,
  LOAD_FAILED,
  MESSAGE_FREE_NOTE,
  MESSAGE_LABEL,
  MESSAGE_REQUIRED,
  MESSAGE_TOO_LONG,
  NO_ARTICLES,
  NO_RATING,
  OPEN_CONVERSATION,
  PROFILE_GONE,
  RETRY,
  REPORT_ARTICLE,
  SEND,
  UNFOLLOW,
  WRITE_MESSAGE,
  areaText,
  priceText,
  ratingText,
  ratingValueText,
  reviewCountText,
  yearsText,
} from '@/lib/professional-texts';
import { startChat } from '@/services/api/chat';
import { fetchProfessional, setFollow } from '@/services/api/professionals';
import { ReviewsSection } from './ReviewsSection';

type Loaded = { kind: 'loading' } | { kind: 'failed' } | { kind: 'gone' } | { kind: 'loaded'; page: ProfessionalPage };

// A Professional's page (FR-SERV-003): field, experience, area, price, rating and reviews (BR-072), the articles with their responsibility note
// (FR-PRO-003, BR-071), Follow (FR-FOLLOW-001), and for a Regular viewer a message with no approval and no payment (FR-SERV-004, BR-006) and a
// review once there is an answered inquiry (FR-SERV-011). What the viewer may do is the server's answer; the database checks it again.
export function ProfessionalScreen({ professionalId }: { professionalId: string }) {
  const call = useProCall();
  const chatCall = useChatCall();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const promotionId = searchParams.get('promotion') ?? undefined;
  const articlesId = useId();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState<string | null>(null);
  const running = useRef(false);
  // FR-MOD-001 (I11 follow-ups): a review (the reviewed Professional too) or another Professional's article can be reported
  const report = useReport((_target, result) =>
    setStatus(result === 'received' ? REPORT_RECEIVED_STATUS : result === 'already-reported' ? ALREADY_REPORTED_STATUS : REPORT_UNAVAILABLE_STATUS),
  );

  const load = useCallback(async () => {
    const result = await call((token) => fetchProfessional(token, professionalId, promotionId));
    if (result.kind === 'ok') setLoaded({ kind: 'loaded', page: result.value });
    else setLoaded(result.kind === 'unavailable' ? { kind: 'gone' } : { kind: 'failed' });
  }, [call, professionalId, promotionId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (loaded.kind === 'loading') return <Skeleton className="h-64 w-full" />;
  if (loaded.kind === 'gone') return <InlineAlert>{PROFILE_GONE}</InlineAlert>;
  if (loaded.kind === 'failed') {
    return (
      <div className="flex flex-col gap-3">
        <InlineAlert>{LOAD_FAILED}</InlineAlert>
        <Button type="button" variant="soft" className="self-start" onClick={() => void load()}>
          {RETRY}
        </Button>
      </div>
    );
  }
  const { page } = loaded;

  const toggleFollow = () =>
    once(async () => {
      const result = await call((token) => setFollow(token, page.id, !page.isFollowing));
      if (result.kind !== 'ok') {
        setFailure(ACTION_FAILED);
        return;
      }
      setLoaded({ kind: 'loaded', page: { ...page, isFollowing: !page.isFollowing } });
      setStatus(page.isFollowing ? '' : FOLLOWING_NOTE);
    });

  const send = (event: FormEvent) => {
    event.preventDefault();
    const problem = chatTextProblem(message);
    setMessageError(problem === null ? null : problem === 'long' ? MESSAGE_TOO_LONG : MESSAGE_REQUIRED);
    if (problem !== null) return;
    void once(async () => {
      const result = await chatCall((token) => startChat(token, page.id, message));
      if (result.kind === 'ok' && result.value.kind === 'conversation') void navigate(conversationPath(result.value.conversationId));
      else setFailure(ACTION_FAILED);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <title>{documentTitle(page.fullName)}</title>
      <section className="rounded-lg bg-card p-4 shadow-card">
        <h1 className="text-h2">{page.fullName}</h1>
        <p className="text-label text-primary-strong">{professionalTag(page.field, page.fieldOther)}</p>
        {page.businessName === null ? null : <p className="text-small text-muted-foreground">{page.businessName}</p>}
        <p className="mt-2 text-small text-muted-foreground">
          {[yearsText(page.yearsExperience), areaText(page.area), priceText(page.priceFrom)].filter((part) => part !== null).join(' · ')}
        </p>
        {/* §11.22: the average with one decimal above five stars filled in quarters, the count beside them */}
        {page.rating === null ? (
          <p className="mt-2 text-small text-muted-foreground">{NO_RATING}</p>
        ) : (
          <div className="mt-2 flex flex-col items-start gap-1" data-testid="profile-rating">
            <p aria-hidden="true" className="text-h2 tabular-nums">
              {ratingValueText(page.rating)}
            </p>
            <div className="flex items-center gap-2">
              <StarRating rating={page.rating} label={ratingText(page.rating, page.reviewCount)} size="lg" />
              <span aria-hidden="true" className="text-small text-muted-foreground">
                {reviewCountText(page.reviewCount)}
              </span>
            </div>
          </div>
        )}
        {page.isMe ? null : (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" variant={page.isFollowing ? 'soft' : 'primary'} pending={busy} aria-pressed={page.isFollowing} onClick={() => void toggleFollow()}>
              {page.isFollowing ? UNFOLLOW : FOLLOW}
            </Button>
            {page.conversationId !== null ? (
              <Link to={conversationPath(page.conversationId)} className="inline-flex min-h-11 items-center rounded-md bg-primary-soft px-5 text-label text-primary-strong">
                {OPEN_CONVERSATION}
              </Link>
            ) : page.canChat && !writing ? (
              <Button type="button" variant="soft" onClick={() => setWriting(true)}>
                {WRITE_MESSAGE}
              </Button>
            ) : null}
          </div>
        )}
        {writing && page.conversationId === null ? (
          <form className="mt-4 flex flex-col gap-3" onSubmit={send}>
            <FormField label={MESSAGE_LABEL} hint={MESSAGE_FREE_NOTE} {...(messageError === null ? {} : { error: messageError })}>
              {(control) => <TextArea {...control} rows={3} dir="auto" value={message} onChange={(event) => setMessage(event.target.value)} />}
            </FormField>
            <div className="flex gap-3">
              <Button type="submit" pending={busy}>
                {SEND}
              </Button>
              <Button type="button" variant="text" onClick={() => setWriting(false)}>
                {CANCEL}
              </Button>
            </div>
          </form>
        ) : null}
        {failure === null ? null : (
          <div className="mt-3">
            <InlineAlert>{failure}</InlineAlert>
          </div>
        )}
        <p role="status" className={status === '' ? 'sr-only' : 'mt-2 text-label'}>
          {status}
        </p>
      </section>

      {page.about === null ? null : (
        <section>
          <h2 className="text-h3">{ABOUT_HEADING}</h2>
          <p className="mt-2 whitespace-pre-line">{page.about}</p>
        </section>
      )}

      <ReviewsSection page={page} onChanged={load} onStatus={setStatus} onReport={(id) => report.start({ kind: 'review', id })} />

      <section aria-labelledby={articlesId}>
        <h2 id={articlesId} className="text-h3">
          {ARTICLES_HEADING}
        </h2>
        {page.articles.length === 0 ? (
          <p className="mt-2 text-muted-foreground">{NO_ARTICLES}</p>
        ) : (
          <ul aria-label={ARTICLES_HEADING} className="mt-3 flex flex-col gap-3">
            {page.articles.map((article) => (
              <li key={article.id}>
                <article className="rounded-lg bg-card p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-h3">{article.title}</h3>
                    {page.isMe ? null : (
                      <MoreActionsMenu
                        label={`${REPORT_ARTICLE}: ${article.title.slice(0, 30)}`}
                        menuLabel={REPORT_ARTICLE}
                        items={[{ key: 'report', label: REPORT_ARTICLE, onSelect: () => report.start({ kind: 'article', id: article.id }) }]}
                      />
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-line">{article.body}</p>
                  <p className="mt-3 text-small text-muted-foreground">{ARTICLE_DISCLAIMER}</p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
      {page.isMe ? (
        <p>
          <Link to={PRO_PROFILE_PATH} className="text-label text-primary-strong underline underline-offset-4">
            {EDIT_PROFILE}
          </Link>
        </p>
      ) : null}
      {/* §11.10: the reviewed Professional reports a review about it with its own four reasons; everyone else with the community's */}
      {report.draft !== null ? (
        <ReportSheet
          {...reportSheetProps(report, report.draft, PATHS.communityRules)}
          {...(page.isMe && report.draft.target.kind === 'review' ? { reasons: REVIEW_REPORT_REASON_OPTIONS } : {})}
        />
      ) : null}
    </div>
  );
}
