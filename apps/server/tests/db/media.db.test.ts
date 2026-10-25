import postgres, { type Sql } from 'postgres';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createDatabase, type Database } from '../../src/db/client.js';
import { createBlockListDb, type BlockListDb } from '../../src/jobs/block-list-repository.js';
import { processUpload } from '../../src/media/image-processing.js';
import { AUDIENCE, COLD_START_MS, ISSUER, newKey, restoreEnv, startJwks, token, type App, type JwksServer, type TestKey } from '../helpers/identity-fixtures.js';
import { fakeMediaStorage } from '../helpers/media-fakes.js';
import { CLOCK_NOW, buildRegisterApp, post, validBody } from '../helpers/register-app.js';

// I5 against the real database (CI `db` job, as app_server; fixtures of supabase/tests/setup/), with Storage replaced by an in-memory fake:
// uploads (FR-FEED-002, AC-104, AC-105), a post's images, the profile photo (FR-PROFILE-001, BR-077), Stories (FR-FEED-008, AC-102, AC-103,
// ERR-040) and the approval queue (Afik 20.10.2026). The background check's moves are made as app_media_jobs through the CI-only fixture.

const T = { timeout: COLD_START_MS };
const ADMIN = '60000000-0000-4000-8000-0000000000a2'; // 60_'s fr_d

let key: TestKey;
let jwks: JwksServer;
let side: ReturnType<typeof postgres>;
const toClose: Array<{ app: App; database: Database }> = [];

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not set: the db job must run these tests as app_server through it');
  return value;
}
const env = () => ({ SUPABASE_JWKS_URL: jwks.url, SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUDIENCE: AUDIENCE, DATABASE_URL: url() });

async function start(options: Parameters<typeof fakeMediaStorage>[0] = {}) {
  const fake = fakeMediaStorage(options);
  let kicks = 0;
  const database = createDatabase(url());
  const app = await buildRegisterApp(env(), {
    database,
    clock: () => CLOCK_NOW,
    media: {
      storage: fake.storage,
      kick: () => {
        kicks += 1;
        return Promise.resolve();
      },
      process: processUpload,
    },
  });
  toClose.push({ app, database });
  return { app, fake, kicks: () => kicks };
}

const bearerFor = async (sub: string): Promise<string> => `Bearer ${await token({ key, sub })}`;

async function registered(app: App, fullName: string): Promise<{ id: string; header: string }> {
  const [row] = await side`select tests.fx_new_auth_user()::text as id`;
  const id = String(row?.id);
  const header = await bearerFor(id);
  const res = await post(app, header, validBody({ fullName }));
  if (res.statusCode !== 201) throw new Error(`could not register a fresh user: ${res.statusCode} ${res.body}`);
  return { id, header };
}

let jpeg: Buffer;
const upload = (app: App, header: string, kind: string, body: Buffer = jpeg, type = 'image/jpeg') =>
  app.inject({ method: 'POST', url: `/api/media?kind=${kind}`, headers: { authorization: header, 'content-type': type }, payload: body });
const json = (app: App, header: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, payload?: unknown) =>
  app.inject({ method, url: path, headers: { authorization: header, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }) });
const imageId = (body: string): string => z.object({ id: z.guid(), state: z.literal('pending') }).parse(JSON.parse(body)).id;

/** The background check's move, as app_media_jobs (the CI-only fixture lets app_server become it inside one transaction); a queued image
 *  gets its staff-only review first, as the job writes it. */
async function jobSets(id: string, status: 'passed' | 'queued', reason: 'blocked' | 'unsure' = 'blocked'): Promise<void> {
  await side.begin(async (tx) => {
    await tx`select 1`;
    await tx`select tests.fx_media_jobs_on()`;
    await tx`set local role app_media_jobs`;
    if (status === 'queued') await tx`insert into nestly.media_reviews (media_id, queue_reason, scores) values (${id}::uuid, ${reason}, '{"FEMALE_BREAST_EXPOSED": 0.8}')`;
    await tx`update nestly.media_assets set status = ${status} where id = ${id}::uuid and status = 'pending'`;
    await tx`reset role`;
    await tx`select tests.fx_media_jobs_off()`;
  });
}

