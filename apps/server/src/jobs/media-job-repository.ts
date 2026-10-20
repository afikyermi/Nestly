// The background job's SQL (I5; data-model rule 6). Runs on the app_jobs connection only: every row it reads, changes or deletes is reached
// through a TO app_jobs policy (migration 20261021500000), so the database still decides what the job may touch. A `where` here names the
// rows a step works on; the policy is the limit.

import type { Sql } from 'postgres';
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

export interface JobDb {
  pending(limit: number): Promise<Array<{ id: string; attempts: number }>>;
  markPassed(id: string, scores: Record<string, number>): Promise<void>;
  markQueued(id: string, reason: 'blocked' | 'unsure', scores: Record<string, number>): Promise<void>;
  markFailed(id: string, exhausted: boolean): Promise<void>;
  /** Images to copy into the training set (Afik 20.10.2026): decided blocked or unsure ones (children included), and passed ones whose post was removed after a report. */
  trainable(limit: number): Promise<TrainableImage[]>;
  /** Inserts the sample's index row (expiring after `months`) and runs `copy` with its id in the same transaction; a false or throwing copy rolls it back. */
  addSample(image: TrainableImage, months: number, copy: (sampleId: string) => Promise<boolean>): Promise<boolean>;
  /** Marks the rejected images whose file may go now (the policy: after their training copy) and runs `remove` in the same transaction. */
  removeRejectedFiles(remove: (ids: string[]) => Promise<boolean>): Promise<number>;
  /** Deletes the image rows the delete policy names (bounded) and runs `remove` with their ids in the same transaction. */
  purgeImages(bound: number, remove: (ids: string[]) => Promise<boolean>): Promise<number>;
  expireSamples(remove: (ids: string[]) => Promise<boolean>): Promise<number>;
  knownImageIds(ids: readonly string[]): Promise<Set<string>>;
}

class RolledBack extends Error {}

export function createJobDb(sql: Sql): JobDb {
  return {
    async pending(limit) {
      const rows = z.array(pendingRow).parse(await sql`
        select id, check_attempts from nestly.media_assets where status = 'pending' order by created_at asc, id asc limit ${limit}`);
      return rows.map((row) => ({ id: row.id, attempts: row.check_attempts }));
    },
    async markPassed(id, scores) {
      await sql`update nestly.media_assets set status = 'passed', scores = ${sql.json(scores)} where id = ${id} and status = 'pending'`;
    },
    async markQueued(id, reason, scores) {
      await sql`update nestly.media_assets set status = 'queued', queue_reason = ${reason}, scores = ${sql.json(scores)}
                where id = ${id} and status = 'pending'`;
    },
    async markFailed(id, exhausted) {
      await sql`update nestly.media_assets
                set check_attempts = least(check_attempts + 1, 20), status = ${exhausted ? 'queued' : 'pending'}, queue_reason = ${exhausted ? 'error' : null}
                where id = ${id} and status = 'pending'`;
    },
    async trainable(limit) {
      return z.array(trainRow).parse(await sql`
        select m.id, m.mime, case when m.status = 'rejected' then 'blocked' else 'allowed' end as label, m.queue_reason as source,
               m.is_child, m.decided_at::text as decided_at
        from nestly.media_assets m
        where m.status in ('approved', 'rejected') and m.queue_reason in ('blocked', 'unsure')
          and not exists (select 1 from nestly.media_training_samples t where t.source_media_id = m.id)
        union all
        select m.id, m.mime, 'blocked', 'reported', m.is_child, null
        from nestly.media_assets m join nestly.posts p on p.id = m.post_id
        where m.status in ('passed', 'approved') and p.status = 'removed'
          and not exists (select 1 from nestly.media_training_samples t where t.source_media_id = m.id)
        limit ${limit}`);
    },
    async addSample(image, months, copy) {
      try {
        await sql.begin(async (tx) => {
          const [sample] = z.array(idRow).length(1).parse(await tx`
            insert into nestly.media_training_samples (source_media_id, label, source, is_child, mime, decided_at, expires_at)
            values (${image.id}, ${image.label}, ${image.source}, ${image.is_child}, ${image.mime}, ${image.decided_at}::timestamptz,
                    now() + make_interval(months => ${months}::int))
            returning id`);
          if (sample === undefined || !(await copy(sample.id))) throw new RolledBack();
        });
        return true;
      } catch {
        return false;
      }
    },
    async removeRejectedFiles(remove) {
      try {
        return await sql.begin(async (tx) => {
          const ids = z
            .array(idRow)
            .parse(await tx`update nestly.media_assets set is_file_removed = true where status = 'rejected' and not is_file_removed returning id`)
            .map((row) => row.id);
          if (ids.length > 0 && !(await remove(ids))) throw new RolledBack();
          return ids.length;
        });
      } catch {
        return 0;
      }
    },
    async purgeImages(bound, remove) {
      try {
        return await sql.begin(async (tx) => {
          const ids = z
            .array(idRow)
            .parse(await tx`delete from nestly.media_assets where id in (select id from nestly.media_assets order by created_at asc limit ${bound}) returning id`)
            .map((row) => row.id);
          if (ids.length > 0 && !(await remove(ids))) throw new RolledBack();
          return ids.length;
        });
      } catch {
        return 0;
      }
    },
    async expireSamples(remove) {
      try {
        return await sql.begin(async (tx) => {
          const ids = z
            .array(idRow)
            .parse(await tx`delete from nestly.media_training_samples where expires_at <= now() returning id`)
            .map((row) => row.id);
          if (ids.length > 0 && !(await remove(ids))) throw new RolledBack();
          return ids.length;
        });
      } catch {
        return 0;
      }
    },
    async knownImageIds(ids) {
      if (ids.length === 0) return new Set();
      const rows = z.array(idRow).parse(await sql`select id from nestly.media_assets where id = any(${[...ids]}::uuid[])`);
      return new Set(rows.map((row) => row.id));
    },
  };
}
