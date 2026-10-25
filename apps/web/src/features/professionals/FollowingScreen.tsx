import { useCallback, useEffect, useRef, useState } from 'react';
import { RatingLine } from '@/components/domain/star-rating';
import { Link } from 'react-router';
import type { ProfessionalCard } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProCall } from '@/hooks/use-pro-call';
import { professionalPagePath, SERVICES_PATH } from '@/lib/professional-link';
import {
  ACTION_FAILED,
  DIRECTORY_TITLE,
  FOLLOWING_EMPTY,
  FOLLOWING_LIST_LABEL,
  LOAD_FAILED,
  RETRY,
  UNFOLLOW,
  unfollowedText,
  areaText,
  fieldText,
  unfollowSuffix,
} from '@/lib/professional-texts';
import { fetchFollowing, setFollow } from '@/services/api/professionals';

type Loaded = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; cards: ProfessionalCard[] };

// The Professionals the caller follows (PG-039, FR-FOLLOW-001), from the side menu: each with a link to its page and "הפסקת מעקב". Whom the caller
// follows is the server's answer (the caller's own Follow rows); nobody else sees this list.
export function FollowingScreen() {
  const call = useProCall();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const running = useRef(false);

  const load = useCallback(async () => {
    const result = await call(fetchFollowing);
    setLoaded(result.kind === 'ok' ? { kind: 'loaded', cards: result.value } : { kind: 'failed' });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  async function unfollow(card: ProfessionalCard) {
    if (running.current) return;
    running.current = true;
    setBusyId(card.id);
    setFailure(null);
    try {
      const result = await call((token) => setFollow(token, card.id, false));
      if (result.kind !== 'ok') {
        setFailure(ACTION_FAILED);
        return;
      }
      setLoaded((current) => (current.kind === 'loaded' ? { kind: 'loaded', cards: current.cards.filter((item) => item.id !== card.id) } : current));
      setStatus(unfollowedText(card.fullName));
    } finally {
      running.current = false;
      setBusyId(null);
    }
  }

  if (loaded.kind === 'loading') return <Skeleton className="h-40 w-full" />;
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
  return (
    <div className="flex flex-col gap-4">
      {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
      <p role="status" className={status === '' ? 'sr-only' : 'text-label'}>
        {status}
      </p>
      {loaded.cards.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground">{FOLLOWING_EMPTY}</p>
          <Link to={SERVICES_PATH} className="inline-flex min-h-11 items-center self-start text-label text-primary-strong underline underline-offset-4">
            {DIRECTORY_TITLE}
          </Link>
        </div>
      ) : (
        <ul aria-label={FOLLOWING_LIST_LABEL} className="flex flex-col gap-3">
          {loaded.cards.map((card) => (
            <li key={card.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-card p-4 shadow-card">
              <div className="min-w-0">
                <Link to={professionalPagePath(card.id)} className="text-h3 text-primary-strong underline-offset-4 hover:underline">
                  {card.fullName}
                </Link>
                <p className="mt-1 text-label">{fieldText(card.field, card.fieldOther)}</p>
                {card.area === null ? null : <p className="mt-1 text-small text-muted-foreground">{areaText(card.area)}</p>}
                <RatingLine rating={card.rating} count={card.reviewCount} className="mt-1" />
              </div>
              <Button type="button" variant="soft" pending={busyId === card.id} onClick={() => void unfollow(card)}>
                {UNFOLLOW}
                <span className="sr-only">{unfollowSuffix(card.fullName)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
