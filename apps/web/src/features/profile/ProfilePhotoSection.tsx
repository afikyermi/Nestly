import { useCallback, useEffect, useRef, useState } from 'react';
import { MEDIA_MAX_SIDE, MEDIA_SOURCE_MAX_BYTES, MEDIA_SOURCE_TYPES, type MediaImage } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useImageShrinker } from '@/hooks/use-image-shrinker';
import { useSessionAccount } from '@/hooks/use-session-account';
import {
  CHANGE_PHOTO_LABEL,
  PENDING_LABEL,
  PHOTO_PENDING_HINT,
  PROFILE_PHOTO_ALT,
  REJECTED_TEXT,
  REMOVE_PHOTO_LABEL,
  SET_PHOTO_LABEL,
  SHRINK_FAILED_TEXT,
  SIZE_REFUSED_TEXT,
  TYPE_REFUSED_TEXT,
  UPLOAD_FAILED_TEXT,
  UPLOADING_TEXT,
} from '@/lib/media-texts';
import { fetchProfilePhoto, removeProfilePhoto, setProfilePhoto, uploadImage } from '@/services/api/media';

const SOURCE_TYPES: readonly string[] = MEDIA_SOURCE_TYPES;
const TITLE = 'תמונת פרופיל';

type State = { kind: 'loading' } | { kind: 'ready'; photo: MediaImage | null } | { kind: 'failed' };

// The profile photo (FR-PROFILE-001, BR-077; I5): the own photo in any state, "ממתין לבדיקה" until the check, the rejection sentence when it
// was not approved. A new picture is shrunk in the browser, uploaded and set; the replaced one is deleted at once by the server.
export function ProfilePhotoSection() {
  const account = useSessionAccount();
  const shrinker = useImageShrinker();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const token = useCallback(async () => (account === null ? null : await account.getAccessToken().catch(() => null)), [account]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const t = await token();
      const outcome = t === null ? null : await fetchProfilePhoto(t);
      if (!live) return;
      setState(outcome?.kind === 'ok' ? { kind: 'ready', photo: outcome.value } : { kind: 'failed' });
    })();
    return () => {
      live = false;
    };
  }, [token]);

  async function pick(file: File) {
    setError(null);
    if (!SOURCE_TYPES.includes(file.type) && !/\.(heic|heif)$/i.test(file.name)) return setError(TYPE_REFUSED_TEXT);
    if (file.size > MEDIA_SOURCE_MAX_BYTES) return setError(SIZE_REFUSED_TEXT);
    setBusy(true);
    try {
      const shrunk = await shrinker.shrink(file, MEDIA_MAX_SIDE);
      if (!shrunk.ok) return setError(SHRINK_FAILED_TEXT);
      const t = await token();
      const uploaded = t === null ? null : await uploadImage(t, 'profile', shrunk.blob);
      if (t === null || uploaded === null || uploaded.kind !== 'ok') return setError(uploaded?.kind === 'unsupported' ? TYPE_REFUSED_TEXT : UPLOAD_FAILED_TEXT);
      const set = await setProfilePhoto(t, uploaded.value.id);
      if (set.kind !== 'ok') return setError(UPLOAD_FAILED_TEXT);
      setState({ kind: 'ready', photo: set.value });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      const t = await token();
      const outcome = t === null ? null : await removeProfilePhoto(t);
      if (outcome?.kind === 'ok') setState({ kind: 'ready', photo: null });
      else setError(UPLOAD_FAILED_TEXT);
    } finally {
      setBusy(false);
    }
  }

  if (state.kind !== 'ready') return null;
  const photo = state.photo;
  return (
    <section aria-labelledby="profile-photo-title" className="mt-6 flex max-w-md flex-col gap-3 rounded-lg bg-card p-4 shadow-card md:p-5">
      <h2 id="profile-photo-title" className="text-h3">
        {TITLE}
      </h2>
      <div className="flex items-center gap-4">
        <Avatar size="lg" label={PROFILE_PHOTO_ALT} src={photo !== null && photo.state !== 'rejected' ? photo.url : null} />
        <div className="flex flex-col gap-1 text-small text-muted-foreground">
          {photo?.state === 'pending' ? (
            <>
              <span className="text-foreground">{PENDING_LABEL}</span>
              <span>{PHOTO_PENDING_HINT}</span>
            </>
          ) : null}
          {photo?.state === 'rejected' ? <span>{REJECTED_TEXT}</span> : null}
          {busy ? <span role="status">{UPLOADING_TEXT}</span> : null}
        </div>
      </div>
      {error !== null ? <InlineAlert>{error}</InlineAlert> : null}
      <input
        ref={input}
        type="file"
        accept={[...MEDIA_SOURCE_TYPES, '.heic', '.heif'].join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) void pick(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="soft" disabled={busy} onClick={() => input.current?.click()}>
          {photo === null ? SET_PHOTO_LABEL : CHANGE_PHOTO_LABEL}
        </Button>
        {photo !== null ? (
          <Button variant="text" disabled={busy} onClick={() => void remove()}>
            {REMOVE_PHOTO_LABEL}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
