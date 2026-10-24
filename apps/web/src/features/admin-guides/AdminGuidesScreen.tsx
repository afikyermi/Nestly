import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminGuideDto } from '@nestly/shared';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DateInput } from '@/components/shared/date-input';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { Skeleton } from '@/components/ui/skeleton';
import { TextArea } from '@/components/ui/text-area';
import { TextInput } from '@/components/ui/text-input';
import { useAuthedCall } from '@/hooks/use-authed-call';
import { GUIDES_TEXT } from '@/lib/admin-guides-texts';
import { createGuide, fetchGuides, saveGuide } from '@/services/api/admin-guides';
import { describeStage, emptyGuideForm, formFromGuide, guideToBody, reasonText, type GuideForm } from './guide-form';

type Move = { guide: AdminGuideDto; status: 'published' | 'hidden' | 'draft'; pending: boolean; failure: string | null };

const STAGES = [
  { value: 'planning', label: GUIDES_TEXT.stagePlanning },
  { value: 'pregnancy', label: GUIDES_TEXT.stagePregnancy },
  { value: 'parenting', label: GUIDES_TEXT.stageParenting },
];
const STATUS_LABEL = { draft: GUIDES_TEXT.statusDraft, published: GUIDES_TEXT.statusPublished, hidden: GUIDES_TEXT.statusHidden } as const;
const QUESTION = { published: [GUIDES_TEXT.publishQuestion, GUIDES_TEXT.publishBody], hidden: [GUIDES_TEXT.hideQuestion, GUIDES_TEXT.hideBody], draft: [GUIDES_TEXT.draftQuestion, GUIDES_TEXT.draftBody] } as const;
const CONFIRM = { published: GUIDES_TEXT.publish, hidden: GUIDES_TEXT.hide, draft: GUIDES_TEXT.toDraft } as const;

