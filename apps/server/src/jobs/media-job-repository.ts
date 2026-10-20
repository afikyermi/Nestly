// The background job's SQL (I5; data-model rule 6). Runs on the app_media_jobs connection only: every row it reads, changes or deletes is
// reached through a TO app_media_jobs policy and column grant (migration 20261021500000), so the database decides what the job may touch.
// A `where` here names the rows a step works on; the policy is the limit (a deletion asks for every row and the policy keeps the rest).

import type { Sql, TransactionSql } from 'postgres';
import { z } from 'zod';

const idRow = z.object({ id: z.guid() });
const pendingRow = z.object({ id: z.guid(), check_attempts: z.number().int() });
const trainRow = z.object({
  id: z.guid(),
  mime: z.string(),
  label: z.enum(['blocked', 'allowed']),
  source: z.enum(['blocked', 'unsure', 'reported']),
  is_child: z.boolean(),
  decided_at: z.string().nullable(),
});

export type TrainableImage = z.infer<typeof trainRow>;
export type QueueReason = 'blocked' | 'unsure' | 'error';

export interface JobDb {
  pending(limit: number): Promise<Array<{ id: string; attempts: number }>>;
  markPassed(id: string): Promise<void>;
  /** Writes why (the staff-only review: reason and scores) and queues the image, in one transaction. */
  markQueued(id: string, reason: QueueReason, scores: Record<string, number>): Promise<void>;
  /** Counts a failed check; at the limit the image is queued as "error" (fail closed). */
  markFailed(id: string, exhausted: boolean): Promise<void>;
  /** Images to copy into the training set (Afik 20.10.2026): blocked or unsure ones staff decided (children included) and candidates
   *  (removed after a report); never a held or suspected image, never one whose file is gone. */
  trainable(limit: number): Promise<TrainableImage[]>;
  /** Inserts the sample's index row and runs `copy` with its id in the same transaction; a false or throwing copy rolls it back. */
  addSample(image: TrainableImage, copy: (sampleId: string) => Promise<boolean>): Promise<boolean>;
  /** Records a read of a training sample, with its purpose, before the read (Afik 20.10.2026: every access audited). */
  recordAccess(sampleId: string): Promise<boolean>;
  /** Marks the rejected images whose file may go now (the policy: not held, after the training copy) and runs `remove` in the same transaction. */
  removeRejectedFiles(remove: (ids: string[]) => Promise<boolean>): Promise<number>;
  /** Deletes expired Stories (their rows only; their images go with the image purge). */
  purgeStories(): Promise<number>;
  /** Deletes every image row the delete policy allows (BR-077, M6) and runs `remove` with their ids in the same transaction. */
  purgeImages(remove: (ids: string[]) => Promise<boolean>): Promise<number>;
  /** Deletes every sample the policy allows (expired, or its image became suspected) and runs `remove` in the same transaction. */
  pruneSamples(remove: (ids: string[]) => Promise<boolean>): Promise<number>;
  knownImageIds(ids: readonly string[]): Promise<Set<string>>;
}

class RolledBack extends Error {}

export function createJobDb(sql: Sql): JobDb {
  async function deleting(statement: (tx: TransactionSql) => Promise<unknown>, remove: (ids: string[]) => Promise<boolean>): Promise<number> {
    try {
      return await sql.begin(async (tx) => {
        const ids = z
          .array(idRow)
          .parse(await statement(tx))
          .map((row) => row.id);
        if (ids.length > 0 && !(await remove(ids))) throw new RolledBack();
        return ids.length;
      });
    } catch {
      return 0;
    }
  }

  async function markQueued(id: string, reason: QueueReason, scores: Record<string, number>): Promise<void> {
    await sql.begin(async (tx) => {
      await tx`insert into nestly.media_reviews (media_id, queue_reason, scores) values (${id}, ${reason}, ${tx.json(scores)})`;
      await tx`update nestly.media_assets set status = 'queued' where id = ${id} and status = 'pending'`;
    });
  }

  return {
    async pending(limit) {
      const rows = z.array(pendingRow).parse(await sql`
        select id, check_attempts from nestly.media_assets where status = 'pending' order by created_at asc, id asc limit ${limit}`);
      return rows.map((row) => ({ id: row.id, attempts: row.check_attempts }));
    },
    async markPassed(id) {
      await sql`update nestly.media_assets set status = 'passed' where id = ${id} and status = 'pending'`;
    },
    markQueued,
    async markFailed(id, exhausted) {
      if (exhausted) {
        await markQueued(id, 'error', {});
        return;
      }
      await sql`update nestly.media_assets set check_attempts = least(check_attempts + 1, 20) where id = ${id} and status = 'pending'`;
    },
    async trainable(limit) {
      return z.array(trainRow).parse(await sql`
        select m.id, m.mime, case when m.status = 'rejected' then 'blocked' else 'allowed' end as label, r.queue_reason as source,
               r.is_child, m.decided_at::text as decided_at
        from nestly.media_assets m join nestly.media_reviews r on r.media_id = m.id
        where m.status in ('approved', 'rejected') and not m.is_held and not m.is_file_removed
          and r.queue_reason in ('blocked', 'unsure') and not r.is_suspected
          and not exists (select 1 from nestly.media_training_samples t where t.source_media_id = m.id)
        union all
        select m.id, m.mime, 'blocked', 'reported', false, null
        from nestly.media_assets m join nestly.media_training_candidates c on c.media_id = m.id
        where not m.is_held and not m.is_file_removed
          and not exists (select 1 from nestly.media_reviews r where r.media_id = m.id and r.is_suspected)
          and not exists (select 1 from nestly.media_training_samples t where t.source_media_id = m.id)
        limit ${limit}`);
    },
    async addSample(image, copy) {
      try {
        await sql.begin(async (tx) => {
          const [sample] = z.array(idRow).length(1).parse(await tx`
            insert into nestly.media_training_samples (source_media_id, label, source, is_child, mime, decided_at)
            values (${image.id}, ${image.label}, ${image.source}, ${image.is_child}, ${image.mime}, ${image.decided_at}::timestamptz)
            returning id`);
          if (sample === undefined || !(await copy(sample.id))) throw new RolledBack();
        });
        return true;
      } catch {
        return false;
      }
    },
    async recordAccess(sampleId) {
      try {
        const rows = await sql`
          insert into nestly.media_training_events (sample_id, action, purpose, source, label)
          select t.id, 'accessed', 'training', t.source, t.label from nestly.media_training_samples t where t.id = ${sampleId}
          returning id`;
        return rows.length === 1;
      } catch {
        return false;
      }
    },
    removeRejectedFiles(remove) {
      return deleting(
        (tx) => tx`update nestly.media_assets set is_file_removed = true where status = 'rejected' and not is_file_removed returning id`,
        remove,
      );
    },
    async purgeStories() {
      try {
        return (await sql`delete from nestly.stories where expires_at <= now()`).count;
      } catch {
        return 0;
      }
    },
    purgeImages(remove) {
      return deleting((tx) => tx`delete from nestly.media_assets returning id`, remove);
    },
    pruneSamples(remove) {
      return deleting((tx) => tx`delete from nestly.media_training_samples returning id`, remove);
    },
    async knownImageIds(ids) {
      if (ids.length === 0) return new Set();
      const rows = z.array(idRow).parse(await sql`select id from nestly.media_assets where id = any(${[...ids]}::uuid[])`);
      return new Set(rows.map((row) => row.id));
    },
  };
}
