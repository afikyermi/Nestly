// The content steps: Groups, articles, posts, comments, likes, shares, listings, help offers and reports. Each looks for what it would
// create first (through the product's own reads, as the acting user) and skips it when found, so a second run adds nothing twice.
import { articleBody, groupBody, postBody } from './bodies.ts';
import type { Comment, Post } from './content.ts';
import { illustrationPng } from './illustration.ts';
import type { Step } from './plan.ts';
import { type Ctx, expectStatus, field, list, type Handler, StepError, stringField } from './runner.ts';

type StepOf<K extends Step['kind']> = Extract<Step, { kind: K }>;

const enc = encodeURIComponent;
const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();

function post(ctx: Ctx, key: string): Post {
  const found = ctx.content.posts.find((p) => p.key === key);
  if (found === undefined) throw new StepError(`unknown post ${key}`);
  return found;
}

/**
 * The search text for a body: the first 40 characters of its first line. The product matches the query as a substring of the stored
 * text (where a line break is still a line break), so the query must not cross one.
 */
export function searchText(body: string): string {
  const firstLine = body.trim().split('\n')[0] ?? '';
  return [...firstLine.replace(/[ \t]+/g, ' ')].slice(0, 40).join('').trim();
}

/** Whether a search snippet is the start of `body` (a snippet may be cut and end with an ellipsis). */
export function snippetMatches(snippet: string, body: string): boolean {
  const core = normalize(snippet).replace(/(…|\.\.\.)$/u, '').trim();
  const full = normalize(body);
  return core.length > 0 && (full.startsWith(core) || core.startsWith(full));
}

/** Finds `body` written by `actor` through Search (the product has no "my posts" list); null when there is none. */
async function searchOwn(ctx: Ctx, actor: string, body: string, anonymous: boolean): Promise<string | null> {
  const result = await ctx.call(actor, 'POST', '/api/search', { q: searchText(body), type: 'posts' });
  // A failed search is a failure, never "not there": reading it as absent would write the post a second time.
  if (result.status !== 200) throw new StepError(`search: HTTP ${result.status}`);
  const me = ctx.userId(actor);
  for (const item of list(result.body, 'posts')) {
    const authorId = stringField(item, 'authorId');
    const mine = anonymous ? authorId === null : authorId?.toLowerCase() === me;
    const snippet = stringField(item, 'snippet');
    const id = stringField(item, 'id');
    if (mine && snippet !== null && id !== null && snippetMatches(snippet, body)) return id.toLowerCase();
  }
  return null;
}

export async function postId(ctx: Ctx, key: string): Promise<string> {
  const known = ctx.posts.get(key);
  if (known !== undefined) return known;
  const p = post(ctx, key);
  const found = await searchOwn(ctx, p.author, p.body, p.anonymous === true);
  if (found === null) throw new StepError(`post ${key} was not found`);
  ctx.posts.set(key, found);
  return found;
}

export async function groupId(ctx: Ctx, key: string): Promise<string> {
  const known = ctx.groups.get(key);
  if (known !== undefined) return known;
  const g = ctx.content.groups.find((x) => x.key === key);
  if (g === undefined) throw new StepError(`unknown group ${key}`);
  const result = await ctx.call(g.owner, 'GET', '/api/groups?scope=mine');
  const found = list(expectStatus(result, [200], 'my groups'), 'groups').find((x) => stringField(x, 'name') === g.name);
  const id = stringField(found, 'id');
  if (id === null) throw new StepError(`group ${key} was not found`);
  ctx.groups.set(key, id);
  return id;
}

export async function upload(ctx: Ctx, actor: string, kind: string, motif: string): Promise<string> {
  const result = await ctx.call(actor, 'POST', `/api/media?kind=${kind}`, illustrationPng(motif), 'image/png');
  const id = stringField(expectStatus(result, [201], 'image upload'), 'id');
  if (id === null) throw new StepError('image upload: no id');
  return id;
}

