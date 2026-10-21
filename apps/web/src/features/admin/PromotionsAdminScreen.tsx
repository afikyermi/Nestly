import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import type { AdminPromotionItem, AdminPromotions, PromotionSettingsVersion } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextArea } from '@/components/ui/text-area';
import { TextInput } from '@/components/ui/text-input';
import { useAdminCall } from '@/hooks/use-admin-call';
import { ACTION_FAILED_TEXT, FORBIDDEN_TEXT, LOAD_FAILED_TEXT, LOADING_TEXT, RETRY_LABEL } from './admin-texts';
import { formatPostTime } from '@/lib/format-post-time';
import {
  ADMIN_PROMOTIONS_INTRO,
  ADMIN_STOP,
  ADMIN_STOPPED,
  ADMIN_STOP_REASON,
  ADMIN_TOTALS,
  NO_ADMIN_PROMOTIONS,
  OWNER_LABEL,
  PLAN_LABELS,
  REASON_REQUIRED,
  REASON_TOO_LONG,
  SAVE_SETTINGS,
  SETTINGS_FAILED,
  SETTINGS_HEADING,
  SETTINGS_INTRO,
  SETTINGS_INVALID,
  SETTINGS_LABELS,
  SETTINGS_SAVED,
  STATE_LABELS,
  STOPPED_BY_STAFF_SHORT,
  TARGET_KIND_LABELS,
  countsText,
  revenueText,
  totalsText,
  versionText,
} from '@/lib/promotion-texts';
import { fetchAdminPromotions, fetchPromotionSettings, savePromotionSettings, staffStopPromotion } from '@/services/api/promotions';

type View = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; data: AdminPromotions };

// The staff's promotions (§11.1; FR-SERV-010, FR-MKT-004): the Admin sees every promotion and the simulated payments' totals; a Moderator with
// CONTENT_MODERATE the Professionals' promotions, with MARKETPLACE_MODERATE the listings'. A running one is stopped with a reason, which the
// database writes to the Audit Log in the same step; there is no refund and the promoter sees "הקידום הופסק". The Admin also keeps the settings
// of promoted units (§11.2), as versions with a reason.
export function PromotionsAdminScreen() {
  const call = useAdminCall();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setView({ kind: 'loading' });
    const outcome = await call((token) => fetchAdminPromotions(token));
    setView(outcome.kind === 'ok' ? { kind: 'loaded', data: outcome.value } : { kind: 'failed', message: outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
  }, [call]);
  useEffect(() => {
    void load();
  }, [load]);

  if (view.kind === 'loading')
    return (
      <div role="status" aria-label={LOADING_TEXT} className="flex flex-col gap-3">
        <Skeleton />
        <Skeleton />
      </div>
    );
  if (view.kind === 'failed')
    return (
      <div className="flex flex-col items-start gap-3">
        <InlineAlert>{view.message}</InlineAlert>
        <Button variant="soft" onClick={() => void load()}>
          {RETRY_LABEL}
        </Button>
      </div>
    );

  const { data } = view;
  return (
    <div className="flex flex-col gap-6">
      <p>{ADMIN_PROMOTIONS_INTRO}</p>
      <section className="rounded-lg bg-card p-4 shadow-card">
        <h3 className="text-label">{ADMIN_TOTALS}</h3>
        <p className="mt-1">{totalsText(data.totals)}</p>
        {data.isFinance ? <p className="mt-1 text-small text-muted-foreground">{countsText(data.totals.impressions, data.totals.clicks)}</p> : null}
        {data.isFinance ? <p className="mt-1 text-small text-muted-foreground">{revenueText(data.totals.payments, data.totals.sampleRevenueIls)}</p> : null}
      </section>
      <p role="status" className="text-small">
        {notice}
      </p>
      {data.promotions.length === 0 ? <p>{NO_ADMIN_PROMOTIONS}</p> : null}
      <ul aria-label={ADMIN_PROMOTIONS_INTRO} className="flex flex-col gap-3">
        {data.promotions.map((item) => (
          <li key={item.id}>
            <StaffPromotionCard
              item={item}
              showCounts={data.isFinance}
              onStopped={() => {
                setNotice(ADMIN_STOPPED);
                setView((now) =>
                  now.kind === 'loaded'
                    ? {
                        kind: 'loaded',
                        data: {
                          ...now.data,
                          totals: { ...now.data.totals, running: Math.max(0, now.data.totals.running - 1), stopped: now.data.totals.stopped + 1 },
                          promotions: now.data.promotions.map((row) => (row.id === item.id ? { ...row, state: 'stopped', stoppedBy: 'staff' } : row)),
                        },
                      }
                    : now,
                );
              }}
            />
          </li>
        ))}
      </ul>
      {data.isFinance ? <SettingsPanel /> : null}
    </div>
  );
}

