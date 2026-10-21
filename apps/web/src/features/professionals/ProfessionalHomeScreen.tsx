import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { chatTextProblem, professionalTag, type HelpRequestItem, type ProfessionalDashboard } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextArea } from '@/components/ui/text-area';
import { useProCall } from '@/hooks/use-pro-call';
import { formatPostTime } from '@/lib/format-post-time';
import { postPath } from '@/lib/post-link';
import { PRO_ARTICLES_PATH, PRO_PROFILE_PATH } from '@/lib/professional-link';
import {
  ACTION_FAILED,
  ANONYMOUS_AUTHOR,
  CANCEL,
  EDIT_PROFILE,
  HELP_HEADING,
  HELP_INTRO,
  KPI_ARTICLES,
  KPI_CHATS,
  KPI_ENGAGEMENT,
  KPI_FOLLOWERS,
  KPI_HEADING,
  KPI_NOTE,
  KPI_POSTS,
  KPI_RATING,
  LOAD_FAILED,
  MY_ARTICLES,
  NO_HELP,
  OFFER_ALREADY,
  OFFER_HELP,
  OFFER_LIMIT,
  OFFER_NOT_ALLOWED,
  OFFER_SEND,
  OFFER_SENT,
  OFFER_TEXT_LABEL,
  OFFER_TEXT_REQUIRED,
  OFFERED,
  OPEN_POST,
  RETRY,
  offersLeftText,
} from '@/lib/professional-texts';
import { fetchProfessionalHome, offerHelp } from '@/services/api/professionals';

type Loaded = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; dashboard: ProfessionalDashboard; help: HelpRequestItem[] };

const OFFER_REFUSALS: Readonly<Record<string, string>> = { 'rate-limited': OFFER_LIMIT, 'already-done': OFFER_ALREADY, 'not-allowed': OFFER_NOT_ALLOWED };

// The Professional's home (FR-PRO-001, AC-018): a business dashboard in place of the parent's home — aggregates of its own account only (followers,
// new conversations, rating, engagement, posts, articles; no one's identity, VAL-032) — and the newest posts that ask for help, each with "הצעת עזרה"
// once (FR-SERV-005, BR-008/009: one per post, at most 10 a day; the database holds both rules).
export function ProfessionalHomeScreen() {
  const call = useProCall();
  const kpiId = useId();
  const helpId = useId();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [offering, setOffering] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const load = useCallback(async () => {
    const result = await call(fetchProfessionalHome);
    setLoaded(result.kind === 'ok' ? { kind: 'loaded', dashboard: result.value.dashboard, help: result.value.helpRequests } : { kind: 'failed' });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loaded.kind === 'loading') return <Skeleton className="h-64 w-full" />;
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
  const { dashboard, help } = loaded;
  const kpis: Array<[string, string]> = [
    [KPI_FOLLOWERS, String(dashboard.followers)],
    [KPI_CHATS, String(dashboard.chatStarts30d)],
    [KPI_RATING, dashboard.rating === null ? '—' : `${dashboard.rating.toFixed(1)} (${dashboard.reviewCount})`],
    [KPI_ENGAGEMENT, String(dashboard.engagement30d)],
    [KPI_POSTS, String(dashboard.posts30d)],
    [KPI_ARTICLES, String(dashboard.articles)],
  ];

  async function send(event: FormEvent, postId: string) {
    event.preventDefault();
    if (running.current) return;
    if (chatTextProblem(text) !== null) {
      setTextError(OFFER_TEXT_REQUIRED);
      return;
    }
    running.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const result = await call((token) => offerHelp(token, postId, text));
      if (result.kind === 'ok') {
        setOffering(null);
        setText('');
        setStatus(OFFER_SENT);
        await load();
      } else setFailure(OFFER_REFUSALS[result.kind] ?? ACTION_FAILED);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-label text-primary-strong">{professionalTag(dashboard.field, dashboard.fieldOther)}</p>
      <section aria-labelledby={kpiId}>
        <h2 id={kpiId} className="text-h3">
          {KPI_HEADING}
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {kpis.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-card p-4 shadow-card">
              <dt className="text-small text-muted-foreground">{label}</dt>
              <dd className="text-h2">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-small text-muted-foreground">{KPI_NOTE}</p>
        <div className="mt-3 flex flex-wrap gap-4">
          <Link to={PRO_PROFILE_PATH} className="inline-flex min-h-11 items-center text-label text-primary-strong underline underline-offset-4">
            {EDIT_PROFILE}
          </Link>
          <Link to={PRO_ARTICLES_PATH} className="inline-flex min-h-11 items-center text-label text-primary-strong underline underline-offset-4">
            {MY_ARTICLES}
          </Link>
        </div>
      </section>

      <section aria-labelledby={helpId}>
        <h2 id={helpId} className="text-h3">
          {HELP_HEADING}
        </h2>
        <p className="mt-1 text-small text-muted-foreground">
          {HELP_INTRO} {offersLeftText(dashboard.offersToday, dashboard.offersPerDay)}
        </p>
        {failure === null ? null : (
          <div className="mt-3">
            <InlineAlert>{failure}</InlineAlert>
          </div>
        )}
        <p role="status" className={status === '' ? 'sr-only' : 'mt-2 text-label'}>
          {status}
        </p>
        {help.length === 0 ? (
          <p className="mt-2 text-muted-foreground">{NO_HELP}</p>
        ) : (
          <ul aria-label={HELP_HEADING} className="mt-3 flex flex-col gap-3">
            {help.map((item) => (
              <li key={item.postId} className="rounded-lg bg-card p-4 shadow-card">
                <p className="text-small text-muted-foreground">
                  {item.isAnonymous ? ANONYMOUS_AUTHOR : (item.authorName ?? '')} · {formatPostTime(item.at)}
                </p>
                <p className="mt-1 whitespace-pre-line">{item.excerpt}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Link to={postPath(item.postId)} className="inline-flex min-h-11 items-center text-label text-primary-strong underline underline-offset-4">
                    {OPEN_POST}
                  </Link>
                  {item.offered ? (
                    <span className="text-label text-muted-foreground">{OFFERED}</span>
                  ) : offering === item.postId ? null : (
                    <Button
                      type="button"
                      variant="soft"
                      onClick={() => {
                        setOffering(item.postId);
                        setText('');
                        setTextError(null);
                        setFailure(null);
                      }}
                    >
                      {OFFER_HELP}
                    </Button>
                  )}
                </div>
                {offering === item.postId ? (
                  <form className="mt-3 flex flex-col gap-3" onSubmit={(event) => void send(event, item.postId)}>
                    <FormField label={OFFER_TEXT_LABEL} {...(textError === null ? {} : { error: textError })}>
                      {(control) => <TextArea {...control} rows={3} dir="auto" value={text} onChange={(event) => setText(event.target.value)} />}
                    </FormField>
                    <div className="flex gap-3">
                      <Button type="submit" pending={busy}>
                        {OFFER_SEND}
                      </Button>
                      <Button type="button" variant="text" onClick={() => setOffering(null)}>
                        {CANCEL}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
