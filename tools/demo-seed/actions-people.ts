// The people steps: privacy, profile picture, friendships, follows, chat, reviews, trackers, cycle, support and Stories. Same rule as
// every step: look first through the product's own reads, create only what is missing.
import { upload } from './actions-content.ts';
import { cycleBody, isoDay, trackerBody } from './bodies.ts';
import { knownMotif } from './illustration.ts';
import type { Step } from './plan.ts';
import { type Ctx, expectStatus, field, list, type Handler, StepError, stringField } from './runner.ts';

type StepOf<K extends Step['kind']> = Extract<Step, { kind: K }>;
const enc = encodeURIComponent;

function wrong(step: Step): never {
  throw new StepError(`wrong handler for ${step.kind}`);
}

const sameId = (value: string | null, id: string): boolean => value !== null && value.toLowerCase() === id;

const privacy: Handler = async (ctx, s) => {
  const step: StepOf<'privacy'> = s.kind === 'privacy' ? s : wrong(s);
  const now = expectStatus(await ctx.call(step.actor, 'GET', '/api/privacy'), [200], 'privacy');
  if (stringField(now, 'profileVisibility') === step.visibility && field(now, 'isEmptyJourneySentenceShown') === true) return 'skipped';
  const body = { profileVisibility: step.visibility, isEmptyJourneySentenceShown: true, isChildBirthdayShared: field(now, 'isChildBirthdayShared') === true };
  expectStatus(await ctx.call(step.actor, 'PUT', '/api/privacy', body), [200], 'privacy');
  return 'done';
};

const avatar: Handler = async (ctx, s) => {
  const step: StepOf<'avatar'> = s.kind === 'avatar' ? s : wrong(s);
  if (!knownMotif(step.motif)) throw new StepError(`unknown motif ${step.motif}`);
  const current = expectStatus(await ctx.call(step.actor, 'GET', '/api/profile/photo'), [200], 'photo');
  if (field(current, 'photo') !== null && field(current, 'photo') !== undefined) return 'skipped';
  const mediaId = await upload(ctx, step.actor, 'profile', step.motif);
  expectStatus(await ctx.call(step.actor, 'PUT', '/api/profile/photo', { mediaId }), [200], 'set photo');
  return 'done';
};

async function friendLists(ctx: Ctx, actor: string): Promise<{ friends: string[]; sent: string[]; incoming: string[] }> {
  const body = expectStatus(await ctx.call(actor, 'GET', '/api/friends'), [200], 'friends');
  const ids = (name: string) => list(body, name).flatMap((x) => stringField(x, 'userId')?.toLowerCase() ?? []);
  return { friends: ids('friends'), sent: ids('sent'), incoming: ids('incoming') };
}

const friendRequest: Handler = async (ctx, s) => {
  const step: StepOf<'friend-request'> = s.kind === 'friend-request' ? s : wrong(s);
  const target = ctx.userId(step.target);
  const lists = await friendLists(ctx, step.actor);
  if ([...lists.friends, ...lists.sent, ...lists.incoming].includes(target)) return 'skipped';
  expectStatus(await ctx.call(step.actor, 'POST', '/api/friend-requests', { targetUserId: target }), [200, 201], 'friend request');
  return 'done';
};

const friendAccept: Handler = async (ctx, s) => {
  const step: StepOf<'friend-accept'> = s.kind === 'friend-accept' ? s : wrong(s);
  const requester = ctx.userId(step.requester);
  const lists = await friendLists(ctx, step.actor);
  if (lists.friends.includes(requester)) return 'skipped';
  if (!lists.incoming.includes(requester)) throw new StepError('no incoming request to accept');
  expectStatus(await ctx.call(step.actor, 'POST', `/api/friend-requests/${enc(requester)}/accept`), [200], 'accept friend');
  return 'done';
};

const follow: Handler = async (ctx, s) => {
  const step: StepOf<'follow'> = s.kind === 'follow' ? s : wrong(s);
  const pro = ctx.userId(step.professional);
  const page = expectStatus(await ctx.call(step.actor, 'GET', `/api/professionals/${enc(pro)}`), [200], 'professional page');
  if (field(page, 'isFollowing') === true) return 'skipped';
  expectStatus(await ctx.call(step.actor, 'PUT', `/api/professionals/${enc(pro)}/follow`), [200, 201, 204], 'follow');
  return 'done';
};

async function overview(ctx: Ctx, actor: string): Promise<unknown> {
  return expectStatus(await ctx.call(actor, 'GET', '/api/chat'), [200], 'chat');
}

function conversationWith(chat: unknown, other: string): string | null {
  const found = list(chat, 'conversations').find((c) => sameId(stringField(c, 'otherUserId'), other));
  return stringField(found, 'id');
}

const chatStart: Handler = async (ctx, s) => {
  const step: StepOf<'chat-start'> = s.kind === 'chat-start' ? s : wrong(s);
  const target = ctx.userId(step.target);
  const chat = await overview(ctx, step.actor);
  if (conversationWith(chat, target) !== null) return 'skipped';
  if (list(chat, 'outgoing').some((r) => sameId(stringField(r, 'userId'), target))) return 'skipped';
  expectStatus(await ctx.call(step.actor, 'POST', '/api/chat/start', { userId: target, text: step.text }), [200, 201], 'chat start');
  return 'done';
};