const createGroup: Handler = async (ctx, s) => {
  const step: StepOf<'group'> = s.kind === 'group' ? s : never(s);
  const g = ctx.content.groups.find((x) => x.key === step.group);
  if (g === undefined) throw new StepError(`unknown group ${step.group}`);
  try {
    await groupId(ctx, g.key);
    return 'skipped';
  } catch {
    // not there yet
  }
  const id = stringField(expectStatus(await ctx.call(step.actor, 'POST', '/api/groups', groupBody(g)), [200, 201], 'create group'), 'id');
  if (id === null) throw new StepError('create group: no id');
  ctx.groups.set(g.key, id);
  return 'done';
};

const joinGroup: Handler = async (ctx, s) => {
  const step: StepOf<'group-join'> = s.kind === 'group-join' ? s : never(s);
  const id = await groupId(ctx, step.group);
  const state = stringField(expectStatus(await ctx.call(step.actor, 'GET', `/api/groups/${enc(id)}`), [200], 'group'), 'state');
  if (state === 'member' || state === 'requested') return 'skipped';
  expectStatus(await ctx.call(step.actor, 'PUT', `/api/groups/${enc(id)}/membership`), [200, 201], 'join group');
  return 'done';
};

const approveMember: Handler = async (ctx, s) => {
  const step: StepOf<'group-approve'> = s.kind === 'group-approve' ? s : never(s);
  const id = await groupId(ctx, step.group);
  const member = ctx.userId(step.member);
  const people = list(expectStatus(await ctx.call(step.actor, 'GET', `/api/groups/${enc(id)}/requests`), [200], 'join requests'), 'people');
  if (!people.some((p) => stringField(p, 'userId')?.toLowerCase() === member)) return 'skipped';
  expectStatus(await ctx.call(step.actor, 'PUT', `/api/groups/${enc(id)}/requests/${enc(member)}`, { decision: 'approve' }), [200, 204], 'approve');
  return 'done';
};

const setRole: Handler = async (ctx, s) => {
  const step: StepOf<'group-role'> = s.kind === 'group-role' ? s : never(s);
  const id = await groupId(ctx, step.group);
  const member = ctx.userId(step.member);
  const members = list(expectStatus(await ctx.call(step.actor, 'GET', `/api/groups/${enc(id)}/members`), [200], 'members'), 'members');
  const row = members.find((m) => stringField(m, 'userId')?.toLowerCase() === member);
  if (row === undefined) throw new StepError(`${step.member} is not a member of ${step.group}`);
  if (stringField(row, 'role') === step.role) return 'skipped';
  expectStatus(await ctx.call(step.actor, 'PATCH', `/api/groups/${enc(id)}/members/${enc(member)}`, { role: step.role }), [200], 'set role');
  return 'done';
};

const createArticle: Handler = async (ctx, s) => {
  const step: StepOf<'article'> = s.kind === 'article' ? s : never(s);
  const a = ctx.content.articles.find((x) => x.key === step.article);
  if (a === undefined) throw new StepError(`unknown article ${step.article}`);
  const me = ctx.userId(step.actor);
  const page = expectStatus(await ctx.call(step.actor, 'GET', `/api/professionals/${enc(me)}`), [200], 'own page');
  if (list(page, 'articles').some((x) => stringField(x, 'title') === a.title)) return 'skipped';
  expectStatus(await ctx.call(step.actor, 'POST', '/api/professional/articles', articleBody(a)), [200, 201], 'article');
  return 'done';
};

const createPost: Handler = async (ctx, s) => {
  const step: StepOf<'post'> = s.kind === 'post' ? s : never(s);
  const p = post(ctx, step.post);
  const found = await searchOwn(ctx, p.author, p.body, p.anonymous === true);
  if (found !== null) {
    ctx.posts.set(p.key, found);
    return 'skipped';
  }
  const group = p.group === undefined ? undefined : await groupId(ctx, p.group);
  const id = stringField(expectStatus(await ctx.call(step.actor, 'POST', '/api/posts', postBody(p, group)), [201], 'post'), 'id')?.toLowerCase() ?? null;
  if (id === null) throw new StepError('post: no id');
  ctx.posts.set(p.key, id);
  return 'done';
};