/** The job's block-list steps, run by the job's own SQL (createBlockListDb) as app_media_jobs inside one committed transaction, on a reserved
 *  connection of the side pool (the fixture lets app_server become the job only inside a transaction). */
async function asJob(work: (blockList: BlockListDb, sql: Sql) => Promise<void>): Promise<void> {
  const reserved = await side.reserve();
  try {
    await reserved`begin`;
    await reserved`select tests.fx_media_jobs_on()`;
    await reserved`set local role app_media_jobs`;
    await work(createBlockListDb(reserved), reserved);
    await reserved`reset role`;
    await reserved`select tests.fx_media_jobs_off()`;
    await reserved`commit`;
  } catch (error) {
    await reserved`rollback`;
    throw error;
  } finally {
    reserved.release();
  }
}

beforeAll(async () => {
  key = await newKey('media-db-key');
  jwks = await startJwks([key]);
  side = postgres(url(), { max: 1, prepare: false, onnotice: () => undefined });
  const [who] = await side`select session_user::text as su`;
  expect(who?.su, 'these tests must run as app_server, never as a role that bypasses RLS').toBe('app_server');
  jpeg = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .jpeg()
    .withExif({ IFD0: { Make: 'NestlyPhone' } })
    .toBuffer();
}, COLD_START_MS);

afterEach(async () => {
  for (const { app, database } of toClose.splice(0)) {
    await app.close();
    await database.close();
  }
});

afterAll(async () => {
  await jwks.close();
  await side.end({ timeout: 5 });
  restoreEnv();
});

describe('[FR-FEED-002 AC-104 AC-105] uploads', () => {
  it('[AC-104 AC-105] 201 pending; the stored file is re-encoded (≤ 2048, no EXIF) under the row id; the check is asked to run', T, async () => {
    const { app, fake, kicks } = await start();
    const u = await registered(app, 'Uma Upload');
    const res = await upload(app, u.header, 'post');
    expect(res.statusCode, res.body).toBe(201);
    const body = z.object({ id: z.guid(), state: z.literal('pending'), url: z.string(), width: z.number(), height: z.number() }).parse(JSON.parse(res.body));
    expect([body.width, body.height]).toEqual([2048, 1024]);
    const stored = fake.files.get(body.id);
    expect(stored?.mime).toBe('image/webp');
    expect(Buffer.from(stored?.bytes ?? new Uint8Array()).includes(Buffer.from('NestlyPhone'))).toBe(false);
    expect(kicks()).toBe(1);
  });

  it('[ERR-039] another type is 415; a bad kind is 400; storage down is 503 and nothing is kept; an Admin account cannot upload (403)', T, async () => {
    const { app } = await start();
    const u = await registered(app, 'Uri Upload');
    expect((await upload(app, u.header, 'post', Buffer.from('GIF89a'), 'image/gif')).statusCode).toBe(415);
    expect((await upload(app, u.header, 'post', Buffer.from('not an image'), 'image/png')).statusCode).toBe(415);
    expect((await upload(app, u.header, 'video')).statusCode).toBe(400);
    expect((await upload(app, await bearerFor(ADMIN), 'post')).statusCode).toBe(403);
    const down = await start({ upload: 'failed' });
    const v = await registered(down.app, 'Vera Down');
    expect((await upload(down.app, v.header, 'post')).statusCode).toBe(503);
    expect(down.fake.files.size).toBe(0);
    const unset = await start({ configured: false });
    expect((await upload(unset.app, v.header, 'post')).statusCode).toBe(503);
  });
});

