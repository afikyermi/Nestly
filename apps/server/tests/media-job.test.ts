import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { verdictOf } from '@nestly/shared';
import type { JobStorage, StorageOutcome } from '../src/media/storage-admin.js';
import { readJobsConfig } from '../src/jobs/config.js';
import { isAuthorized } from '../src/jobs/handler.js';
import { runMediaJob, type MediaJobDependencies } from '../src/jobs/media-check.js';
import type { JobDb } from '../src/jobs/media-job-repository.js';
import { bestScores, loadNudeNet, type ImageModel } from '../src/jobs/nudenet.js';

// I5 (Afik 20.10.2026, decisions-in-force.md §2, §7; BR-076 as replaced; AC-105): the background check's rule, its configuration, its secret
// and one run against a stand-in database and storage. What the job may touch is the database's (TO app_jobs policies, pgTAP file 91).
const T = { timeout: 60_000 };
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const URL_PARTS = ['postgresql', '://', 'app_jobs.abcdefgh', ':', 'pw', '@', 'aws-0.pooler.supabase.com:6543/postgres'];

describe('[AC-105 Afik 20.10] the decision rule', () => {
  const t = { blockThreshold: 0.6, lowThreshold: 0.25 };
  it('a blocking label at or above T_block blocks; between the thresholds is unsure; below passes; other labels never count', () => {
    expect(verdictOf({ FEMALE_BREAST_EXPOSED: 0.6 }, t)).toEqual({ status: 'queued', reason: 'blocked' });
    expect(verdictOf({ BUTTOCKS_EXPOSED: 0.3, FACE_FEMALE: 0.99 }, t)).toEqual({ status: 'queued', reason: 'unsure' });
    expect(verdictOf({ MALE_GENITALIA_EXPOSED: 0.249, BELLY_EXPOSED: 0.95, MALE_BREAST_EXPOSED: 0.9 }, t)).toEqual({ status: 'passed' });
    expect(verdictOf({}, t)).toEqual({ status: 'passed' });
  });
  it('[Afik 20.10] breastfeeding (an exposed female breast) blocks like any exposed breast', () => {
    expect(verdictOf({ FEMALE_BREAST_EXPOSED: 0.8 }, t).status).toBe('queued');
  });
});

describe('[Afik 20.10 §7] the job configuration and its secret', () => {
  it('uses only an app_jobs connection string; thresholds are configuration with safe defaults', () => {
    expect(readJobsConfig({ APP_JOBS_DATABASE_URL: URL_PARTS.join(''), CRON_SECRET: 'x'.repeat(32) }).databaseUrl).toBe(URL_PARTS.join(''));
    const other = [...URL_PARTS];
    other[2] = 'app_server.abcdefgh';
    expect(readJobsConfig({ APP_JOBS_DATABASE_URL: other.join('') }).databaseUrl).toBeUndefined();
    expect(readJobsConfig({}).blockThreshold).toBe(0.6);
    expect(readJobsConfig({}).lowThreshold).toBe(0.25);
    expect(readJobsConfig({ MEDIA_CHECK_BLOCK_THRESHOLD: '0.5', MEDIA_CHECK_LOW_THRESHOLD: '0.9' }).lowThreshold).toBe(0.5);
    expect(readJobsConfig({ MEDIA_CHECK_BLOCK_THRESHOLD: 'abc' }).blockThreshold).toBe(0.6);
    expect(readJobsConfig({ CRON_SECRET: 'short' }).secret).toBeUndefined();
  });
  it('the job answers only the exact bearer secret', () => {
    const secret = 's'.repeat(32);
    expect(isAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorized(secret, secret)).toBe(false);
    expect(isAuthorized(undefined, secret)).toBe(false);
    expect(isAuthorized(`Bearer ${secret}`, undefined)).toBe(false);
  });
});

describe('[Afik 20.10] the model', () => {
  it('reads the best score of each label over the anchors', () => {
    // dims [1, 4 + 18, 2]: label rows start at 4; FEMALE_GENITALIA_COVERED is row 4, FACE_FEMALE row 5
    const data = new Float32Array(22 * 2);
    data[4 * 2 + 1] = 0.7;
    data[5 * 2] = 0.2;
    const best = bestScores([1, 22, 2], data);
    expect(best['FEMALE_GENITALIA_COVERED']).toBeCloseTo(0.7);
    expect(best['FACE_FEMALE']).toBeCloseTo(0.2);
    expect(best['BUTTOCKS_EXPOSED']).toBe(0);
  });
  it('[AC-105] NudeNet loads and scores a plain picture with no blocking label', T, async () => {
    const model = await loadNudeNet();
    const image = new Uint8Array(await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 120, g: 160, b: 220 } } }).jpeg().toBuffer());
    const scores = await model.score(image);
    expect(Object.keys(scores).length).toBe(18);
    expect(verdictOf(scores, { blockThreshold: 0.6, lowThreshold: 0.25 })).toEqual({ status: 'passed' });
  });
});

// ---- one run, against a stand-in database ----------------------------------------------------------------------------------------
function fakeDb(over: Partial<JobDb> = {}) {
  const calls: string[] = [];
  const db: JobDb = {
    pending: () => Promise.resolve([]),
    markPassed: (id) => {
      calls.push(`passed:${id}`);
      return Promise.resolve();
    },
    markQueued: (id, reason) => {
      calls.push(`queued:${reason}:${id}`);
      return Promise.resolve();
    },
    markFailed: (id, exhausted) => {
      calls.push(`failed:${exhausted ? 'queue' : 'stay'}:${id}`);
      return Promise.resolve();
    },
    trainable: () => Promise.resolve([]),
    addSample: async (image, copy) => {
      const ok = await copy(`sample-of-${image.id}`);
      calls.push(`sample:${ok ? 'kept' : 'rolled-back'}:${image.id}`);
      return ok;
    },
    purgeImages: async (_bound, remove) => {
      const ids: string[] = [];
      return ids.length === 0 || (await remove(ids)) ? ids.length : 0;
    },
    expireSamples: () => Promise.resolve(0),
    knownImageIds: (ids) => Promise.resolve(new Set(ids.filter((id) => id === ID(90)))),
    ...over,
  };
  return { db, calls };
}