// A Moderator reads no paid event (BILLING_FINANCE_MANAGE is Admin Only), so the counts are the Admin's only.
function StaffPromotionCard({ item, showCounts, onStopped }: { item: AdminPromotionItem; showCounts: boolean; onStopped: () => void }) {
  const call = useAdminCall();
  const id = useId();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const stop = async () => {
    const text = reason.trim();
    if (text === '') return setProblem(REASON_REQUIRED);
    if (text.length > 500) return setProblem(REASON_TOO_LONG);
    setProblem('');
    setBusy(true);
    const outcome = await call((token) => staffStopPromotion(token, item.id, text));
    setBusy(false);
    if (outcome.kind === 'ok') {
      setReason('');
      onStopped();
    } else setProblem(outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : ACTION_FAILED_TEXT);
  };

  const state = item.state === 'stopped' && item.stoppedBy === 'staff' ? STOPPED_BY_STAFF_SHORT : STATE_LABELS[item.state];
  return (
    <article aria-labelledby={`${id}-title`} className="rounded-lg bg-card p-4 shadow-card">
      <h3 id={`${id}-title`} className="text-label">
        {TARGET_KIND_LABELS[item.targetKind]} · {PLAN_LABELS[item.planKey]} · {state}
      </h3>
      <p className="mt-1 text-small">
        {OWNER_LABEL}: <span dir="auto">{item.ownerName ?? '—'}</span>
      </p>
      <p className="mt-1 text-small text-muted-foreground">
        <time dateTime={item.startsAt}>{formatPostTime(item.startsAt)}</time> – <time dateTime={item.endsAt}>{formatPostTime(item.endsAt)}</time>
        {showCounts ? ` · ${countsText(item.impressions, item.clicks)}` : null}
      </p>
      {item.state === 'running' ? (
        <div className="mt-2 flex flex-col gap-2">
          <FormField label={ADMIN_STOP_REASON} htmlFor={`${id}-reason`} {...(problem === '' ? {} : { error: problem })}>
            {(control) => <TextArea {...control} rows={2} dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} />}
          </FormField>
          <Button variant="primary" className="self-start" pending={busy} disabled={busy} onClick={() => void stop()}>
            {ADMIN_STOP}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

type SettingsField = Exclude<keyof typeof SETTINGS_LABELS, 'reason'>;
const NUMBER_FIELDS: readonly SettingsField[] = ['dailyCap', 'directoryUnitsPerPage', 'feedGapMin', 'feedGapMax', 'feedLowPosts', 'feedHighPosts'];

/** §11.2, BR-059: the Admin's settings of promoted units — the newest version in the fields, saved as a new version with a reason. */
function SettingsPanel() {
  const call = useAdminCall();
  const headingId = useId();
  const [versions, setVersions] = useState<PromotionSettingsVersion[] | null>(null);
  const [values, setValues] = useState<Record<SettingsField, string>>({ dailyCap: '', directoryUnitsPerPage: '', feedGapMin: '', feedGapMax: '', feedLowPosts: '', feedHighPosts: '' });
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const outcome = await call((token) => fetchPromotionSettings(token));
    if (outcome.kind !== 'ok') return;
    setVersions(outcome.value.versions);
    const [newest] = outcome.value.versions;
    if (newest !== undefined)
      setValues({
        dailyCap: String(newest.dailyCap),
        directoryUnitsPerPage: String(newest.directoryUnitsPerPage),
        feedGapMin: String(newest.feedGapMin),
        feedGapMax: String(newest.feedGapMax),
        feedLowPosts: String(newest.feedLowPosts),
        feedHighPosts: String(newest.feedHighPosts),
      });
  }, [call]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const numbers = {
      dailyCap: Number(values.dailyCap),
      directoryUnitsPerPage: Number(values.directoryUnitsPerPage),
      feedGapMin: Number(values.feedGapMin),
      feedGapMax: Number(values.feedGapMax),
      feedLowPosts: Number(values.feedLowPosts),
      feedHighPosts: Number(values.feedHighPosts),
    };
    const text = reason.trim();
    if (text === '') return setMessage({ ok: false, text: REASON_REQUIRED });
    if (NUMBER_FIELDS.some((key) => !/^\d{1,6}$/.test(values[key].trim())) || numbers.feedGapMax < numbers.feedGapMin || numbers.feedHighPosts <= numbers.feedLowPosts)
      return setMessage({ ok: false, text: SETTINGS_INVALID });
    setBusy(true);
    const outcome = await call((token) => savePromotionSettings(token, { ...numbers, reason: text }));
    setBusy(false);
    if (outcome.kind === 'ok') {
      setReason('');
      setMessage({ ok: true, text: SETTINGS_SAVED });
      await load();
    } else setMessage({ ok: false, text: outcome.kind === 'invalid' ? SETTINGS_INVALID : SETTINGS_FAILED });
  }

  return (
    <section aria-labelledby={headingId} className="rounded-lg bg-card p-4 shadow-card">
      <h3 id={headingId} className="text-h3">
        {SETTINGS_HEADING}
      </h3>
      <p className="mt-1 text-small text-muted-foreground">{SETTINGS_INTRO}</p>
      <form onSubmit={(event) => void save(event)} className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {NUMBER_FIELDS.map((key) => (
          <FormField key={key} label={SETTINGS_LABELS[key]}>
            {(control) => <TextInput {...control} dir="ltr" value={values[key]} onChange={(event) => setValues((now) => ({ ...now, [key]: event.target.value }))} />}
          </FormField>
        ))}
        <FormField label={SETTINGS_LABELS.reason} className="sm:col-span-2">
          {(control) => <TextArea {...control} rows={2} dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} />}
        </FormField>
        <div className="sm:col-span-2">
          {message === null ? null : message.ok ? <p role="status">{message.text}</p> : <InlineAlert>{message.text}</InlineAlert>}
          <Button type="submit" className="mt-2" pending={busy}>
            {SAVE_SETTINGS}
          </Button>
        </div>
      </form>
      {versions === null || versions.length === 0 ? null : (
        <ul className="mt-4 flex flex-col gap-2 text-small">
          {versions.map((version) => (
            <li key={version.version}>
              <span className="text-label">{versionText(version.version)}</span> · <time dateTime={version.at}>{formatPostTime(version.at)}</time> ·{' '}
              <span dir="auto">{version.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
