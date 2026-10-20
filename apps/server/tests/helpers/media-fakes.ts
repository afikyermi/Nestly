import type { MediaStorage, StorageOutcome } from '../../src/media/storage-admin.js';

/** I5: an in-memory image store standing in for Supabase Storage; records every call. */
export function fakeMediaStorage(options: { configured?: boolean; upload?: StorageOutcome } = {}) {
  const files = new Map<string, { bytes: Uint8Array; mime: string }>();
  const removed: string[] = [];
  const signed: string[][] = [];
  const storage: MediaStorage = {
    isConfigured: () => options.configured ?? true,
    upload: (id, bytes, mime) => {
      if ((options.upload ?? 'ok') === 'ok') files.set(id, { bytes, mime });
      return Promise.resolve(options.upload ?? 'ok');
    },
    remove: (ids) => {
      removed.push(...ids);
      for (const id of ids) files.delete(id);
      return Promise.resolve('ok');
    },
    signedUrls: (ids) => {
      signed.push([...ids]);
      return Promise.resolve(new Map(ids.map((id) => [id, `https://storage.example.invalid/object/sign/media/${id}?token=t`])));
    },
  };
  return { storage, files, removed, signed };
}
