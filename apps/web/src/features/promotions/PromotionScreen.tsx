import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { planTargetKind, type PromotionItem, type PromotionOverview, type PromotionPlanKey } from '@nestly/shared';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useProCall } from '@/hooks/use-pro-call';
import { PRO_BILLING_PATH } from '@/lib/professional-link';
import {
  ALREADY_PROMOTED,
  BILLING_LINK,
  BOUGHT,
  BUY,
  BUY_FAILED,
  BUY_HEADING,
  CANCEL,
  CONFIRM_BUY,
  CONFIRM_TITLE,
  LOAD_FAILED,
  MY_PROMOTIONS,
  NOT_ALLOWED,
  NO_POSTS_TO_PROMOTE,
  NO_PROMOTIONS,
  ORGANIC_HEADING,
  ORGANIC_LABELS,
  PAID_HEADING,
  PAID_LABELS,
  PLAN_LABEL,
  POST_PREFIX,
  PROMOTION_INTRO,
  RESULTS_HEADING,
  RETRY,
  SIMULATED_NOTE,
  STATE_LABELS,
  STOP,
  STOP_CONFIRM_TEXT,
  STOP_CONFIRM_TITLE,
  STOPPED_BY_STAFF,
  STOPPED_BY_STAFF_NOTE,
  STOP_FAILED,
  TARGET_KIND_LABELS,
  TARGET_LABEL,
  TARGET_PROFILE,
  countsText,
  planText,
  shekels,
} from '@/lib/promotion-texts';
import { buyPromotion, fetchPromotionOverview, stopOwnPromotion } from '@/services/api/promotions';

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; overview: PromotionOverview };

const PROFILE_TARGET = 'profile';
const ORGANIC_KEYS = ['profileViews', 'profileViewers', 'postViews', 'postReach', 'followers', 'engagement', 'chatStarts'] as const;
const PAID_KEYS = ['impressions', 'clicks', 'profileVisits', 'follows', 'chatStarts', 'sampleSpentIls', 'costPerClickIls'] as const;

/** One of the promoter's promotions: its state ("הקידום הופסק" when staff stopped it, §11.1), its counts, and a stop while it runs. */
export function PromotionRow({ item, onStop, stopping }: { item: PromotionItem; onStop: (id: string) => void; stopping: boolean }) {
  const byStaff = item.state === 'stopped' && item.stoppedBy === 'staff';
  return (
    <li className="rounded-lg bg-card p-4 shadow-card">
      <p className="text-label">
        {TARGET_KIND_LABELS[item.targetKind]}
        {item.targetLabel === null ? null : <span className="text-muted-foreground"> · {item.targetLabel}</span>}
      </p>
      <p className="mt-1 text-small">{byStaff ? STOPPED_BY_STAFF : STATE_LABELS[item.state]}</p>
      {byStaff ? <p className="mt-1 text-small text-muted-foreground">{STOPPED_BY_STAFF_NOTE}</p> : null}
      <p className="mt-1 text-small text-muted-foreground">{countsText(item.counts.impressions, item.counts.clicks)}</p>
      {item.state === 'running' ? (
        <Button type="button" variant="soft" className="mt-2" pending={stopping} onClick={() => onStop(item.id)}>
          {STOP}
        </Button>
      ) : null}
    </li>
  );
}

