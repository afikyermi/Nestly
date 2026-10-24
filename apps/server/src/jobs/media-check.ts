// The background image job (I5; Afik 20.10.2026, decisions-in-force.md §2 and §7; BR-076 as replaced, BR-077, AC-102, AC-105). Runs as the
// app_media_jobs role (media-job-repository.ts; data-model rule 6). One run, inside a time budget:
//   1. check   pending images, oldest first: the model's scores against the thresholds -> passed, or queued (blocked / unsure) with the
//              staff-only review written first. A failed check counts an attempt and the image stays pending (fail closed); at the limit it
//              goes to the queue as "error".
//   2. train   copy into the training bucket, with its index row in one transaction: each image the model blocked or was unsure about once
//              staff decided it (children included), and each image removed after a report (a candidate); never a held or suspected one
//              (the insert policy). The database keeps a sample exactly 6 months.
//   2b. remove a rejected image's file, once its copy exists where one is made (its row stays 30 days for the uploader's message); never a
//              held image's file before its 90 days.
//   3. purge   expired Stories, then every image row the delete policy allows (BR-077, M6): never a queued or held image early; files and
//              rows go together (a failed removal keeps the rows for the next run).
//   4. prune   training samples past their 6 months or whose image became suspected, files included (the access record notes each).
//   5. sweep   image files older than a day that have no row (a removal that failed after its row was gone).
// Steps 3–5, and the files of images removed after a report (their report may still be open, and closing it with action taken makes them
// training candidates), run only in the daily run; a run asked for after an upload or a decision does 1, 2 and 2b for queue decisions.
//   1b. block (I14 completion B, Afik 21.10.2026) before the model: each checked image's perceptual hash is recorded; one within 6 bits of the
//              block list is rejected and held as a suspicion (the uploader sees the usual rejection; a staff-queue item; no account action).
//   1c. list   the hash of each image a staff member marked or confirmed as suspected joins the block list (no expiry).
// Nothing is logged but counts: no id, no score, no file, no hash.

import { verdictOf } from '@nestly/shared';
import type { JobStorage } from '../media/storage-admin.js';
import type { JobsConfig } from './config.js';
import type { JobDb } from './media-job-repository.js';
import type { ImageModel } from './nudenet.js';
import type { BlockListDb } from './block-list-repository.js';
import { fingerprintOf } from './image-fingerprint.js';

export interface MediaJobDependencies {
  readonly db: JobDb;
  readonly storage: JobStorage;
  readonly model: () => Promise<ImageModel>;
  readonly config: Pick<JobsConfig, 'blockThreshold' | 'lowThreshold' | 'maxAttempts'>;
  /** Milliseconds left in this run; the job stops starting new work below a margin. */
  readonly timeLeft: () => number;
  /** The daily run (true) does every step; a run asked for after an upload or a queue decision (false) only checks, copies and removes the
   *  files of images staff rejected from the queue, so overlapping runs stay short, and a file read that fails there counts no attempt. */
  readonly full: boolean;
  /** I14 completion B: the upload block list (absent: no hash step, as before). */
  readonly blockList?: BlockListDb;
}

export interface MediaJobReport {
  checked: number;
  passed: number;
  queued: number;
  failed: number;
  trained: number;
  filesRemoved: number;
  storiesPurged: number;
  purged: number;
  pruned: number;
  swept: number;
  /** I14 completion B: uploads blocked by the list, and hashes added to it. */
  blocked?: number;
  listed?: number;
}

const MARGIN_MS = 8_000;
const CHECK_BATCH = 25;
const TRAIN_BATCH = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_PAGE = 1_000;

const rounded = (scores: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(scores).map(([label, value]) => [label, Math.round(value * 10_000) / 10_000]));