// The Admin's guide management (FR-ADMIN-012, BR-070): every guide with its state, a form to create or edit, and publish, hide or draft
// with a confirmation. The database lets only an Admin through and writes the Audit entry; a non-Admin sees "no permission".
export function AdminGuidesScreen() {
  const call = useAuthedCall();
  const [guides, setGuides] = useState<AdminGuideDto[] | null>(null);
  const [state, setState] = useState<'ok' | 'forbidden' | 'failed'>('ok');
  const [form, setForm] = useState<GuideForm | null>(null);
  const [editing, setEditing] = useState<AdminGuideDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [move, setMove] = useState<Move | null>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const result = await call(fetchGuides);
    if (result.kind === 'ok') {
      setGuides(result.value);
      setState('ok');
    } else setState(result.kind === 'forbidden' ? 'forbidden' : 'failed');
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (patch: Partial<GuideForm>) => setForm((current) => (current === null ? current : { ...current, ...patch }));

  async function submit() {
    if (form === null || busy.current) return;
    const checked = guideToBody(form);
    if (!checked.ok) return setError(checked.error);
    busy.current = true;
    setSaving(true);
    setError(null);
    const body = checked.body;
    const result = await call((token) => (editing === null ? createGuide(token, body) : saveGuide(token, editing.id, { ...body, status: editing.status })));
    busy.current = false;
    setSaving(false);
    if (result.kind === 'ok') {
      setNotice(GUIDES_TEXT.saved);
      setForm(null);
      setEditing(null);
      await load();
    } else setError(result.kind === 'invalid' ? reasonText(result.reason) : GUIDES_TEXT.saveFailed);
  }

  async function confirmMove() {
    if (move === null || move.pending) return;
    const target = move;
    setMove({ ...target, pending: true, failure: null });
    const g = target.guide;
    const body = { ...formToBodyOf(g), status: target.status };
    const result = await call((token) => saveGuide(token, g.id, body));
    if (result.kind === 'ok') {
      setMove(null);
      setNotice(GUIDES_TEXT.saved);
      await load();
    } else setMove({ ...target, pending: false, failure: result.kind === 'invalid' ? reasonText(result.reason) : GUIDES_TEXT.saveFailed });
  }

  if (state === 'forbidden') return <InlineAlert>{GUIDES_TEXT.forbidden}</InlineAlert>;
  if (state === 'failed' && guides === null) {
    return (
      <div className="flex flex-col gap-3">
        <InlineAlert>{GUIDES_TEXT.loadFailed}</InlineAlert>
        <Button type="button" variant="soft" className="self-start" onClick={() => void load()}>
          {GUIDES_TEXT.retry}
        </Button>
      </div>
    );
  }
  if (guides === null) return <Skeleton className="h-64 w-full" />;

  const showRange = form !== null && form.stageKind !== '' && form.stageKind !== 'planning';
  const weeks = form?.stageKind === 'pregnancy';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-body text-muted-foreground">
        <p>{GUIDES_TEXT.intro}</p>
        <p className="text-foreground">{GUIDES_TEXT.disclaimer}</p>
      </div>
      <p role="status" className="min-h-6 text-small text-muted-foreground">{notice}</p>
      {state === 'failed' ? <InlineAlert>{GUIDES_TEXT.loadFailed}</InlineAlert> : null}

      {form === null ? (
        <Button type="button" className="self-start" onClick={() => { setForm(emptyGuideForm()); setEditing(null); setError(null); setNotice(''); }}>
          {GUIDES_TEXT.newGuide}
        </Button>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-4 rounded-lg bg-card p-4 text-card-foreground shadow-card"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {error !== null ? <InlineAlert>{error}</InlineAlert> : null}
          <FormField label={GUIDES_TEXT.stage} className="max-w-60">
            {(control) => <SelectInput {...control} placeholder={GUIDES_TEXT.stagePlaceholder} value={form.stageKind} options={STAGES} onChange={(stageKind) => set({ stageKind })} />}
          </FormField>
          {showRange ? (
            <div className="flex flex-wrap gap-4">
              <FormField label={weeks ? GUIDES_TEXT.weekFrom : GUIDES_TEXT.monthFrom} className="w-40">
                {(control) => <TextInput {...control} dir="ltr" value={form.rangeFrom} onChange={(event) => set({ rangeFrom: event.target.value })} />}
              </FormField>
              <FormField label={weeks ? GUIDES_TEXT.weekTo : GUIDES_TEXT.monthTo} className="w-40">
                {(control) => <TextInput {...control} dir="ltr" value={form.rangeTo} onChange={(event) => set({ rangeTo: event.target.value })} />}
              </FormField>
            </div>
          ) : null}
          <FormField label={GUIDES_TEXT.titleField}>
            {(control) => <TextInput {...control} value={form.title} onChange={(event) => set({ title: event.target.value })} />}
          </FormField>
          <FormField label={GUIDES_TEXT.bodyField}>
            {(control) => <TextArea {...control} rows={8} value={form.body} onChange={(event) => set({ body: event.target.value })} />}
          </FormField>
          <FormField label={GUIDES_TEXT.sourceField} hint={GUIDES_TEXT.sourceHint}>
            {(control) => <TextInput {...control} value={form.source} onChange={(event) => set({ source: event.target.value })} />}
          </FormField>
          <DateInput legend={GUIDES_TEXT.sourceDate} optional value={form.sourceDate} onChange={(sourceDate) => set({ sourceDate })} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" pending={saving}>
              {editing === null ? GUIDES_TEXT.save : GUIDES_TEXT.saveChanges}
            </Button>
            <Button type="button" variant="text" onClick={() => { setForm(null); setEditing(null); setError(null); }}>
              {GUIDES_TEXT.cancel}
            </Button>
          </div>
        </form>
      )}

      {guides.length === 0 ? (
        <p className="rounded-lg bg-muted p-4 text-body text-muted-foreground">{GUIDES_TEXT.empty}</p>
      ) : (
        <ul aria-label={GUIDES_TEXT.listLabel} className="flex flex-col gap-3">
          {guides.map((guide) => (
            <li key={guide.id} className="flex flex-col gap-2 rounded-lg bg-card p-4 text-card-foreground shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-label">{guide.title}</p>
                <p className="text-small text-primary-strong">{STATUS_LABEL[guide.status]}</p>
              </div>
              <p className="text-small text-muted-foreground">{describeStage(guide)}</p>
              <div className="flex flex-wrap gap-1">
                <Button type="button" variant="text" onClick={() => { setEditing(guide); setForm(formFromGuide(guide)); setError(null); setNotice(''); }}>
                  {GUIDES_TEXT.edit}
                </Button>
                {guide.status !== 'published' ? (
                  // FR-ADMIN-012 (Afik 21.10.2026): the source check date is not a condition for publishing
                  <Button type="button" variant="text" onClick={() => setMove({ guide, status: 'published', pending: false, failure: null })}>
                    {GUIDES_TEXT.publish}
                  </Button>
                ) : null}
                {guide.status === 'published' ? (
                  <Button type="button" variant="text" onClick={() => setMove({ guide, status: 'hidden', pending: false, failure: null })}>
                    {GUIDES_TEXT.hide}
                  </Button>
                ) : null}
                {guide.status === 'hidden' ? (
                  <Button type="button" variant="text" onClick={() => setMove({ guide, status: 'draft', pending: false, failure: null })}>
                    {GUIDES_TEXT.toDraft}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={move !== null}
        title={move === null ? '' : QUESTION[move.status][0]}
        description={move === null ? undefined : QUESTION[move.status][1]}
        confirmLabel={move === null ? '' : CONFIRM[move.status]}
        cancelLabel={GUIDES_TEXT.cancel}
        pending={move?.pending ?? false}
        failure={move?.failure ?? null}
        onConfirm={() => void confirmMove()}
        onCancel={() => setMove((current) => (current?.pending === true ? current : null))}
      />
    </div>
  );
}

/** The fields of a stored guide as the PUT body names them (a status move changes the status only). */
function formToBodyOf(guide: AdminGuideDto) {
  return {
    stageKind: guide.stageKind,
    rangeFrom: guide.rangeFrom,
    rangeTo: guide.rangeTo,
    title: guide.title,
    body: guide.body,
    source: guide.source,
    sourceCheckedOn: guide.sourceCheckedOn,
  };
}
