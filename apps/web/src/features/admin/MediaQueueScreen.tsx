import { GuardedImage } from './GuardedImage';
import { useCallback, useEffect, useState } from 'react';
import { MEDIA_QUEUE_PAGE, type MatchDecision, type MediaDecision, type MediaQueueItem } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminCall } from '@/hooks/use-admin-call';
import { decideMedia, decideMediaMatch, fetchMediaQueue } from '@/services/api/admin';
import { formatAdminTime } from './admin-format';
import {
  FORBIDDEN_TEXT,
  LOAD_FAILED_TEXT,
  LOADING_TEXT,
  MEDIA_APPROVE_LABEL,
  MEDIA_CHILD_LABEL,
  MEDIA_DECIDED_TEXT,
  MEDIA_GONE_TEXT,
  MEDIA_IMAGE_ALT,
  MEDIA_KIND_LABELS,
  MEDIA_NO_IMAGE,
  MEDIA_QUEUE_EMPTY,
  MEDIA_QUEUE_INTRO,
  MEDIA_QUEUE_LIST_LABEL,
  MEDIA_REASON_LABELS,
  MEDIA_REJECT_LABEL,
  MEDIA_SUSPECT_HINT,
  MATCH_CONFIRM_LABEL,
  MATCH_HINT,
  MATCH_NOT_ABUSE_LABEL,
  MEDIA_SUSPECT_LABEL,
  mediaScoreText,
  RETRY_LABEL,
} from './admin-texts';

type View = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; items: MediaQueueItem[]; full: boolean };

// The image approval queue (Afik 20.10.2026; BR-076 as replaced): images the automatic check blocked, was unsure about or could not check.
// The Admin, or a Moderator with CONTENT_MODERATE, approves or rejects each one, marking "a child is in the image" where it applies, or
// marks a suspicion of child abuse (the image is removed and kept 90 days; its uploader sees an ordinary rejection). The database decides who
// may see and decide; this screen only shows what it returns.
export function MediaQueueScreen() {
  const call = useAdminCall();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setView({ kind: 'loading' });
    const outcome = await call((token) => fetchMediaQueue(token));
    if (outcome.kind === 'ok') setView({ kind: 'loaded', items: outcome.value.items, full: outcome.value.items.length >= MEDIA_QUEUE_PAGE });
    else setView({ kind: 'failed', message: outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  // a full page decided: more images may wait behind it, so ask again rather than show the queue as empty
  const pageDone = view.kind === 'loaded' && view.full && view.items.length === 0;
  useEffect(() => {
    if (pageDone) void load();
  }, [pageDone, load]);

  const decided = (id: string, message: string) => {
    setNotice(message);
    setView((current) => (current.kind === 'loaded' ? { ...current, items: current.items.filter((item) => item.id !== id) } : current));
  };

  if (view.kind === 'loading') {
    return (
      <div role="status" aria-label={LOADING_TEXT} className="flex flex-col gap-3">
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (view.kind === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <InlineAlert>{view.message}</InlineAlert>
        <Button variant="soft" onClick={() => void load()}>
          {RETRY_LABEL}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-muted-foreground">{MEDIA_QUEUE_INTRO}</p>
      <p role="status" className="text-small">
        {notice}
      </p>
      {view.items.length === 0 ? (
        <p>{MEDIA_QUEUE_EMPTY}</p>
      ) : (
        <ul aria-label={MEDIA_QUEUE_LIST_LABEL} className="grid gap-4 sm:grid-cols-2">
          {view.items.map((item) => (
            <QueueCard key={item.id} item={item} onDone={decided} />
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueCard({ item, onDone }: { item: MediaQueueItem; onDone: (id: string, message: string) => void }) {
  const call = useAdminCall();
  const [isChild, setIsChild] = useState(item.isChild);
  const [busy, setBusy] = useState<MediaDecision | null>(null);
  const [error, setError] = useState('');
  const headingId = `media-${item.id}`;

  const isMatch = item.queueReason === 'hash_match';
  const [matchBusy, setMatchBusy] = useState<MatchDecision | null>(null);
  const decideMatch = async (decision: MatchDecision) => {
    setMatchBusy(decision);
    setError('');
    const outcome = await call((token) => decideMediaMatch(token, item.id, decision));
    setMatchBusy(null);
    if (outcome.kind === 'ok') onDone(item.id, MEDIA_DECIDED_TEXT);
    else if (outcome.kind === 'not-found') onDone(item.id, MEDIA_GONE_TEXT);
    else setError(outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT);
  };

  const decide = async (decision: MediaDecision) => {
    setBusy(decision);
    setError('');
    const outcome = await call((token) => decideMedia(token, item.id, decision, isChild));
    setBusy(null);
    if (outcome.kind === 'ok') onDone(item.id, MEDIA_DECIDED_TEXT);
    else if (outcome.kind === 'not-found') onDone(item.id, MEDIA_GONE_TEXT);
    else setError(outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT);
  };

  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h3 id={headingId} className="text-label">
        {MEDIA_KIND_LABELS[item.kind]} · {MEDIA_REASON_LABELS[item.queueReason]}
      </h3>
      {item.url === null ? (
        <p className="text-small text-muted-foreground">{MEDIA_NO_IMAGE}</p>
      ) : (
        <GuardedImage>
          <img src={item.url} alt={MEDIA_IMAGE_ALT} width={item.width} height={item.height} className="max-h-80 w-full rounded-md object-contain bg-muted" />
        </GuardedImage>
      )}
      <p className="text-small text-muted-foreground">
        {item.topScore === null ? null : <span dir="auto">{mediaScoreText(item.topScore)} · </span>}
        <time dateTime={item.createdAt}>{formatAdminTime(item.createdAt)}</time>
      </p>
      {isMatch ? (
        <>
          {error === '' ? null : <InlineAlert>{error}</InlineAlert>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void decideMatch('confirmed')} pending={matchBusy === 'confirmed'} disabled={matchBusy !== null} aria-describedby={`${headingId}-match`}>
              {MATCH_CONFIRM_LABEL}
            </Button>
            <Button variant="soft" onClick={() => void decideMatch('not_abuse')} pending={matchBusy === 'not_abuse'} disabled={matchBusy !== null} aria-describedby={`${headingId}-match`}>
              {MATCH_NOT_ABUSE_LABEL}
            </Button>
          </div>
          <p id={`${headingId}-match`} className="text-small text-muted-foreground">
            {MATCH_HINT}
          </p>
        </>
      ) : (
        <>
      <Checkbox checked={isChild} onCheckedChange={setIsChild} disabled={busy !== null}>
        {MEDIA_CHILD_LABEL}
      </Checkbox>
      {error === '' ? null : <InlineAlert>{error}</InlineAlert>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void decide('approved')} pending={busy === 'approved'} disabled={busy !== null && busy !== 'approved'}>
          {MEDIA_APPROVE_LABEL}
        </Button>
        <Button variant="soft" onClick={() => void decide('rejected')} pending={busy === 'rejected'} disabled={busy !== null && busy !== 'rejected'}>
          {MEDIA_REJECT_LABEL}
        </Button>
        <Button variant="soft" onClick={() => void decide('suspected')} pending={busy === 'suspected'} disabled={busy !== null && busy !== 'suspected'} aria-describedby={`${headingId}-hint`}>
          {MEDIA_SUSPECT_LABEL}
        </Button>
      </div>
      <p id={`${headingId}-hint`} className="text-small text-muted-foreground">
        {MEDIA_SUSPECT_HINT}
      </p>
        </>
      )}
    </li>
  );
}