describe('[FR-FEED-002 AC-021 AC-105] a post with images', () => {
  it('[AC-021] the images are attached in order; others see them only after the check; another user\'s image is refused and nothing is posted', T, async () => {
    const { app } = await start();
    const a = await registered(app, 'Ada Author');
    const b = await registered(app, 'Bo Reader');
    const first = imageId((await upload(app, a.header, 'post')).body);
    const second = imageId((await upload(app, a.header, 'post')).body);
    const res = await json(app, a.header, 'POST', '/api/posts', { body: 'עם תמונות', audience: 'everyone', imageIds: [first, second] });
    expect(res.statusCode, res.body).toBe(201);
    const created = z.object({ id: z.guid(), images: z.array(z.object({ id: z.guid(), state: z.string() })) }).parse(JSON.parse(res.body));
    expect(created.images.map((i) => [i.id, i.state])).toEqual([[first, 'pending'], [second, 'pending']]);
    const asB = async () => z.object({ images: z.array(z.object({ id: z.guid(), state: z.string() })).optional() }).parse(JSON.parse((await json(app, b.header, 'GET', `/api/posts/${created.id}`)).body)).images ?? [];
    expect(await asB(), '[AC-105] before the check another reader sees no image').toEqual([]);
    await jobSets(first, 'passed');
    expect((await asB()).map((i) => [i.id, i.state]), '[AC-105] after the check the image shows').toEqual([[first, 'ready']]);
    const third = imageId((await upload(app, a.header, 'post')).body);
    const stolen = await json(app, b.header, 'POST', '/api/posts', { body: 'לא שלי', audience: 'everyone', imageIds: [third] });
    expect(stolen.statusCode).toBe(422);
    expect(JSON.parse(stolen.body)).toEqual({ error: 'image_not_available' });
    const reused = await json(app, a.header, 'POST', '/api/posts', { body: 'שוב', audience: 'everyone', imageIds: [first] });
    expect(reused.statusCode, 'an image belongs to one post').toBe(422);
    expect((await json(app, a.header, 'POST', '/api/posts', { body: 'x', audience: 'everyone', imageIds: [third, third] })).statusCode).toBe(400);
  });
});

describe('[FR-PROFILE-001 BR-077] the profile photo', () => {
  it('set, read, replace (the old file is removed at once) and remove; never someone else\'s image', T, async () => {
    const { app, fake } = await start();
    const a = await registered(app, 'Pia Photo');
    const b = await registered(app, 'Bea Other');
    expect(JSON.parse((await json(app, a.header, 'GET', '/api/profile/photo')).body)).toEqual({ photo: null });
    const one = imageId((await upload(app, a.header, 'profile')).body);
    expect((await json(app, a.header, 'PUT', '/api/profile/photo', { mediaId: one })).statusCode).toBe(200);
    expect(z.object({ photo: z.object({ id: z.guid() }) }).parse(JSON.parse((await json(app, a.header, 'GET', '/api/profile/photo')).body)).photo.id).toBe(one);
    const two = imageId((await upload(app, a.header, 'profile')).body);
    expect((await json(app, a.header, 'PUT', '/api/profile/photo', { mediaId: two })).statusCode).toBe(200);
    expect(fake.removed, '[BR-077] the replaced photo\'s file is removed at once').toContain(one);
    const bImage = imageId((await upload(app, b.header, 'profile')).body);
    expect((await json(app, a.header, 'PUT', '/api/profile/photo', { mediaId: bImage })).statusCode).toBe(422);
    const postImage = imageId((await upload(app, a.header, 'post')).body);
    expect((await json(app, a.header, 'PUT', '/api/profile/photo', { mediaId: postImage })).statusCode, 'only a profile image').toBe(422);
    expect((await json(app, a.header, 'DELETE', '/api/profile/photo')).statusCode).toBe(204);
    expect(fake.removed).toContain(two);
    expect(JSON.parse((await json(app, a.header, 'GET', '/api/profile/photo')).body)).toEqual({ photo: null });
    const queued = imageId((await upload(app, a.header, 'profile')).body);
    expect((await json(app, a.header, 'PUT', '/api/profile/photo', { mediaId: queued })).statusCode).toBe(200);
    await jobSets(queued, 'queued');
    const next = imageId((await upload(app, a.header, 'profile')).body);
    expect((await json(app, a.header, 'PUT', '/api/profile/photo', { mediaId: next })).statusCode).toBe(200);
    expect(fake.removed, '[C3] a queued photo replaced keeps its file: staff still decide it').not.toContain(queued);
  });
});