/** The actor's own comments on a post (and their replies), by body. */
async function ownComments(ctx: Ctx, actor: string, id: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const take = (c: unknown) => {
    const body = stringField(c, 'body');
    const cid = stringField(c, 'id');
    if (field(c, 'isMine') === true && body !== null && cid !== null) found.set(normalize(body), cid);
  };
  let cursor: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const path: string = `/api/posts/${enc(id)}/comments${cursor === null ? '' : `?cursor=${enc(cursor)}`}`;
    const body = expectStatus(await ctx.call(actor, 'GET', path), [200], 'comments');
    for (const item of list(body, 'items')) {
      take(item);
      for (const reply of list(item, 'replies')) take(reply);
      const replyCount = field(item, 'replyCount');
      const itemId = stringField(item, 'id');
      if (typeof replyCount === 'number' && replyCount > list(item, 'replies').length && itemId !== null) {
        const replies = await ctx.call(actor, 'GET', `/api/comments/${enc(itemId)}/replies`);
        if (replies.status === 200) for (const reply of list(replies.body, 'items')) take(reply);
      }
    }
    cursor = stringField(body, 'nextCursor');
    if (cursor === null) break;
  }
  return found;
}

function comment(p: Post, key: string): Comment {
  const found = p.comments.find((c) => c.key === key);
  if (found === undefined) throw new StepError(`unknown comment ${key}`);
  return found;
}

export async function commentId(ctx: Ctx, postKey: string, key: string): Promise<string> {
  const known = ctx.comments.get(key);
  if (known !== undefined) return known;
  const c = comment(post(ctx, postKey), key);
  const found = (await ownComments(ctx, c.author, await postId(ctx, postKey))).get(normalize(c.body));
  if (found === undefined) throw new StepError(`comment ${key} was not found`);
  ctx.comments.set(key, found);
  return found;
}

const createComment: Handler = async (ctx, s) => {
  const step: StepOf<'comment'> = s.kind === 'comment' ? s : never(s);
  const c = comment(post(ctx, step.post), step.comment);
  const id = await postId(ctx, step.post);
  const existing = (await ownComments(ctx, step.actor, id)).get(normalize(c.body));
  if (existing !== undefined) {
    ctx.comments.set(c.key, existing);
    return 'skipped';
  }
  const parentId = c.replyTo === undefined ? undefined : await commentId(ctx, step.post, c.replyTo);
  const body = parentId === undefined ? { body: c.body } : { body: c.body, parentId };
  const created = stringField(expectStatus(await ctx.call(step.actor, 'POST', `/api/posts/${enc(id)}/comments`, body), [201], 'comment'), 'comment', 'id');
  if (created === null) throw new StepError('comment: no id');
  ctx.comments.set(c.key, created);
  return 'done';
};

const like: Handler = async (ctx, s) => {
  const step: StepOf<'like'> = s.kind === 'like' ? s : never(s);
  const path =
    step.target.kind === 'post'
      ? `/api/posts/${enc(await postId(ctx, step.target.post))}/like`
      : `/api/comments/${enc(await commentId(ctx, step.target.post, step.target.comment))}/like`;
  expectStatus(await ctx.call(step.actor, 'PUT', path), [200, 201, 204, 409], 'like');
  return 'done';
};

const share: Handler = async (ctx, s) => {
  const step: StepOf<'share'> = s.kind === 'share' ? s : never(s);
  const sh = post(ctx, step.post).shares?.[step.index];
  if (sh === undefined) throw new StepError('unknown share');
  if (sh.text !== undefined && (await searchOwn(ctx, step.actor, sh.text, false)) !== null) return 'skipped';
  const id = await postId(ctx, step.post);
  expectStatus(await ctx.call(step.actor, 'POST', `/api/posts/${enc(id)}/shares`, { text: sh.text ?? null, audience: sh.audience }), [201], 'share');
  return 'done';
};

function never(step: Step): never {
  throw new StepError(`wrong handler for ${step.kind}`);
}

export const contentHandlers: Partial<Record<Step['kind'], Handler>> = {
  group: createGroup,
  'group-join': joinGroup,
  'group-approve': approveMember,
  'group-role': setRole,
  article: createArticle,
  post: createPost,
  comment: createComment,
  like,
  share,
};