// The promotion screen (PG-041; FR-SERV-010, FR-PRO-002, BR-047, NFR-SEC-007, AC-098): a Professional buys a promotion of its profile or of one
// of its posts with a simulated payment (sample prices, "מחיר לדוגמה"), sees its promotions and its own results, organic and paid apart (never
// who). A Regular promotes a listing from its listings (FR-MKT-004), not here.
export function PromotionScreen() {
  const call = useProCall();
  const ids = { buy: useId(), mine: useId(), results: useId() };
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [target, setTarget] = useState(PROFILE_TARGET);
  const [plan, setPlan] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  // The running promotion whose stop is being confirmed (irreversible, no refund: §11.1), and whether that stop is in flight.
  const [stopTarget, setStopTarget] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [stopFailure, setStopFailure] = useState<string | null>(null);
  // After a stop the row's button is gone: focus goes to the list's heading instead of being lost.
  const stopped = useRef(false);
  const mineHeading = useRef<HTMLHeadingElement>(null);

  const refresh = useCallback(async () => {
    const result = await call((token) => fetchPromotionOverview(token));
    setLoad(result.kind === 'ok' ? { kind: 'loaded', overview: result.value } : { kind: 'failed' });
  }, [call]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (load.kind === 'loading') return <Skeleton className="h-40" />;
  if (load.kind === 'failed')
    return (
      <div className="flex flex-col gap-3">
        <InlineAlert>{LOAD_FAILED}</InlineAlert>
        <Button type="button" variant="soft" className="self-start" onClick={() => void refresh()}>
          {RETRY}
        </Button>
      </div>
    );

  const { overview } = load;
  const targetKind = target === PROFILE_TARGET ? 'profile' : 'post';
  const plans = overview.plans.filter((p) => p.targetKind === targetKind);
  const chosen = plans.find((p) => p.key === plan) ?? plans[0];
  const targetOptions = [
    { value: PROFILE_TARGET, label: TARGET_PROFILE },
    ...overview.posts.map((post) => ({ value: post.id, label: `${POST_PREFIX}${post.excerpt}` })),
  ];

  async function buy() {
    if (chosen === undefined) return;
    setBusy(true);
    const planKey: PromotionPlanKey = chosen.key;
    const result = await call((token) =>
      buyPromotion(token, { planKey, target: planTargetKind(planKey) === 'profile' ? { kind: 'profile' } : { kind: 'post', postId: target } }),
    );
    setBusy(false);
    setConfirming(false);
    if (result.kind === 'ok') {
      setNotice({ ok: true, text: BOUGHT });
      await refresh();
    } else setNotice({ ok: false, text: result.kind === 'already-done' ? ALREADY_PROMOTED : result.kind === 'not-allowed' ? NOT_ALLOWED : BUY_FAILED });
  }

  async function stop(id: string) {
    setStopping(true);
    setStopFailure(null);
    const result = await call((token) => stopOwnPromotion(token, id));
    setStopping(false);
    if (result.kind !== 'ok') {
      setStopFailure(STOP_FAILED);
      return;
    }
    stopped.current = true;
    setStopTarget(null);
    await refresh();
  }

  const analytics = overview.analytics;
  return (
    <div className="flex flex-col gap-6">
      <p>{PROMOTION_INTRO}</p>
      <section aria-labelledby={ids.buy} className="rounded-lg bg-card p-4 shadow-card">
        <h2 id={ids.buy} className="text-h3">
          {BUY_HEADING}
        </h2>
        <p className="mt-1 text-small text-muted-foreground">{SIMULATED_NOTE}</p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={TARGET_LABEL}>
            {(control) => <SelectInput {...control} options={targetOptions} placeholder={TARGET_LABEL} value={target} onChange={(value) => { setTarget(value); setPlan(''); }} />}
          </FormField>
          <FormField label={PLAN_LABEL}>
            {(control) => (
              <SelectInput
                {...control}
                options={plans.map((p) => ({ value: p.key, label: planText(p.key, p.samplePriceIls) }))}
                placeholder={PLAN_LABEL}
                value={chosen?.key ?? ''}
                onChange={setPlan}
              />
            )}
          </FormField>
        </div>
        {overview.posts.length === 0 ? <p className="mt-2 text-small text-muted-foreground">{NO_POSTS_TO_PROMOTE}</p> : null}
        {notice === null ? null : notice.ok ? <p role="status" className="mt-3">{notice.text}</p> : <InlineAlert>{notice.text}</InlineAlert>}
        <Button type="button" className="mt-3" disabled={chosen === undefined} onClick={() => { setNotice(null); setConfirming(true); }}>
          {BUY}
        </Button>
      </section>

      <section aria-labelledby={ids.mine}>
        <h2 id={ids.mine} ref={mineHeading} tabIndex={-1} className="text-h3">
          {MY_PROMOTIONS}
        </h2>
        {overview.promotions.length === 0 ? <p className="mt-2 text-muted-foreground">{NO_PROMOTIONS}</p> : null}
        <ul aria-label={MY_PROMOTIONS} className="mt-3 flex flex-col gap-3">
          {overview.promotions.map((item) => (
            <PromotionRow
              key={item.id}
              item={item}
              stopping={stopping && stopTarget === item.id}
              onStop={(id) => {
                setStopFailure(null);
                setStopTarget(id);
              }}
            />
          ))}
        </ul>
        <Link to={PRO_BILLING_PATH} className="mt-3 inline-flex min-h-11 items-center text-label text-primary-strong underline underline-offset-4">
          {BILLING_LINK}
        </Link>
      </section>

      {analytics === null ? null : (
        <section aria-labelledby={ids.results}>
          <h2 id={ids.results} className="text-h3">
            {RESULTS_HEADING}
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-card p-4 shadow-card">
              <h3 className="text-label">{ORGANIC_HEADING}</h3>
              <dl className="mt-2 flex flex-col gap-1 text-small">
                {ORGANIC_KEYS.map((key) => (
                  <div key={key} className="flex justify-between gap-4">
                    <dt>{ORGANIC_LABELS[key]}</dt>
                    <dd>{analytics.organic[key]}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="rounded-lg bg-card p-4 shadow-card">
              <h3 className="text-label">{PAID_HEADING}</h3>
              <dl className="mt-2 flex flex-col gap-1 text-small">
                {PAID_KEYS.map((key) => {
                  const value = analytics.paid[key];
                  const text = value === null ? '—' : key === 'sampleSpentIls' || key === 'costPerClickIls' ? shekels(value) : String(value);
                  return (
                    <div key={key} className="flex justify-between gap-4">
                      <dt>{PAID_LABELS[key]}</dt>
                      <dd>{text}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirming}
        title={CONFIRM_TITLE}
        description={chosen === undefined ? undefined : `${planText(chosen.key, chosen.samplePriceIls)}. ${SIMULATED_NOTE}`}
        confirmLabel={CONFIRM_BUY}
        cancelLabel={CANCEL}
        pending={busy}
        onConfirm={() => void buy()}
        onCancel={() => {
          if (!busy) setConfirming(false);
        }}
      />

      <ConfirmDialog
        open={stopTarget !== null}
        title={STOP_CONFIRM_TITLE}
        description={STOP_CONFIRM_TEXT}
        confirmLabel={STOP}
        cancelLabel={CANCEL}
        pending={stopping}
        failure={stopFailure}
        finalFocus={() => {
          if (!stopped.current) return null;
          stopped.current = false;
          return mineHeading.current;
        }}
        onConfirm={() => {
          if (stopTarget !== null && !stopping) void stop(stopTarget);
        }}
        onCancel={() => {
          if (!stopping) setStopTarget(null);
        }}
      />
    </div>
  );
}