describe('[FR-FEED-008 AC-102 AC-103 ERR-040] Stories', () => {
  it('[AC-102] the author sees it at once, a reader after the check; [AC-103] the eleventh in 24 hours is 429 story_limit', T, async () => {
    const { app } = await start();
    const a = await registered(app, 'Sivan Story');
    const b = await registered(app, 'Bar Viewer');
    const media = imageId((await upload(app, a.header, 'story')).body);
    const created = await json(app, a.header, 'POST', '/api/stories', { mediaId: media, caption: 'בוקר טוב', audience: 'everyone' });
    expect(created.statusCode, created.body).toBe(201);
    const groups = async (header: string) =>
      z.object({ groups: z.array(z.object({ authorId: z.guid(), isMine: z.boolean(), items: z.array(z.object({ caption: z.string().nullable() })) })), postedToday: z.number() }).parse(JSON.parse((await json(app, header, 'GET', '/api/stories')).body));
    const mine = await groups(a.header);
    expect(mine.groups.find((g) => g.authorId === a.id)).toMatchObject({ isMine: true, items: [{ caption: 'בוקר טוב' }] });
    expect(mine.postedToday).toBe(1);
    expect((await groups(b.header)).groups.some((g) => g.authorId === a.id), 'before the check, readers do not see it').toBe(false);
    await jobSets(media, 'passed');
    expect((await groups(b.header)).groups.some((g) => g.authorId === a.id), 'after the check, everyone does').toBe(true);
    for (let i = 2; i <= 10; i++) {
      const m = imageId((await upload(app, a.header, 'story')).body);
      expect((await json(app, a.header, 'POST', '/api/stories', { mediaId: m, audience: 'friends' })).statusCode).toBe(201);
    }
    const eleventh = imageId((await upload(app, a.header, 'story')).body);
    const refused = await json(app, a.header, 'POST', '/api/stories', { mediaId: eleventh, audience: 'everyone' });
    expect(refused.statusCode).toBe(429);
    expect(JSON.parse(refused.body)).toEqual({ error: 'story_limit' });
    expect((await json(app, a.header, 'POST', '/api/stories', { mediaId: eleventh, audience: 'everyone', caption: 'א'.repeat(201) })).statusCode).toBe(422);
    expect((await json(app, b.header, 'POST', '/api/stories', { mediaId: eleventh, audience: 'everyone' })).statusCode, 'never someone else\'s image').toBe(403);
  });
});