async function checkPending(deps: MediaJobDependencies, report: MediaJobReport): Promise<void> {
  const rows = await deps.db.pending(CHECK_BATCH);
  if (rows.length === 0) return;
  // The model unavailable is the system's failure, not the images': they stay pending (hidden from others) and nobody's attempt is counted.
  const model = await deps.model().catch(() => undefined);
  if (model === undefined) return;
  for (const row of rows) {
    if (deps.timeLeft() < MARGIN_MS) return;
    report.checked += 1;
    try {
      const bytes = await deps.storage.readImage(row.id);
      if (bytes === undefined) {
        // Storage unreachable, or the file gone: only the daily run counts it, so an outage during uploads never fills the queue with errors
        if (!deps.full) continue;
        throw new Error('file unavailable');
      }
      // I14 completion B: the block list first; a match is never scored or shown
      if (deps.blockList !== undefined) {
        const fingerprint = await fingerprintOf(bytes);
        if (fingerprint !== undefined) {
          await deps.blockList.recordFingerprint(row.id, fingerprint);
          if (await deps.blockList.matchesBlockList(row.id)) {
            await deps.blockList.markMatch(row.id);
            report.blocked = (report.blocked ?? 0) + 1;
            continue;
          }
        }
      }
      const scores = await model.score(bytes);
      const verdict = verdictOf(scores, deps.config);
      if (verdict.status === 'passed') {
        await deps.db.markPassed(row.id);
        report.passed += 1;
      } else {
        await deps.db.markQueued(row.id, verdict.reason, rounded(scores));
        report.queued += 1;
      }
    } catch {
      // Also reached when another run already moved this image (runs may overlap: each upload and decision asks for one); the policy then
      // refuses the write, and counting the attempt below changes nothing or fails quietly. One image never stops the run.
      report.failed += 1;
      await deps.db.markFailed(row.id, row.attempts + 1 >= deps.config.maxAttempts).catch(() => undefined);
    }
  }
}

/** 1c: the hash of every image a staff member marked or confirmed as suspected joins the list (read from its kept file when not recorded yet). */
async function listSuspected(deps: MediaJobDependencies, blockList: BlockListDb, report: MediaJobReport): Promise<void> {
  for (const image of await blockList.suspectedToList(TRAIN_BATCH)) {
    if (deps.timeLeft() < MARGIN_MS) return;
    try {
      if (image.fingerprint === null) {
        const bytes = await deps.storage.readImage(image.id);
        const fingerprint = bytes === undefined ? undefined : await fingerprintOf(bytes);
        if (fingerprint === undefined) continue;
        await blockList.recordFingerprint(image.id, fingerprint);
      }
      if (await blockList.addToList(image.id)) report.listed = (report.listed ?? 0) + 1;
    } catch {
      // the next run tries again; one image never stops the run
    }
  }
}

async function copyTrainingSamples(deps: MediaJobDependencies, report: MediaJobReport): Promise<void> {
  for (const image of await deps.db.trainable(TRAIN_BATCH)) {
    if (deps.timeLeft() < MARGIN_MS) return;
    const copied = await deps.db.addSample(image, async (sampleId) => {
      const bytes = await deps.storage.readImage(image.id);
      return bytes !== undefined && (await deps.storage.writeTrainingSample(sampleId, bytes, image.mime)) === 'ok';
    });
    if (copied) report.trained += 1;
  }
}

async function sweepOrphans(deps: MediaJobDependencies, report: MediaJobReport): Promise<void> {
  const before = new Date(Date.now() - DAY_MS);
  let offset = 0;
  while (deps.timeLeft() > MARGIN_MS) {
    const page = await deps.storage.listImagesBefore(before, SWEEP_PAGE, offset);
    if (page === undefined) return;
    const known = await deps.db.knownImageIds(page.ids);
    const orphans = page.ids.filter((id) => !known.has(id));
    const removed = orphans.length > 0 && (await deps.storage.removeImages(orphans)) === 'ok';
    if (removed) report.swept += orphans.length;
    if (!page.more) return;
    offset += SWEEP_PAGE - (removed ? orphans.length : 0); // the removed files no longer take a place in the listing
  }
}

export async function runMediaJob(deps: MediaJobDependencies): Promise<MediaJobReport> {
  const report: MediaJobReport = { checked: 0, passed: 0, queued: 0, failed: 0, trained: 0, filesRemoved: 0, storiesPurged: 0, purged: 0, pruned: 0, swept: 0 };
  const more = (): boolean => deps.timeLeft() > MARGIN_MS;
  await checkPending(deps, report);
  if (deps.blockList !== undefined && more()) await listSuspected(deps, deps.blockList, report);
  if (more()) await copyTrainingSamples(deps, report);
  // a rejected image's file goes at once, after its training copy (the update policy refuses it before)
  if (more()) report.filesRemoved = await deps.db.removeRejectedFiles(async (ids) => (await deps.storage.removeImages(ids)) === 'ok', !deps.full);
  if (!deps.full) return report;
  if (more()) report.storiesPurged = await deps.db.purgeStories();
  if (more()) report.purged = await deps.db.purgeImages(async (ids) => (await deps.storage.removeImages(ids)) === 'ok');
  if (more()) report.pruned = await deps.db.pruneSamples(async (ids) => (await deps.storage.removeTrainingSamples(ids)) === 'ok');
  if (more()) await sweepOrphans(deps, report);
  return report;
}