const chatAccept: Handler = async (ctx, s) => {
  const step: StepOf<'chat-accept'> = s.kind === 'chat-accept' ? s : wrong(s);
  const requester = ctx.userId(step.requester);
  const chat = await overview(ctx, step.actor);
  if (conversationWith(chat, requester) !== null) return 'skipped';
  const request = stringField(
    list(chat, 'incoming').find((r) => sameId(stringField(r, 'userId'), requester)),
    'id',
  );
  if (request === null) throw new StepError('no chat request to accept');
  expectStatus(await ctx.call(step.actor, 'POST', `/api/chat/requests/${enc(request)}/accept`), [200, 201], 'accept chat');
  return 'done';
};

const message: Handler = async (ctx, s) => {
  const step: StepOf<'message'> = s.kind === 'message' ? s : wrong(s);
  const id = conversationWith(await overview(ctx, step.actor), ctx.userId(step.other));
  if (id === null) throw new StepError(`no conversation with ${step.other}`);
  const thread = expectStatus(await ctx.call(step.actor, 'GET', `/api/chat/conversations/${enc(id)}`), [200], 'conversation');
  const text = step.text.trim();
  if (list(thread, 'messages').some((m) => field(m, 'mine') === true && stringField(m, 'text')?.trim() === text)) return 'skipped';
  expectStatus(await ctx.call(step.actor, 'POST', `/api/chat/conversations/${enc(id)}/messages`, { text: step.text }), [200, 201], 'message');
  return 'done';
};

const review: Handler = async (ctx, s) => {
  const step: StepOf<'review'> = s.kind === 'review' ? s : wrong(s);
  const pro = ctx.userId(step.professional);
  const page = expectStatus(await ctx.call(step.actor, 'GET', `/api/professionals/${enc(pro)}`), [200], 'professional page');
  if (field(page, 'myReview') !== null && field(page, 'myReview') !== undefined) return 'skipped';
  const result = await ctx.call(step.actor, 'POST', `/api/professionals/${enc(pro)}/reviews`, { rating: step.rating, text: step.text });
  if (result.status === 409) return 'skipped';
  expectStatus(result, [200, 201], 'review');
  return 'done';
};

const trackers: Handler = async (ctx, s) => {
  const step: StepOf<'trackers'> = s.kind === 'trackers' ? s : wrong(s);
  const journeys = expectStatus(await ctx.call(step.actor, 'GET', '/api/journeys'), [200], 'journeys');
  const childId = stringField(
    list(journeys, 'children').find((c) => stringField(c, 'name') === step.child),
    'id',
  );
  if (childId === null) throw new StepError(`no child named in ${step.actor}'s profile`);
  const [first] = step.events;
  if (first === undefined) return 'skipped';
  const from = isoDay(new Date(ctx.now.getTime() - 90 * 24 * 60 * 60 * 1000));
  const query = new URLSearchParams({ kind: first.kind, childId, from, to: isoDay(ctx.now) });
  const existing = await ctx.call(step.actor, 'GET', `/api/trackers/events?${query.toString()}`);
  if (existing.status === 200 && list(existing.body, 'events').length > 0) return 'skipped';
  for (const event of step.events) {
    expectStatus(await ctx.call(step.actor, 'POST', '/api/trackers/events', trackerBody(event, childId, new Date())), [200, 201], `tracker ${event.kind}`);
  }
  return 'done';
};

const cycle: Handler = async (ctx, s) => {
  const step: StepOf<'cycle'> = s.kind === 'cycle' ? s : wrong(s);
  const body = cycleBody(step.startDaysAgo, step.cycleLengthDays, ctx.now);
  const existing = expectStatus(await ctx.call(step.actor, 'GET', '/api/cycle'), [200], 'cycle');
  if (list(existing, 'entries').some((e) => stringField(e, 'startDate') === body.startDate)) return 'skipped';
  expectStatus(await ctx.call(step.actor, 'POST', '/api/cycle', body), [200, 201], 'cycle');
  return 'done';
};

const support: Handler = async (ctx, s) => {
  const step: StepOf<'support'> = s.kind === 'support' ? s : wrong(s);
  const mine = expectStatus(await ctx.call(step.actor, 'GET', '/api/support'), [200], 'support');
  if (list(mine, 'requests').some((r) => stringField(r, 'topic') === step.topic)) return 'skipped';
  expectStatus(await ctx.call(step.actor, 'POST', '/api/support', { topic: step.topic, text: step.text }), [200, 201], 'support');
  return 'done';
};

const story: Handler = async (ctx, s) => {
  const step: StepOf<'story'> = s.kind === 'story' ? s : wrong(s);
  const stories = expectStatus(await ctx.call(step.actor, 'GET', '/api/stories'), [200], 'stories');
  const mine = list(stories, 'groups').filter((g) => field(g, 'isMine') === true);
  if (mine.some((g) => list(g, 'items').some((i) => stringField(i, 'caption') === step.caption))) return 'skipped';
  const mediaId = await upload(ctx, step.actor, 'story', step.motif);
  expectStatus(await ctx.call(step.actor, 'POST', '/api/stories', { mediaId, caption: step.caption, audience: step.audience }), [201], 'story');
  return 'done';
};

export const peopleHandlers: Partial<Record<Step['kind'], Handler>> = {
  privacy,
  avatar,
  'friend-request': friendRequest,
  'friend-accept': friendAccept,
  follow,
  'chat-start': chatStart,
  'chat-accept': chatAccept,
  message,
  review,
  trackers,
  cycle,
  support,
  story,
};