describe('[Afik 20.10] the approval queue', () => {
  it('the Admin sees a queued image and decides it once; a user gets 403; the decision shows the image to its post\'s readers', T, async () => {
    const { app } = await start();
    const a = await registered(app, 'Queue Author');
    const b = await registered(app, 'Queue Reader');
    const admin = await bearerFor(ADMIN);
    const media = imageId((await upload(app, a.header, 'post')).body);
    const created = z.object({ id: z.guid() }).parse(JSON.parse((await json(app, a.header, 'POST', '/api/posts', { body: 'בדיקה', audience: 'everyone', imageIds: [media] })).body));
    await jobSets(media, 'queued', 'blocked');
    expect((await json(app, b.header, 'GET', '/api/admin/media-queue')).statusCode).toBe(403);
    const queue = z.object({ items: z.array(z.object({ id: z.guid(), queueReason: z.string(), url: z.string().nullable() })) }).parse(JSON.parse((await json(app, admin, 'GET', '/api/admin/media-queue')).body));
    expect(queue.items.find((i) => i.id === media)).toMatchObject({ queueReason: 'blocked' });
    expect((await json(app, b.header, 'POST', `/api/admin/media/${media}/decision`, { decision: 'approved', isChild: false })).statusCode).toBe(404);
    expect((await json(app, admin, 'POST', `/api/admin/media/${media}/decision`, { decision: 'approved', isChild: true })).statusCode).toBe(200);
    expect((await json(app, admin, 'POST', `/api/admin/media/${media}/decision`, { decision: 'rejected', isChild: false })).statusCode, 'decided once').toBe(404);
    const seen = z.object({ images: z.array(z.object({ id: z.guid(), state: z.string() })).optional() }).parse(JSON.parse((await json(app, b.header, 'GET', `/api/posts/${created.id}`)).body));
    expect(seen.images?.map((i) => i.state)).toEqual(['ready']);
    expect((await json(app, admin, 'POST', `/api/admin/media/${media}/decision`, { decision: 'maybe', isChild: false })).statusCode).toBe(400);
  });

  it('(Afik 25.10.2026) a reader gets the address signed earlier again; the queue signs a fresh one on every read; a refused image none', T, async () => {
    const { app, fake } = await start();
    const a = await registered(app, 'Stable Author');
    const b = await registered(app, 'Stable Reader');
    const admin = await bearerFor(ADMIN);
    const shown = imageId((await upload(app, a.header, 'post')).body);
    const queued = imageId((await upload(app, a.header, 'post')).body);
    const created = z.object({ id: z.guid() }).parse(JSON.parse((await json(app, a.header, 'POST', '/api/posts', { body: 'יציב', audience: 'everyone', imageIds: [shown, queued] })).body));
    await jobSets(shown, 'passed');
    await jobSets(queued, 'queued', 'unsure');
    const signsOf = (id: string) => fake.signed.filter((ids) => ids.includes(id)).length;
    const asB = async () => z.object({ images: z.array(z.object({ id: z.guid() })) }).parse(JSON.parse((await json(app, b.header, 'GET', `/api/posts/${created.id}`)).body)).images.map((i) => i.id);
    const before = signsOf(shown);
    expect(await asB()).toEqual([shown]);
    expect(await asB()).toEqual([shown]);
    expect(signsOf(shown) - before, 'two reads, no new signing').toBe(0);
    const queueReads = signsOf(queued);
    expect((await json(app, admin, 'GET', '/api/admin/media-queue')).statusCode).toBe(200);
    expect((await json(app, admin, 'GET', '/api/admin/media-queue')).statusCode).toBe(200);
    expect(signsOf(queued) - queueReads, 'the queue signs on every read').toBe(2);
    expect((await json(app, admin, 'POST', `/api/admin/media/${queued}/decision`, { decision: 'rejected', isChild: false })).statusCode).toBe(200);
    expect(await asB(), 'a refused image is not shown, its kept address with it').toEqual([shown]);
    const own = z.object({ images: z.array(z.object({ id: z.guid(), state: z.string(), url: z.string().nullable() })) }).parse(JSON.parse((await json(app, a.header, 'GET', `/api/posts/${created.id}`)).body));
    expect(own.images.find((i) => i.id === queued)).toMatchObject({ state: 'rejected', url: null });
  });

  it('[M6 C1] a suspected image reads to its uploader exactly as a rejected one', T, async () => {
    const { app } = await start();
    const a = await registered(app, 'Held Author');
    const admin = await bearerFor(ADMIN);
    const suspected = imageId((await upload(app, a.header, 'profile')).body);
    const rejected = imageId((await upload(app, a.header, 'profile')).body);
    await jobSets(suspected, 'queued');
    await jobSets(rejected, 'queued');
    expect((await json(app, admin, 'POST', `/api/admin/media/${suspected}/decision`, { decision: 'suspected', isChild: true })).statusCode).toBe(200);
    expect((await json(app, admin, 'POST', `/api/admin/media/${rejected}/decision`, { decision: 'rejected', isChild: false })).statusCode).toBe(200);
    const read = async (id: string) => {
      const res = await json(app, a.header, 'PUT', '/api/profile/photo', { mediaId: id });
      return [res.statusCode, res.body];
    };
    expect(await read(suspected)).toEqual(await read(rejected));
  });

  it('a checked image is removed only after a report, by CONTENT_MODERATE with REPORTS_VIEW; a user gets 403', T, async () => {
    const { app } = await start();
    const a = await registered(app, 'Reported Author');
    const b = await registered(app, 'Reporter');
    const admin = await bearerFor(ADMIN);
    const media = imageId((await upload(app, a.header, 'post')).body);
    const created = z.object({ id: z.guid() }).parse(JSON.parse((await json(app, a.header, 'POST', '/api/posts', { body: 'דיווח', audience: 'everyone', imageIds: [media] })).body));
    await jobSets(media, 'passed');
    expect((await json(app, b.header, 'POST', `/api/admin/media/${media}/removal`, { suspected: false })).statusCode).toBe(403);
    expect((await json(app, admin, 'POST', `/api/admin/media/${media}/removal`, { suspected: false })).statusCode, 'no report yet').toBe(404);
    expect((await json(app, b.header, 'POST', '/api/reports', { targetKind: 'post', targetId: created.id, reason: 'spam' })).statusCode).toBeLessThan(300);
    expect((await json(app, admin, 'POST', `/api/admin/media/${media}/removal`, { suspected: false })).statusCode).toBe(200);
    const seen = z.object({ images: z.array(z.object({ id: z.guid() })).optional() }).parse(JSON.parse((await json(app, b.header, 'GET', `/api/posts/${created.id}`)).body));
    expect(seen.images ?? [], 'gone for readers').toEqual([]);
  });

  it('[M6] a suspicion marked on a passed image after a report removes and holds it: 200, the uploader sees a rejection, readers nothing', T, async () => {
    const { app } = await start();
    const a = await registered(app, 'Suspected Author');
    const b = await registered(app, 'Suspicion Reporter');
    const admin = await bearerFor(ADMIN);
    const media = imageId((await upload(app, a.header, 'post')).body);
    const created = z.object({ id: z.guid() }).parse(JSON.parse((await json(app, a.header, 'POST', '/api/posts', { body: 'חשד', audience: 'everyone', imageIds: [media] })).body));
    await jobSets(media, 'passed');
    expect((await json(app, b.header, 'POST', '/api/reports', { targetKind: 'post', targetId: created.id, reason: 'spam' })).statusCode).toBeLessThan(300);
    expect((await json(app, admin, 'POST', `/api/admin/media/${media}/removal`, { suspected: true })).statusCode).toBe(200);
    const imagesFor = async (header: string) =>
      z.object({ images: z.array(z.object({ id: z.guid(), state: z.string() })).optional() }).parse(JSON.parse((await json(app, header, 'GET', `/api/posts/${created.id}`)).body)).images ?? [];
    expect(await imagesFor(b.header), 'gone for readers').toEqual([]);
    expect((await imagesFor(a.header)).map((image) => image.state), 'the plain rejection for the uploader').toEqual(['rejected']);
    expect((await json(app, admin, 'POST', `/api/admin/media/${media}/removal`, { suspected: true })).statusCode, 'already removed').toBe(404);
  });

  it('a dismissed report is no ground for removal; a report handled with action taken is (no time limit)', T, async () => {
    const { app } = await start();
    const a = await registered(app, 'Twice Reported');
    const b = await registered(app, 'First Reporter');
    const c = await registered(app, 'Second Reporter');
    const admin = await bearerFor(ADMIN);
    const media = imageId((await upload(app, a.header, 'post')).body);
    const created = z.object({ id: z.guid() }).parse(JSON.parse((await json(app, a.header, 'POST', '/api/posts', { body: 'נדחה', audience: 'everyone', imageIds: [media] })).body));
    await jobSets(media, 'passed');
    const handle = (resolution: 'dismissed' | 'action_taken') =>
      json(app, admin, 'POST', '/api/admin/reports/handle', { targetKind: 'post', targetId: created.id, resolution });
    expect((await json(app, b.header, 'POST', '/api/reports', { targetKind: 'post', targetId: created.id, reason: 'spam' })).statusCode).toBeLessThan(300);
    expect((await handle('dismissed')).statusCode).toBe(200);
    expect((await json(app, admin, 'POST', `/api/admin/media/${media}/removal`, { suspected: false })).statusCode, 'only a dismissed report').toBe(404);
    const detail = z
      .object({ reports: z.array(z.object({ resolution: z.string().nullable() })) })
      .parse(JSON.parse((await json(app, admin, 'GET', `/api/admin/reports/post/${created.id}`)).body));
    expect(detail.reports.map((report) => report.resolution)).toEqual(['dismissed']);
    expect((await json(app, c.header, 'POST', '/api/reports', { targetKind: 'post', targetId: created.id, reason: 'spam' })).statusCode).toBeLessThan(300);
    expect((await handle('action_taken')).statusCode).toBe(200);
    expect((await json(app, admin, 'POST', `/api/admin/media/${media}/removal`, { suspected: false })).statusCode, 'a report handled with action taken').toBe(200);
  });
});

