import { useCallback, useEffect, useId, useState } from 'react';
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_TITLE_MIN,
  JOURNEY_STAGES,
  codePointLength,
  type Announcement,
  type AnnouncementAudience,
  type JourneyStage,
} from '@nestly/shared';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextArea } from '@/components/ui/text-area';
import { SelectInput } from '@/components/ui/select-input';
import { TextInput } from '@/components/ui/text-input';
import { useAdminCall } from '@/hooks/use-admin-call';
import { STAGE_LABELS } from '@/lib/child-fields';
import type { AdminOutcome } from '@/services/api/admin';
import { createAnnouncement, editAnnouncement, fetchAnnouncements, setAnnouncementStatus } from '@/services/api/team';
import { formatAdminTime } from './admin-format';
import { ACTION_FAILED_TEXT, FORBIDDEN_TEXT, LOAD_FAILED_TEXT, LOADING_TEXT, NOT_FOUND_TEXT, RETRY_LABEL } from './admin-texts';
import {
  ANNOUNCEMENT_BODY_ERROR,
  ANNOUNCEMENT_BODY_LABEL,
  ANNOUNCEMENT_CANCEL,
  ANNOUNCEMENT_CREATE,
  ANNOUNCEMENT_EDIT,
  ANNOUNCEMENT_NEW_HEADING,
  ANNOUNCEMENT_PUBLISH,
  ANNOUNCEMENT_PUBLISHED,
  ANNOUNCEMENT_REMOVE,
  ANNOUNCEMENT_REMOVE_CONFIRM_TEXT,
  ANNOUNCEMENT_REMOVE_CONFIRM_TITLE,
  ANNOUNCEMENT_REMOVED,
  ANNOUNCEMENT_SAVE,
  ANNOUNCEMENT_SAVED,
  ANNOUNCEMENT_STATUS,
  ANNOUNCEMENT_TITLE_ERROR,
  ANNOUNCEMENT_TITLE_LABEL,
  ANNOUNCEMENTS_EMPTY,
  AUDIENCE_LABEL,
  AUDIENCE_LABELS,
  AUDIENCE_STAGE_LABEL,
  audienceText,
} from './team-texts';

interface Audience {
  audience: AnnouncementAudience;
  audienceStage: JourneyStage | null;
}
const EVERYONE: Audience = { audience: 'everyone', audienceStage: null };
const isAudience = (value: string): value is AnnouncementAudience => ANNOUNCEMENT_AUDIENCES.some((a) => a === value);
const isStage = (value: string): value is JourneyStage => JOURNEY_STAGES.some((s) => s === value);

// I14 completion B (FR-ADMIN-008, OP-042, VAL-050): who reads the announcement once published: one choice from the list; a stage names one
// of the journey stages (the first is offered when "a stage" is chosen).
function AudienceFields({ id, value, onChange }: { id: string; value: Audience; onChange: (next: Audience) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      <FormField label={AUDIENCE_LABEL} htmlFor={`${id}-audience`} className="min-w-44">
        {(control) => (
          <SelectInput
            {...control}
            options={ANNOUNCEMENT_AUDIENCES.map((a) => ({ value: a, label: AUDIENCE_LABELS[a] }))}
            value={value.audience}
            placeholder="—"
            onChange={(next) => {
              if (isAudience(next)) onChange({ audience: next, audienceStage: next === 'stage' ? (value.audienceStage ?? 'pregnant') : null });
            }}
          />
        )}
      </FormField>
      {value.audience === 'stage' ? (
        <FormField label={AUDIENCE_STAGE_LABEL} htmlFor={`${id}-stage`} className="min-w-44">
          {(control) => (
            <SelectInput
              {...control}
              options={JOURNEY_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
              value={value.audienceStage ?? 'pregnant'}
              placeholder="—"
              onChange={(next) => {
                if (isStage(next)) onChange({ audience: 'stage', audienceStage: next });
              }}
            />
          )}
        </FormField>
      ) : null}
    </div>
  );
}

type View = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'loaded'; items: Announcement[] };

