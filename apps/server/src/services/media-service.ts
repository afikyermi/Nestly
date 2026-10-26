// Images (I5; FR-FEED-002, FR-PROFILE-001, NFR-MEDIA-001, BR-077, AC-104, AC-105; Afik 20.10.2026). The caller is authenticated; each
// call is one identity transaction. The database decides who may upload, read, attach and remove (RLS); storage is reached only through
// media/storage-admin.ts, and a read address is signed only for an image row the caller's own read returned in the same request.

import { MEDIA_URL_TTL_SECONDS, type MediaImage, type MediaKind } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import type { ProcessedImage, ProcessingRefusal } from '../media/image-processing.js';
import type { JobKick } from '../media/job-kick.js';
import type { MediaStorage } from '../media/storage-admin.js';
import { insertImage, readImage, readProfilePhotos, removeOwnProfilePhoto, setOwnProfilePhoto, stateOf, type ImageRow } from '../repositories/media-repository.js';

export interface MediaDependencies {
  readonly storage: MediaStorage;
  readonly kick: JobKick;
  readonly process: (bytes: Uint8Array) => Promise<ProcessedImage | ProcessingRefusal>;
}

/** Storage did not take the file: the row is rolled back with it, so no image exists without its file. */
export class StorageUnavailable extends Error {
  constructor() {
    super('storage unavailable');
    this.name = 'StorageUnavailable';
  }
}

/** Read addresses for the rows the caller read: a refused image never gets one. An address signed for an earlier request may come back
 *  (media/signed-url-cache.ts) so the browser reuses the image it already has; which rows get one is still this request's own read. */
export async function withUrls<T extends ImageRow>(storage: MediaStorage, rows: readonly T[]): Promise<Map<string, MediaImage>> {
  const visible = rows.filter((row) => stateOf(row.status) !== 'rejected').map((row) => row.id);
  const urls = await storage.signedUrls([...new Set(visible)], MEDIA_URL_TTL_SECONDS, { reuse: true });
  return new Map(
    rows.map((row) => {
      const state = stateOf(row.status);
      return [row.id, { id: row.id, state, url: state === 'rejected' ? null : (urls.get(row.id) ?? null), width: row.width, height: row.height }];
    }),
  );
}

export type UploadOutcome =
  | { readonly kind: 'uploaded'; readonly image: MediaImage }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'unconfigured' };

/**
 * POST /api/media: re-encode (no EXIF or GPS, at most 2,048 pixels), insert the caller's pending row, store the file under the row's id
 * inside the same transaction (a failed store rolls the row back), then ask the background check to run. A refusal by the database (not a
 * Regular or Professional account, a stopped account) propagates.
 */
export async function uploadImage(database: Database, identity: Identity, deps: MediaDependencies, kind: MediaKind, bytes: Uint8Array): Promise<UploadOutcome> {
  if (!deps.storage.isConfigured()) return { kind: 'unconfigured' };
  const processed = await deps.process(bytes);
  if (!processed.ok) return { kind: 'unsupported' };
  const row = await inIdentityTransaction(database, identity, async (tx) => {
    const inserted = await insertImage(tx, { kind, mime: processed.mime, width: processed.width, height: processed.height, byteSize: processed.bytes.byteLength });
    if ((await deps.storage.upload(inserted.id, processed.bytes, processed.mime)) !== 'ok') throw new StorageUnavailable();
    return inserted;
  });
  await deps.kick();
  const image = (await withUrls(deps.storage, [row])).get(row.id);
  if (image === undefined) throw new Error('media: no view of the new image');
  return { kind: 'uploaded', image };
}

export type PhotoOutcome = { readonly kind: 'set'; readonly photo: MediaImage } | { readonly kind: 'removed' } | { readonly kind: 'not_available' };

/** PUT /api/profile/photo: one of the caller's own profile images becomes the photo; the replaced image is gone at once (BR-077). */
export async function setProfilePhoto(database: Database, identity: Identity, storage: MediaStorage, mediaId: string): Promise<PhotoOutcome> {
  const result = await inIdentityTransaction(database, identity, async (tx: IdentityTx) => {
    const image = await readImage(tx, mediaId);
    if (image === undefined) return undefined;
    const { previous } = await setOwnProfilePhoto(tx, mediaId);
    return { image, previous };
  });
  if (result === undefined) return { kind: 'not_available' };
  if (result.previous !== null) await storage.remove([result.previous]);
  const photo = (await withUrls(storage, [result.image])).get(result.image.id);
  return photo === undefined ? { kind: 'not_available' } : { kind: 'set', photo };
}

/** DELETE /api/profile/photo: the caller's photo and its image, file included (the daily job removes a file a failed call left). */
export async function removeProfilePhoto(database: Database, identity: Identity, storage: MediaStorage): Promise<PhotoOutcome> {
  const removed = await inIdentityTransaction(database, identity, (tx) => removeOwnProfilePhoto(tx));
  if (removed !== null) await storage.remove([removed]);
  return { kind: 'removed' };
}

/** The caller's own current profile photo (any state: only the owner sees a pending or rejected one), signed after the transaction. */
export async function readOwnProfilePhoto(database: Database, identity: Identity, storage: MediaStorage): Promise<MediaImage | null> {
  const rows = await inIdentityTransaction(database, identity, (tx) => readProfilePhotos(tx, [identity.userId.toLowerCase()]));
  const first = rows[0];
  if (first === undefined) return null;
  return (await withUrls(storage, rows)).get(first.id) ?? null;
}
