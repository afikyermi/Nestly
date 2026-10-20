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
  status: z.enum(['approved', 'rejected']),
  queue_reason: z.enum(['blocked', 'unsure']),
  decided_at: z.string(),
});

export type TrainableImage = z.infer<typeof trainRow>;

export interface JobDb {
  pending(limit: number): Promise<Array<{ id: string; attempts: number }>>;
  markPassed(id: string, scores: Record<string, number>): Promise<void>;
  markQueued(id: string, reason: 'blocked' | 'unsure', scores: Record<string, number>): Promise<void>;
  markFailed(id: string, exhausted: boolean): Promise<void>;
  trainable(limit: number): Promise<TrainableImage[]>;
  /** Inserts the sample's index row and runs `copy` with its id in the same transaction; a false or throwing copy rolls the row back. */
  addSample(image: TrainableImage, copy: (sampleId: string) => Promise<boolean>): Promise<boolean>;
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
        select m.id, m.mime, m.status, m.queue_reason, m.decided_at::text as decided_at
        from nestly.media_assets m
        where m.status in ('approved', 'rejected') and not m.is_child and m.queue_reason in ('blocked', 'unsure')
          and not exists (select 1 from nestly.media_training_samples t where t.source_media_id = m.id)
        order by m.decided_at asc, m.id asc
        limit ${limit}`);
    },
    async addSample(image, copy) {
      try {
        await sql.begin(async (tx) => {
          const [sample] = z.array(idRow).length(1).parse(await tx`
            insert into nestly.media_training_samples (source_media_id, label, queue_reason, mime, decided_at)
            values (${image.id}, ${image.status === 'rejected' ? 'blocked' : 'allowed'}, ${image.queue_reason}, ${image.mime}, ${image.decided_at}::timestamptz)
            returning id`);
          if (sample === undefined || !(await copy(sample.id))) throw new RolledBack();
        });
        return true;
      } catch {
        return false;
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
