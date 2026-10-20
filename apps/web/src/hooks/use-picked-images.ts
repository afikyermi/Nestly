import { useCallback, useRef, useState } from 'react';
import { MEDIA_MAX_SIDE, MEDIA_SOURCE_MAX_BYTES, MEDIA_SOURCE_TYPES, POST_MAX_IMAGES, type MediaImage, type MediaKind } from '@nestly/shared';
import { useImageShrinker } from '@/hooks/use-image-shrinker';
import { useSessionAccount } from '@/hooks/use-session-account';
import { imageCountLimitText, SHRINK_FAILED_TEXT, SIZE_REFUSED_TEXT, TYPE_REFUSED_TEXT, UPLOAD_FAILED_TEXT } from '@/lib/media-texts';
import { uploadImage } from '@/services/api/media';

export interface PickedImage {
  key: number;
  status: 'uploading' | 'ready';
  image?: MediaImage;
}

export interface PickedImages {
  items: PickedImage[];
  /** The last refusal (ERR-039, the count limit, a failed upload), or null. */
  error: string | null;
  /** An upload is still running: the post waits for it. */
  busy: boolean;
  /** The uploaded images' ids, in the order shown. */
  ids: string[];
  add: (files: readonly File[]) => void;
  remove: (key: number) => void;
}

const SOURCE_TYPES: readonly string[] = MEDIA_SOURCE_TYPES;
/** HEIC often comes with no type: the name tells it. */
const looksAccepted = (file: File): boolean => SOURCE_TYPES.includes(file.type) || (file.type === '' && /\.(heic|heif)$/i.test(file.name));

// Pictures picked for a post (FR-FEED-002, VAL-041, ERR-039; I5): each is checked (type, 15 MB), shrunk and redrawn in the browser (at most
// 2,048 pixels; a new file, so no EXIF or GPS leaves the device), then uploaded at once; the post sends their ids. At most `max`.
export function usePickedImages(kind: MediaKind = 'post', max: number = POST_MAX_IMAGES): PickedImages {
  const account = useSessionAccount();
  const shrinker = useImageShrinker();
  const [items, setItems] = useState<PickedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const next = useRef(1);
  /** The pictures shown now (uploading or ready): the count against `max`. */
  const live = useRef(new Set<number>());

  const upload = useCallback(
    async (key: number, file: File) => {
      const shrunk = await shrinker.shrink(file, MEDIA_MAX_SIDE);
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const outcome = !shrunk.ok || token === null ? null : await uploadImage(token, kind, shrunk.blob);
      if (outcome !== null && outcome.kind === 'ok') {
        setItems((now) => now.map((item) => (item.key === key ? { key, status: 'ready', image: outcome.value } : item)));
        return;
      }
      if (outcome?.kind === 'unauthenticated' || outcome?.kind === 'account-unavailable') void account?.recheck();
      if (!live.current.delete(key)) return; // removed while it uploaded: already out of the count and the list
      setItems((now) => now.filter((item) => item.key !== key));
      setError(!shrunk.ok ? SHRINK_FAILED_TEXT : outcome?.kind === 'unsupported' ? TYPE_REFUSED_TEXT : UPLOAD_FAILED_TEXT);
    },
    [account, kind, shrinker],
  );

  const add = useCallback(
    (files: readonly File[]) => {
      setError(null);
      for (const file of files) {
        if (live.current.size >= max) {
          setError(imageCountLimitText(max));
          return;
        }
        if (!looksAccepted(file)) {
          setError(TYPE_REFUSED_TEXT);
          continue;
        }
        if (file.size > MEDIA_SOURCE_MAX_BYTES) {
          setError(SIZE_REFUSED_TEXT);
          continue;
        }
        const key = next.current++;
        live.current.add(key);
        setItems((now) => [...now, { key, status: 'uploading' }]);
        void upload(key, file);
      }
    },
    [max, upload],
  );

  const remove = useCallback((key: number) => {
    live.current.delete(key);
    setItems((now) => now.filter((item) => item.key !== key));
    setError(null);
  }, []);

  return {
    items,
    error,
    busy: items.some((item) => item.status === 'uploading'),
    ids: items.flatMap((item) => (item.image === undefined ? [] : [item.image.id])),
    add,
    remove,
  };
}
