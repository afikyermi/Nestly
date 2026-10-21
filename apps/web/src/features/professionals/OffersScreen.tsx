import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { professionalTag, type OutreachItem } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProCall } from '@/hooks/use-pro-call';
import { conversationPath } from '@/lib/chat-link';
import { formatPostTime } from '@/lib/format-post-time';
import { professionalPagePath } from '@/lib/professional-link';
import {
  ACCEPT,
  ACTION_FAILED,
  DECLINE,
  LOAD_FAILED,
  NO_OFFERS,
  OFFERS_INTRO,
  OFFERS_RECEIVED,
  OFFERS_SENT,
  ON_POST,
  OPEN_CONVERSATION,
  RETRY,
  STATUS_LABELS,
} from '@/lib/professional-texts';
import { acceptOutreach, declineOutreach, fetchOutreach } from '@/services/api/professionals';

type Loaded = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; received: OutreachItem[]; sent: OutreachItem[] };

// Offer Help, both sides (FR-SERV-005/006, BR-010, VAL-011): the author of a post that asked for help sees each Professional's offer and its first
// message, and accepts (a conversation opens: AC-012/013), declines, or leaves it (ignore). A Professional sees the offers it sent and their status.
// Nothing here names the author of an anonymous post: the server never sends one.
export function OffersScreen() {
  const call = useProCall();
  const navigate = useNavigate();
  const receivedId = useId();
  const sentId = useId();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef(false);

  const load = useCallback(async () => {
    const result = await call(fetchOutreach);
    setLoaded(result.kind === 'ok' ? { kind: 'loaded', received: result.value.received, sent: result.value.sent } : { kind: 'failed' });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  async function answer(item: OutreachItem, accept: boolean) {
    if (running.current) return;
    running.current = true;
    setBusy(item.id);
    setFailure(null);
    try {
      if (accept) {
        const result = await call((token) => acceptOutreach(token, item.id));
        if (result.kind === 'ok') {
          void navigate(conversationPath(result.value.conversationId));
          return;
        }
        setFailure(ACTION_FAILED);
      } else {
        const result = await call((token) => declineOutreach(token, item.id));
        if (result.kind === 'ok') await load();
        else setFailure(ACTION_FAILED);
      }
    } finally {
      running.current = false;
      setBusy(null);
    }
  }

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

  const list = (items: OutreachItem[], label: string, side: 'received' | 'sent') =>
    items.length === 0 ? (
      <p className="mt-2 text-muted-foreground">{NO_OFFERS}</p>
    ) : (
      <ul aria-label={label} className="mt-3 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg bg-card p-4 shadow-card">
            {side === 'received' ? (
              <p>
                <Link to={professionalPagePath(item.professionalId)} className="text-label text-primary-strong underline underline-offset-4">
                  {item.professionalName ?? ''}
                </Link>
                {item.field === null ? null : <span className="text-small text-muted-foreground"> · {professionalTag(item.field, item.fieldOther)}</span>}
              </p>
            ) : null}
            {item.postExcerpt === null ? null : (
              <p className="mt-1 text-small text-muted-foreground">
                {ON_POST} {item.postExcerpt}
              </p>
            )}
            <p className="mt-2 whitespace-pre-line">{item.text}</p>
            <p className="mt-1 text-small text-muted-foreground">
              {STATUS_LABELS[item.status]} · {formatPostTime(item.at)}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {side === 'received' && item.status === 'pending' ? (
                <>
                  <Button type="button" pending={busy === item.id} onClick={() => void answer(item, true)}>
                    {ACCEPT}
                  </Button>
                  <Button type="button" variant="soft" onClick={() => void answer(item, false)}>
                    {DECLINE}
                  </Button>
                </>
              ) : null}
              {item.conversationId === null ? null : (
                <Link to={conversationPath(item.conversationId)} className="inline-flex min-h-11 items-center text-label text-primary-strong underline underline-offset-4">
                  {OPEN_CONVERSATION}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">{OFFERS_INTRO}</p>
      {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
      <section aria-labelledby={receivedId}>
        <h2 id={receivedId} className="text-h3">
          {OFFERS_RECEIVED}
        </h2>
        {list(loaded.received, OFFERS_RECEIVED, 'received')}
      </section>
      {loaded.sent.length === 0 ? null : (
        <section aria-labelledby={sentId}>
          <h2 id={sentId} className="text-h3">
            {OFFERS_SENT}
          </h2>
          {list(loaded.sent, OFFERS_SENT, 'sent')}
        </section>
      )}
    </div>
  );
}