const failureText = (outcome: AdminOutcome<unknown>): string =>
  outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : outcome.kind === 'not-found' || outcome.kind === 'not-applicable' ? NOT_FOUND_TEXT : ACTION_FAILED_TEXT;

function problemsOf(title: string, body: string): { title?: string; body?: string } {
  const t = codePointLength(title.trim());
  const b = codePointLength(body.trim());
  return {
    ...(t < ANNOUNCEMENT_TITLE_MIN || t > ANNOUNCEMENT_TITLE_MAX ? { title: ANNOUNCEMENT_TITLE_ERROR } : {}),
    ...(b < 1 || b > ANNOUNCEMENT_BODY_MAX ? { body: ANNOUNCEMENT_BODY_ERROR } : {}),
  };
}

// System Announcements (FR-ADMIN-008, UC-29, PG-032, AC-049): SYSTEM_ANNOUNCEMENTS (the Admin always). A new announcement is a draft; it is edited,
// published (everyone sees it at the top of the feed) and removed (final, asked first). The database stamps the times and audits every change.
export function AnnouncementsScreen() {
  const call = useAdminCall();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const outcome = await call((token) => fetchAnnouncements(token));
    setView(outcome.kind === 'ok' ? { kind: 'loaded', items: outcome.value.items } : { kind: 'failed', message: outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  const replaced = (item: Announcement, message: string) => {
    setNotice(message);
    setView((now) => (now.kind === 'loaded' ? { ...now, items: now.items.map((row) => (row.id === item.id ? item : row)) } : now));
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
    <div className="flex flex-col gap-8">
      <NewAnnouncement
        onCreated={(item) => {
          setNotice(ANNOUNCEMENT_SAVED);
          setView((now) => (now.kind === 'loaded' ? { ...now, items: [item, ...now.items] } : now));
        }}
      />
      <p role="status" className="text-small">
        {notice}
      </p>
      {view.items.length === 0 ? (
        <p>{ANNOUNCEMENTS_EMPTY}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {view.items.map((item) => (
            <li key={item.id}>
              <AnnouncementCard item={item} onChanged={replaced} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewAnnouncement({ onCreated }: { onCreated: (item: Announcement) => void }) {
  const call = useAdminCall();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>(EVERYONE);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const problems = checked ? problemsOf(title, body) : {};

  const create = async () => {
    setChecked(true);
    const found = problemsOf(title, body);
    if (found.title !== undefined || found.body !== undefined) return;
    setBusy(true);
    setError('');
    const outcome = await call((token) => createAnnouncement(token, { title: title.trim(), body: body.trim(), ...audience }));
    setBusy(false);
    if (outcome.kind === 'ok') {
      setTitle('');
      setBody('');
      setAudience(EVERYONE);
      setChecked(false);
      onCreated(outcome.value);
    } else {
      setError(failureText(outcome));
    }
  };

  return (
    <section aria-labelledby="announcement-new" className="flex flex-col gap-3">
      <h3 id="announcement-new" className="text-h3">
        {ANNOUNCEMENT_NEW_HEADING}
      </h3>
      <FormField label={ANNOUNCEMENT_TITLE_LABEL} htmlFor="announcement-new-title" {...(problems.title !== undefined ? { error: problems.title } : {})}>
        {(control) => <TextInput {...control} value={title} onChange={(event) => setTitle(event.target.value)} />}
      </FormField>
      <FormField label={ANNOUNCEMENT_BODY_LABEL} htmlFor="announcement-new-body" {...(problems.body !== undefined ? { error: problems.body } : {})}>
        {(control) => <TextArea {...control} rows={4} value={body} onChange={(event) => setBody(event.target.value)} />}
      </FormField>
      <AudienceFields id="announcement-new" value={audience} onChange={setAudience} />
      <div>
        <Button variant="primary" pending={busy} disabled={busy} onClick={() => void create()}>
          {ANNOUNCEMENT_CREATE}
        </Button>
      </div>
      {error === '' ? null : <InlineAlert>{error}</InlineAlert>}
    </section>
  );
}

function AnnouncementCard({ item, onChanged }: { item: Announcement; onChanged: (item: Announcement, message: string) => void }) {
  const call = useAdminCall();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [audience, setAudience] = useState<Audience>({ audience: item.audience, audienceStage: item.audienceStage });
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const problems = editing ? problemsOf(title, body) : {};

  const save = async () => {
    if (problems.title !== undefined || problems.body !== undefined) return;
    setBusy(true);
    setError('');
    const outcome = await call((token) => editAnnouncement(token, item.id, { title: title.trim(), body: body.trim(), ...audience }));
    setBusy(false);
    if (outcome.kind === 'ok') {
      setEditing(false);
      onChanged(outcome.value, ANNOUNCEMENT_SAVED);
    } else {
      setError(failureText(outcome));
    }
  };

  const status = async (next: 'published' | 'removed') => {
    setBusy(true);
    setError('');
    const outcome = await call((token) => setAnnouncementStatus(token, item.id, next));
    setBusy(false);
    setConfirming(false);
    if (outcome.kind === 'ok') onChanged(outcome.value, next === 'published' ? ANNOUNCEMENT_PUBLISHED : ANNOUNCEMENT_REMOVED);
    else setError(failureText(outcome));
  };

  return (
    <article aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <header className="flex flex-wrap items-baseline gap-3">
        <h4 id={`${id}-title`} className="text-label">
          {item.title}
        </h4>
        <span className="text-small">{ANNOUNCEMENT_STATUS[item.status]}</span>
        <span className="text-small">{audienceText(item.audience === 'stage' && item.audienceStage !== null ? STAGE_LABELS[item.audienceStage] : AUDIENCE_LABELS[item.audience])}</span>
        <span className="text-small text-muted-foreground">{formatAdminTime(item.publishedAt ?? item.updatedAt)}</span>
      </header>
      {editing ? (
        <div className="flex flex-col gap-3">
          <FormField label={ANNOUNCEMENT_TITLE_LABEL} htmlFor={`${id}-edit-title`} {...(problems.title !== undefined ? { error: problems.title } : {})}>
            {(control) => <TextInput {...control} value={title} onChange={(event) => setTitle(event.target.value)} />}
          </FormField>
          <FormField label={ANNOUNCEMENT_BODY_LABEL} htmlFor={`${id}-edit-body`} {...(problems.body !== undefined ? { error: problems.body } : {})}>
            {(control) => <TextArea {...control} rows={4} value={body} onChange={(event) => setBody(event.target.value)} />}
          </FormField>
          <AudienceFields id={`${id}-edit`} value={audience} onChange={setAudience} />
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" pending={busy} disabled={busy} onClick={() => void save()}>
              {ANNOUNCEMENT_SAVE}
            </Button>
            <Button
              variant="text"
              onClick={() => {
                setEditing(false);
                setTitle(item.title);
                setBody(item.body);
                setAudience({ audience: item.audience, audienceStage: item.audienceStage });
              }}
            >
              {ANNOUNCEMENT_CANCEL}
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap" dir="auto">
          {item.body}
        </p>
      )}
      {item.status === 'removed' || editing ? null : (
        <div className="flex flex-wrap gap-3">
          <Button variant="soft" disabled={busy} onClick={() => setEditing(true)}>
            {ANNOUNCEMENT_EDIT}
          </Button>
          {item.status === 'draft' ? (
            <Button variant="primary" pending={busy} disabled={busy} onClick={() => void status('published')}>
              {ANNOUNCEMENT_PUBLISH}
            </Button>
          ) : null}
          <Button variant="text" disabled={busy} onClick={() => setConfirming(true)}>
            {ANNOUNCEMENT_REMOVE}
          </Button>
        </div>
      )}
      {error === '' ? null : <InlineAlert>{error}</InlineAlert>}
      <ConfirmDialog
        open={confirming}
        title={ANNOUNCEMENT_REMOVE_CONFIRM_TITLE}
        description={ANNOUNCEMENT_REMOVE_CONFIRM_TEXT}
        confirmLabel={ANNOUNCEMENT_REMOVE}
        cancelLabel={ANNOUNCEMENT_CANCEL}
        pending={busy}
        onConfirm={() => void status('removed')}
        onCancel={() => {
          if (!busy) setConfirming(false);
        }}
      />
    </article>
  );
}
