// The upload block list's SQL (I14 completion B; NFR-MEDIA-001, BR-076; Afik 21.10.2026; migration 20261023500000). Runs on the app_media_jobs
// connection only: media_fingerprints and suspected_image_fingerprints are reached through TO app_media_jobs policies, and the database decides
// what may be written: a hash once per image, only for a pending or a suspected image; a listed hash only for an image a staff member marked or
// confirmed as suspected; a match only when the recorded hash is within 6 bits of a listed one (media_reviews_guard), and then the image is
// rejected and held as a suspicion with no staff member (90 days, M6), with no action on the account.

import type { Sql } from 'postgres';
import { z } from 'zod';

export interface BlockListDb {
  /** Records the hash of a pending or suspected image, once (a second call changes nothing). */
  recordFingerprint(mediaId: string, fingerprint: string): Promise<void>;
  /** Whether the image's recorded hash is within the distance of a listed one. */
  matchesBlockList(mediaId: string): Promise<boolean>;
  /** The match: a suspicion review (hash_match) and the image rejected and held, in one transaction. */
  markMatch(mediaId: string): Promise<void>;
  /** Images a staff member marked or confirmed as suspected whose hash is not on the list yet (neither by the image nor by an equal hash already
   *  listed), with their recorded hash when there is one; in random order, so that an image that cannot be read never starves the others. */
  suspectedToList(limit: number): Promise<Array<{ id: string; fingerprint: string | null }>>;
  /** Puts an image's recorded hash on the list (the policy checks the suspicion and the hash); true when a row was added. */
  addToList(mediaId: string): Promise<boolean>;
}

export function createBlockListDb(sql: Sql): BlockListDb {
  return {
    async recordFingerprint(mediaId, fingerprint) {
      await sql`insert into nestly.media_fingerprints (media_id, fingerprint) values (${mediaId}, ${fingerprint}) on conflict (media_id) do nothing`;
    },
    async matchesBlockList(mediaId) {
      const rows = z.array(z.object({ hit: z.boolean() })).parse(await sql`
        select exists (select 1 from nestly.media_fingerprints f join nestly.suspected_image_fingerprints h
                         on pg_catalog.bit_count(pg_catalog.int8send(h.fingerprint # f.fingerprint)) <= 6
                        where f.media_id = ${mediaId}) as hit`);
      return rows[0]?.hit === true;
    },
    async markMatch(mediaId) {
      await sql.begin(async (tx) => {
        await tx`insert into nestly.media_reviews (media_id, queue_reason, is_suspected) values (${mediaId}, 'hash_match', true)`;
        await tx`update nestly.media_assets set status = 'rejected', is_held = true where id = ${mediaId} and status = 'pending'`;
      });
    },
    async suspectedToList(limit) {
      return z
        .array(z.object({ id: z.guid(), fingerprint: z.string().nullable() }))
        .parse(
          await sql`
            select r.media_id as id, f.fingerprint::text as fingerprint
            from nestly.media_reviews r left join nestly.media_fingerprints f on f.media_id = r.media_id
            where r.is_suspected and r.suspected_by is not null
              and not exists (select 1 from nestly.suspected_image_fingerprints h where h.source_media_id = r.media_id)
              and not exists (select 1 from nestly.suspected_image_fingerprints h where h.fingerprint = f.fingerprint)
            order by pg_catalog.random() limit ${limit}`,
        );
    },
    async addToList(mediaId) {
      const added = await sql`
        insert into nestly.suspected_image_fingerprints (fingerprint, source_media_id)
        select f.fingerprint, f.media_id from nestly.media_fingerprints f where f.media_id = ${mediaId}
        on conflict do nothing`;
      return added.count === 1;
    },
  };
}