function fakeJobStorage(over: Partial<JobStorage> = {}) {
  const removed: string[] = [];
  const training: string[] = [];
  const storage: JobStorage = {
    isConfigured: () => true,
    readImage: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    removeImages: (ids) => {
      removed.push(...ids);
      return Promise.resolve<StorageOutcome>('ok');
    },
    listImagesBefore: () => Promise.resolve([]),
    writeTrainingSample: (id) => {
      training.push(id);
      return Promise.resolve<StorageOutcome>('ok');
    },
    removeTrainingSamples: () => Promise.resolve<StorageOutcome>('ok'),
    ...over,
  };
  return { storage, removed, training };
}

const model = (scores: Record<string, Record<string, number>>, failOn = new Set<number>()): (() => Promise<ImageModel>) => {
  let call = 0;
  return () =>
    Promise.resolve({
      score: () => {
        call += 1;
        if (failOn.has(call)) return Promise.reject(new Error('boom'));
        return Promise.resolve(scores[String(call)] ?? {});
      },
    });
};

const deps = (db: JobDb, storage: JobStorage, m: () => Promise<ImageModel>): MediaJobDependencies => ({
  db,
  storage,
  model: m,
  config: { blockThreshold: 0.6, lowThreshold: 0.25, maxAttempts: 3 },
  timeLeft: () => 60_000,
});

describe('[AC-105 BR-077 Afik 20.10] one run of the job', () => {
  it('checks pending images: passed, blocked, unsure, and a failure that stays pending or goes to the queue at the limit', async () => {
    const pending = [ID(1), ID(2), ID(3), ID(4)].map((id) => ({ id, attempts: 0 }));
    const { db, calls } = fakeDb({ pending: () => Promise.resolve([...pending, { id: ID(5), attempts: 2 }]) });
    const store = fakeJobStorage({ listImagesBefore: () => Promise.resolve([ID(90), ID(91)]) });
    const report = await runMediaJob(deps(db, store.storage, model({ '1': { FACE_FEMALE: 0.9 }, '2': { FEMALE_BREAST_EXPOSED: 0.91 }, '3': { BUTTOCKS_EXPOSED: 0.3 } }, new Set([4, 5]))));
    expect(report).toMatchObject({ checked: 5, passed: 1, queued: 2, failed: 2, swept: 1 });
    expect(calls).toEqual([`passed:${ID(1)}`, `queued:blocked:${ID(2)}`, `queued:unsure:${ID(3)}`, `failed:stay:${ID(4)}`, `failed:queue:${ID(5)}`]);
    expect(store.removed, 'the sweep removes the file that has no row, never one that has').toEqual([ID(91)]);
  });

  it('when the model cannot load, every pending image counts a failed attempt and nothing passes (fail closed)', async () => {
    const { db, calls } = fakeDb({ pending: () => Promise.resolve([{ id: ID(1), attempts: 0 }]) });
    const report = await runMediaJob(deps(db, fakeJobStorage().storage, () => Promise.reject(new Error('no model'))));
    expect(report).toMatchObject({ checked: 1, passed: 0, failed: 1 });
    expect(calls).toEqual([`failed:stay:${ID(1)}`]);
  });

  it('[Afik 20.10] copies a decided blocked image into the training bucket under the index row\'s id; a failed copy keeps no row', async () => {
    const image = { id: ID(7), mime: 'image/webp', status: 'rejected' as const, queue_reason: 'blocked' as const, decided_at: '2026-10-20 10:00:00.123456+00' };
    const { db, calls } = fakeDb({ trainable: () => Promise.resolve([image]) });
    const store = fakeJobStorage();
    expect((await runMediaJob(deps(db, store.storage, model({})))).trained).toBe(1);
    expect(store.training).toEqual([`sample-of-${ID(7)}`]);
    const broken = fakeDb({ trainable: () => Promise.resolve([image]) });
    const failing = fakeJobStorage({ writeTrainingSample: () => Promise.resolve('failed') });
    expect((await runMediaJob(deps(broken.db, failing.storage, model({})))).trained).toBe(0);
    expect(broken.calls).toEqual([`sample:rolled-back:${ID(7)}`]);
    expect(calls).toEqual([`sample:kept:${ID(7)}`]);
  });

  it('[BR-077] purges the rows the delete policy names together with their files; a failed removal counts nothing', async () => {
    const purge = (ok: boolean): JobDb['purgeImages'] => async (_bound, remove) => ((await remove([ID(8), ID(9)])) && ok ? 2 : 0);
    const store = fakeJobStorage();
    expect((await runMediaJob(deps(fakeDb({ purgeImages: purge(true) }).db, store.storage, model({})))).purged).toBe(2);
    expect(store.removed).toEqual([ID(8), ID(9)]);
    const broken = fakeJobStorage({ removeImages: () => Promise.resolve('failed') });
    expect((await runMediaJob(deps(fakeDb({ purgeImages: async (_b, remove) => ((await remove([ID(8)])) ? 1 : 0) }).db, broken.storage, model({})))).purged).toBe(0);
  });
});
