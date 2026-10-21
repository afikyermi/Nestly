import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  EMPTY_PROFESSIONAL_FORM,
  ProfessionalProfileFields,
  professionalFormErrors,
  professionalFormOf,
  professionalInputOf,
  type ProfessionalForm,
  type ProfessionalFormErrors,
} from '@/components/domain/professional-profile-fields';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOwnUserId } from '@/hooks/use-own-user-id';
import { useProCall } from '@/hooks/use-pro-call';
import { professionalPagePath } from '@/lib/professional-link';
import { ACTION_FAILED, LOAD_FAILED, RETRY, SAVE, SAVED, VIEW_MY_PAGE } from '@/lib/professional-texts';
import { fetchProfessional, saveOwnProfile } from '@/services/api/professionals';

// The owner's edit of its Professional profile (FR-SERV-003; the fields of FR-PROREG-001 and the directory's area and price, FR-SERV-002).
export function ProfileEditScreen() {
  const call = useProCall();
  const own = useOwnUserId();
  const userId = own.kind === 'known' ? own.userId : null;
  const [form, setForm] = useState<ProfessionalForm>(EMPTY_PROFESSIONAL_FORM);
  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading');
  const [errors, setErrors] = useState<ProfessionalFormErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const load = useCallback(async () => {
    if (userId === null) return;
    const result = await call((token) => fetchProfessional(token, userId));
    if (result.kind === 'ok') {
      setForm(professionalFormOf(result.value));
      setState('ready');
    } else setState('failed');
  }, [call, userId]);

  useEffect(() => {
    if (own.kind === 'known' && own.userId === null) setState('failed');
    void load();
  }, [load, own]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (running.current) return;
    const found = professionalFormErrors(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    running.current = true;
    setBusy(true);
    setFailure(null);
    setStatus('');
    try {
      const result = await call((token) => saveOwnProfile(token, professionalInputOf(form)));
      if (result.kind === 'ok') setStatus(SAVED);
      else setFailure(ACTION_FAILED);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  if (state === 'loading') return <Skeleton className="h-64 w-full" />;
  if (state === 'failed') {
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
    <form noValidate className="flex flex-col gap-5" onSubmit={(event) => void save(event)}>
      <ProfessionalProfileFields form={form} errors={errors} onChange={setForm} />
      {failure === null ? null : <InlineAlert>{failure}</InlineAlert>}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" pending={busy}>
          {SAVE}
        </Button>
        {userId === null ? null : (
          <Link to={professionalPagePath(userId)} className="inline-flex min-h-11 items-center text-label text-primary-strong underline underline-offset-4">
            {VIEW_MY_PAGE}
          </Link>
        )}
      </div>
      <p role="status" className={status === '' ? 'sr-only' : 'text-label'}>
        {status}
      </p>
    </form>
  );
}
