// The background image job (I5; Afik 20.10.2026, decisions-in-force.md §2 and §7; BR-076 as replaced, BR-077, AC-102, AC-105). Runs as the
// app_jobs role (media-job-repository.ts; data-model rule 6). One run, inside a time budget:
//   1. check   pending images, oldest first: the model's scores against the thresholds -> passed, or queued (blocked / unsure). A failed
//              check counts an attempt and the image stays pending (fail closed); at the limit it goes to the queue as "error".
//   2. train   copy into the training bucket, with its index row in one transaction: each image the model blocked or was unsure about once
//              staff decided it (children included), and each passed image whose post was removed after a report; never a suspected one
//              (the insert policy). Samples expire after the configured months (6 by default).
//   2b. remove a rejected image's file, once its copy exists (its row stays 30 days for the uploader's message).
//   3. purge   delete what BR-077 deletes (the delete policy names it): expired Stories, suspected images after 90 days, rejected after 30,
//              unattached or replaced images after a day; files and rows go together (a failed removal keeps the rows for the next run).
//   4. expire  training samples past their expiry, files included.
//   5. sweep   image files older than a day that have no row (a removal that failed after its row was gone).
// Nothing is logged but counts: no id, no score, no file.

import { verdictOf } from '@nestly/shared';
import type { JobStorage } from '../media/storage-admin.js';
import type { JobsConfig } from './config.js';
import type { JobDb } from './media-job-repository.js';
import type { ImageModel } from './nudenet.js';

export interface MediaJobDependencies {
  readonly db: JobDb;
  readonly storage: JobStorage;
  readonly model: () => Promise<ImageModel>;
  readonly config: Pick<JobsConfig, 'blockThreshold' | 'lowThreshold' | 'maxAttempts' | 'trainingRetentionMonths'>;
  /** Milliseconds left in this run; the job stops starting new work below a margin. */
  readonly timeLeft: () => number;
}

export interface MediaJobReport {
  checked: number;
  passed: number;
  queued: number;
  failed: number;
  trained: number;
  filesRemoved: number;
  purged: number;
  expired: number;
  swept: number;
}

const MARGIN_MS = 8_000;
const CHECK_BATCH = 25;
const TRAIN_BATCH = 20;
const PURGE_BOUND = 1_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const rounded = (scores: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(scores).map(([label, value]) => [label, Math.round(value * 10_000) / 10_000]));

async function checkPending(deps: MediaJobDependencies, report: MediaJobReport): Promise<void> {
  const rows = await deps.db.pending(CHECK_BATCH);
  if (rows.length === 0) return;
  const model = await deps.model().catch(() => undefined); // unavailable: every image below counts a failed attempt
  for (const row of rows) {
    if (deps.timeLeft() < MARGIN_MS) return;
    report.checked += 1;
    try {
      if (model === undefined) throw new Error('model unavailable');
      const bytes = await deps.storage.readImage(row.id);
      if (bytes === undefined) throw new Error('file unavailable');
      const scores = await model.score(bytes);
      const verdict = verdictOf(scores, deps.config);
      if (verdict.status === 'passed') {
        await deps.db.markPassed(row.id, rounded(scores));
        report.passed += 1;
      } else {
        await deps.db.markQueued(row.id, verdict.reason, rounded(scores));
        report.queued += 1;
      }
    } catch {
      report.failed += 1;
      await deps.db.markFailed(row.id, row.attempts + 1 >= deps.config.maxAttempts);
    }
  }
}

async function copyTrainingSamples(deps: MediaJobDependencies, report: MediaJobReport): Promise<void> {
  for (const image of await deps.db.trainable(TRAIN_BATCH)) {
    if (deps.timeLeft() < MARGIN_MS) return;
    const copied = await deps.db.addSample(image, deps.config.trainingRetentionMonths, async (sampleId) => {
      const bytes = await deps.storage.readImage(image.id);
      return bytes !== undefined && (await deps.storage.writeTrainingSample(sampleId, bytes, image.mime)) === 'ok';
    });
    if (copied) report.trained += 1;
  }
}

async function sweepOrphans(deps: MediaJobDependencies, report: MediaJobReport): Promise<void> {
  const listed = await deps.storage.listImagesBefore(new Date(Date.now() - DAY_MS), 1000);
  if (listed === undefined || listed.length === 0) return;
  const known = await deps.db.knownImageIds(listed);
  const orphans = listed.filter((id) => !known.has(id));
  if (orphans.length > 0 && (await deps.storage.removeImages(orphans)) === 'ok') report.swept += orphans.length;
}

export async function runMediaJob(deps: MediaJobDependencies): Promise<MediaJobReport> {
  const report: MediaJobReport = { checked: 0, passed: 0, queued: 0, failed: 0, trained: 0, filesRemoved: 0, purged: 0, expired: 0, swept: 0 };
  const more = (): boolean => deps.timeLeft() > MARGIN_MS;
  await checkPending(deps, report);
  if (more()) await copyTrainingSamples(deps, report);
  // a rejected image's file goes at once, after its training copy (the update policy refuses it before)
  if (more()) report.filesRemoved = await deps.db.removeRejectedFiles(async (ids) => (await deps.storage.removeImages(ids)) === 'ok');
  if (more()) report.purged = await deps.db.purgeImages(PURGE_BOUND, async (ids) => (await deps.storage.removeImages(ids)) === 'ok');
  if (more()) report.expired = await deps.db.expireSamples(async (ids) => (await deps.storage.removeTrainingSamples(ids)) === 'ok');
  if (more()) await sweepOrphans(deps, report);
  return report;
}
