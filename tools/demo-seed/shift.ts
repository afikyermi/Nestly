// The time shift of the demo content (docs/lecturer-demo-plan-HE.md §3, Afik 15.10: days and hours, moved after creation). The product
// stamps every row with the time it was written, so right after the seed everything is "a minute ago". This builds the UPDATEs that move
// each demo row back to the age the content gives it ("ageHours" before the anchor), matched by its owner and its own text: a statement
// only ever names rows whose owner is one of the demo accounts' ids (the first parameter of every statement). Stories are never moved
// (they expire 24 hours after they are written, FR-FEED-008) and tracker events already carry their own times. Pure: no database here.
import type { Content, Post } from './content.ts';

export interface Statement {
  table: string;
  /** What the statement moves (keys only), for the log. */
  label: string;
  text: string;
  params: string[];
}

/** Every (table, column) a statement reads or writes; the CLI checks they all exist before it changes anything. */
export const SHIFT_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  users: ['id', 'created_at'],
  regular_profiles: ['user_id', 'created_at'],
  professional_profiles: ['user_id', 'created_at'],
  friendships: ['requester_id', 'addressee_id', 'created_at', 'requested_at', 'responded_at'],
  professional_follows: ['follower_id', 'professional_id', 'created_at'],
  groups: ['id', 'name', 'created_by', 'created_at', 'updated_at'],
  group_members: ['group_id', 'user_id', 'created_at'],
  posts: ['id', 'author_id', 'body', 'is_share', 'created_at'],
  post_authors: ['post_id', 'author_id'],
  comments: ['id', 'post_id', 'author_id', 'is_by_post_author', 'body', 'created_at'],
  reactions: ['id', 'post_id', 'comment_id', 'created_at'],
  reaction_owners: ['reaction_id', 'user_id'],
  professional_articles: ['author_id', 'title', 'created_at', 'updated_at'],
  marketplace_listings: ['owner_id', 'title', 'status', 'created_at', 'updated_at', 'expires_at', 'sold_at'],
  outreach_requests: ['professional_id', 'post_id', 'created_at', 'responded_at'],
  chat_requests: ['requester_id', 'target_id', 'created_at', 'responded_at'],
  conversations: ['id', 'user_a', 'user_b', 'created_at'],
  messages: ['conversation_id', 'sender_id', 'body', 'created_at'],
  professional_reviews: ['reviewer_id', 'professional_id', 'created_at'],
  support_requests: ['id', 'user_id', 'topic', 'created_at', 'updated_at'],
  support_messages: ['support_request_id', 'created_at'],
  reports: ['reporter_id', 'post_id', 'comment_id', 'reported_user_id', 'created_at'],
};

const HOUR_MS = 60 * 60 * 1000;

/** A small, fixed jitter (0..span minutes) per text, so rows written in one second do not all land on the same minute. */
function jitterMinutes(seed: string, span: number): number {
  let h = 7;
  for (const ch of seed) h = (h * 33 + (ch.codePointAt(0) ?? 0)) % 100003;
  return h % span;
}

export function at(anchor: Date, ageHours: number, seed = ''): string {
  return new Date(anchor.getTime() - ageHours * HOUR_MS - jitterMinutes(seed, 40) * 60 * 1000).toISOString();
}

/** The id of a content post, as SQL over its author (named, or through post_authors when anonymous) and its exact text. */
function postIdSql(post: Post, authorParam: string, bodyParam: string): string {
  return post.anonymous === true
    ? `(select p.id from nestly.posts p join nestly.post_authors a on a.post_id = p.id where a.author_id = ${authorParam} and p.body = ${bodyParam} limit 1)`
    : `(select id from nestly.posts where author_id = ${authorParam} and body = ${bodyParam} and not is_share limit 1)`;
}