describe('[F14.3-b AC-162 NFR-MEDIA-001 Afik 21.10] the upload block list, with the job\'s own SQL', () => {
  it('[AC-162] a suspected image\'s hash is listed, a copy is held; "not abuse" takes the hash off the list and the job never puts it back', T, async () => {
    const { app } = await start();
    const a = await registered(app, 'Listed Source');
    const b = await registered(app, 'Matched Upload');
    const admin = await bearerFor(ADMIN);
    // a random hash per run, and one two bits away (a re-encoded copy)
    const hash = BigInt.asIntN(64, (BigInt(Math.floor(Math.random() * 2 ** 31)) << 32n) | BigInt(Math.floor(Math.random() * 2 ** 31)));
    const near = (hash ^ 5n).toString();
    const source = imageId((await upload(app, a.header, 'profile')).body);
    await jobSets(source, 'queued');
    expect((await json(app, admin, 'POST', `/api/admin/media/${source}/decision`, { decision: 'suspected', isChild: false })).statusCode).toBe(200);
    await asJob(async (blockList) => {
      await blockList.recordFingerprint(source, hash.toString());
      expect((await blockList.suspectedToList(1000)).map((row) => row.id)).toContain(source);
      expect(await blockList.addToList(source), 'the staff suspicion\'s hash joins the list').toBe(true);
    });
    const copy = imageId((await upload(app, b.header, 'profile')).body);
    await asJob(async (blockList, tx) => {
      await blockList.recordFingerprint(copy, near);
      expect(await blockList.matchesBlockList(copy), 'within 6 bits').toBe(true);
      // markMatch's two statements (it opens its own transaction on the job's connection)
      await tx`insert into nestly.media_reviews (media_id, queue_reason, is_suspected) values (${copy}::uuid, 'hash_match', true)`;
      await tx`update nestly.media_assets set status = 'rejected', is_held = true where id = ${copy}::uuid and status = 'pending'`;
    });
    const queue = z.object({ items: z.array(z.object({ id: z.guid(), queueReason: z.string() })) }).parse(JSON.parse((await json(app, admin, 'GET', '/api/admin/media-queue')).body));
    expect(queue.items.find((item) => item.id === copy), 'the match is a staff queue item').toMatchObject({ queueReason: 'hash_match' });
    expect((await json(app, b.header, 'POST', `/api/admin/media/${copy}/match`, { decision: 'not_abuse' })).statusCode, 'a user decides nothing').toBe(404);
    expect((await json(app, admin, 'POST', `/api/admin/media/${copy}/match`, { decision: 'maybe' })).statusCode).toBe(400);
    expect((await json(app, admin, 'POST', `/api/admin/media/${copy}/match`, { decision: 'not_abuse' })).statusCode).toBe(200);
    expect((await json(app, admin, 'POST', `/api/admin/media/${copy}/match`, { decision: 'confirmed' })).statusCode, 'decided once').toBe(404);
    const again = imageId((await upload(app, b.header, 'profile')).body);
    await asJob(async (blockList) => {
      expect((await blockList.suspectedToList(1000)).map((row) => row.id), 'the source stays suspected, but its hash is not listed again').not.toContain(source);
      expect(await blockList.addToList(source)).toBe(false);
      await blockList.recordFingerprint(again, near);
      expect(await blockList.matchesBlockList(again), 'the same picture uploaded again is not blocked').toBe(false);
    });
  });
});