export function buildShift(content: Content, ids: ReadonlyMap<string, string>, anchor: Date): Statement[] {
  const out: Statement[] = [];
  const id = (persona: string): string | undefined => ids.get(persona);
  const add = (table: string, label: string, owner: string | undefined, text: string, ...rest: string[]) => {
    if (owner !== undefined) out.push({ table, label, text, params: [owner, ...rest] });
  };
  const allIds = [...ids.values()];

  for (const p of [...content.regulars, ...content.professionals]) {
    const t = at(anchor, p.joinedDaysAgo * 24, p.key);
    add('users', `joined ${p.key}`, id(p.key), 'update nestly.users set created_at = $2 where id = $1', t);
    const profile = content.regulars.some((r) => r.key === p.key) ? 'regular_profiles' : 'professional_profiles';
    add(profile, `profile ${p.key}`, id(p.key), `update nestly.${profile} set created_at = $2 where user_id = $1`, t);
  }
  for (const f of content.friendships) {
    const to = id(f.to);
    if (to === undefined) continue;
    add('friendships', `friendship ${f.from}-${f.to}`, id(f.from),
      'update nestly.friendships set created_at = $3, requested_at = $3, responded_at = case when responded_at is null then null else $4::timestamptz end where requester_id = $1 and addressee_id = $2',
      to, at(anchor, f.ageHours, f.from + f.to), at(anchor, Math.max(f.ageHours - 3, 0), f.to));
  }
  for (const f of content.follows) {
    const pro = id(f.professional);
    if (pro === undefined) continue;
    add('professional_follows', `follow ${f.follower}-${f.professional}`, id(f.follower),
      'update nestly.professional_follows set created_at = $3 where follower_id = $1 and professional_id = $2', pro, at(anchor, f.ageHours, f.follower));
  }
  for (const g of content.groups) {
    const groupSql = '(select id from nestly.groups where created_by = $1 and name = $2 limit 1)';
    add('groups', `group ${g.key}`, id(g.owner), 'update nestly.groups set created_at = $3, updated_at = $3 where created_by = $1 and name = $2', g.name, at(anchor, g.ageHours, g.key));
    add('group_members', `group ${g.key} owner`, id(g.owner), `update nestly.group_members set created_at = $3 where group_id = ${groupSql} and user_id = $1`, g.name, at(anchor, g.ageHours, g.key));
    for (const m of g.members) {
      const member = id(m.user);
      if (member === undefined) continue;
      add('group_members', `group ${g.key} member ${m.user}`, id(g.owner),
        `update nestly.group_members set created_at = $4 where group_id = ${groupSql} and user_id = $3`, g.name, member, at(anchor, m.ageHours, m.user));
    }
  }
  for (const p of content.posts) {
    const author = id(p.author);
    if (author === undefined) continue;
    const when = at(anchor, p.ageHours, p.key);
    if (p.anonymous === true) {
      add('posts', `post ${p.key}`, author,
        'update nestly.posts set created_at = $3 where id in (select p.id from nestly.posts p join nestly.post_authors a on a.post_id = p.id where a.author_id = $1 and p.body = $2)', p.body, when);
    } else {
      add('posts', `post ${p.key}`, author, 'update nestly.posts set created_at = $3 where author_id = $1 and body = $2 and not is_share', p.body, when);
    }
    for (const c of p.comments) {
      const commenter = id(c.author);
      const anonymousAuthor = p.anonymous === true && c.author === p.author;
      // $1 the commenter, $2 the post's author, $3 the post's text, $4 the comment's text
      const who = anonymousAuthor ? '(author_id = $1 or (author_id is null and is_by_post_author))' : 'author_id = $1';
      add('comments', `comment ${c.key}`, commenter,
        `update nestly.comments set created_at = $5 where ${who} and body = $4 and post_id = ${postIdSql(p, '$2', '$3')}`, author, p.body, c.body, at(anchor, c.ageHours, c.key));
    }
    for (const s of p.shares ?? []) {
      if (s.text === undefined) continue;
      add('posts', `share ${p.key} by ${s.by}`, id(s.by), 'update nestly.posts set created_at = $3 where author_id = $1 and is_share and body = $2', s.text, at(anchor, s.ageHours, s.by));
    }
    for (const r of p.reports ?? []) {
      add('reports', `report ${p.key} by ${r.by}`, id(r.by),
        `update nestly.reports set created_at = $4 where reporter_id = $1 and post_id = ${postIdSql(p, '$2', '$3')}`, author, p.body, at(anchor, r.ageHours ?? 24, r.by));
    }
    for (const c of p.comments) {
      const commenter = id(c.author);
      if (commenter === undefined) continue;
      for (const r of c.reports ?? []) {
        add('reports', `report ${c.key} by ${r.by}`, id(r.by),
          'update nestly.reports set created_at = $4 where reporter_id = $1 and comment_id in (select id from nestly.comments where author_id = $2 and body = $3)', commenter, c.body, at(anchor, r.ageHours ?? 24, r.by));
      }
    }
  }
  if (allIds.length > 0) {
    // A like lands a little after what it likes (20 minutes to two days), never after the anchor. Only demo users' likes.
    out.push({
      table: 'reactions',
      label: 'likes of the demo users',
      text: `update nestly.reactions r set created_at = least($2::timestamptz, coalesce((select created_at from nestly.posts where id = r.post_id), (select created_at from nestly.comments where id = r.comment_id), r.created_at) + make_interval(mins => (20 + mod(abs(hashtext(r.id::text)::bigint), 2860))::int)) where r.id in (select reaction_id from nestly.reaction_owners where user_id = any($1::uuid[]))`,
      params: [`{${allIds.join(',')}}`, anchor.toISOString()],
    });
  }
  for (const a of content.articles) {
    add('professional_articles', `article ${a.key}`, id(a.author), 'update nestly.professional_articles set created_at = $3, updated_at = $3 where author_id = $1 and title = $2', a.title, at(anchor, a.ageHours, a.key));
  }
  for (const l of content.listings) {
    add('marketplace_listings', `listing ${l.key}`, id(l.owner),
      "update nestly.marketplace_listings set created_at = $3, updated_at = $3, expires_at = $3::timestamptz + interval '60 days', sold_at = case when status = 'sold' then $4::timestamptz else sold_at end where owner_id = $1 and title = $2",
      l.title, at(anchor, l.ageHours, l.key), at(anchor, Math.max(l.ageHours - 72, 1), l.key));
  }
  const thread = (a: string, b: string, messages: readonly { from: string; ageHours: number; text: string }[], label: string) => {
    const ia = id(a);
    const ib = id(b);
    if (ia === undefined || ib === undefined) return;
    for (const m of messages) {
      const sender = id(m.from);
      const other = m.from === a ? ib : ia;
      add('messages', `${label} message`, sender,
        'update nestly.messages set created_at = $4 where sender_id = $1 and body = $3 and conversation_id in (select id from nestly.conversations where (user_a = $1 and user_b = $2) or (user_a = $2 and user_b = $1))',
        other, m.text, at(anchor, m.ageHours, m.text));
    }
    add('conversations', `${label} conversation`, ia,
      "update nestly.conversations c set created_at = coalesce((select min(m.created_at) from nestly.messages m where m.conversation_id = c.id) - interval '1 minute', c.created_at) where (user_a = $1 and user_b = $2) or (user_a = $2 and user_b = $1)",
      ib);
  };
  for (const c of content.contacts) {
    const owner = content.listings.find((l) => l.key === c.listing)?.owner;
    if (owner !== undefined) thread(c.from, owner, [{ from: c.from, ageHours: c.ageHours, text: c.text }, ...c.replies], `contact ${c.listing}`);
  }
  for (const h of content.helpOffers) {
    const post = content.posts.find((p) => p.key === h.post);
    const author = post === undefined ? undefined : id(post.author);
    if (post === undefined || author === undefined) continue;
    add('outreach_requests', `offer ${h.professional} on ${h.post}`, id(h.professional),
      `update nestly.outreach_requests set created_at = $4, responded_at = case when responded_at is null then null else $5::timestamptz end where professional_id = $1 and post_id = ${postIdSql(post, '$2', '$3')}`,
      author, post.body, at(anchor, h.ageHours, h.post), at(anchor, h.acceptAgeHours ?? h.ageHours, h.post));
    thread(post.author, h.professional, h.conversation ?? [], `offer ${h.post}`);
    const proId = id(h.professional);
    if (h.review !== undefined && proId !== undefined) add('professional_reviews', `review ${post.author}-${h.professional}`, author, 'update nestly.professional_reviews set created_at = $3 where reviewer_id = $1 and professional_id = $2', proId, at(anchor, h.review.ageHours, h.post));
  }
  for (const c of content.chats) {
    const [first] = c.messages;
    const to = id(c.to);
    if (first === undefined || to === undefined) continue;
    add('chat_requests', `chat request ${c.from}-${c.to}`, id(c.from),
      'update nestly.chat_requests set created_at = $3, responded_at = case when responded_at is null then null else $4::timestamptz end where requester_id = $1 and target_id = $2',
      to, at(anchor, first.ageHours, first.text), at(anchor, c.acceptAgeHours ?? first.ageHours, c.to));
    thread(c.from, c.to, c.messages, `chat ${c.from}-${c.to}`);
    if (c.review !== undefined) add('professional_reviews', `review ${c.from}-${c.to}`, id(c.from), 'update nestly.professional_reviews set created_at = $3 where reviewer_id = $1 and professional_id = $2', to, at(anchor, c.review.ageHours, c.to));
  }
  content.support.forEach((s, i) => {
    const when = at(anchor, 20 + 26 * i, s.persona);
    add('support_requests', `support ${s.persona}`, id(s.persona), 'update nestly.support_requests set created_at = $3, updated_at = $3 where user_id = $1 and topic = $2', s.topic, when);
    add('support_messages', `support ${s.persona} message`, id(s.persona),
      'update nestly.support_messages set created_at = $3 where support_request_id in (select id from nestly.support_requests where user_id = $1 and topic = $2) and created_at > $3::timestamptz', s.topic, when);
  });
  for (const r of content.userReports) {
    const target = id(r.target);
    if (target !== undefined) add('reports', `report user ${r.target} by ${r.by}`, id(r.by), 'update nestly.reports set created_at = $3 where reporter_id = $1 and reported_user_id = $2', target, at(anchor, 30, r.by));
  }
  return out;
}

/** The tables the statements touch, in first-use order (their user triggers are switched off for the transaction). */
export function touchedTables(statements: readonly Statement[]): string[] {
  return [...new Set(statements.map((s) => s.table))];
}
