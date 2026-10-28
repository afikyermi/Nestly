// The demo seed as an ordered list of steps (pure: no network, no clock). Each step is one product action by one demo user, in an order
// where everything a step needs already exists: accounts, profiles, friendships and follows, Groups, articles, posts with their comments,
// likes and shares, listings, help offers and their conversations, chats, trackers, support, reports, promotions. Stories are a separate
// mode, run on the demo day itself (plan §3: a Story expires after 24 hours, FR-FEED-008).
import type { Comment, Content, Listing, Post, TrackerEvent } from './content.ts';

type Target = { kind: 'post'; post: string } | { kind: 'comment'; post: string; comment: string };

export type Step =
  | { kind: 'account'; actor: string }
  | { kind: 'privacy'; actor: string; visibility: 'open' | 'restricted' }
  | { kind: 'avatar'; actor: string; motif: string }
  | { kind: 'friend-request'; actor: string; target: string }
  | { kind: 'friend-accept'; actor: string; requester: string }
  | { kind: 'follow'; actor: string; professional: string }
  | { kind: 'group'; actor: string; group: string }
  | { kind: 'group-join'; actor: string; group: string }
  | { kind: 'group-approve'; actor: string; group: string; member: string }
  | { kind: 'group-role'; actor: string; group: string; member: string; role: 'admin' | 'moderator' }
  | { kind: 'article'; actor: string; article: string }
  | { kind: 'post'; actor: string; post: string }
  | { kind: 'comment'; actor: string; post: string; comment: string }
  | { kind: 'like'; actor: string; target: Target }
  | { kind: 'share'; actor: string; post: string; index: number }
  | { kind: 'listing'; actor: string; listing: string }
  | { kind: 'listing-sold'; actor: string; listing: string }
  | { kind: 'listing-contact'; actor: string; listing: string }
  | { kind: 'offer-help'; actor: string; post: string }
  | { kind: 'offer-accept'; actor: string; post: string; professional: string }
  | { kind: 'chat-start'; actor: string; target: string; text: string }
  | { kind: 'chat-accept'; actor: string; requester: string }
  | { kind: 'message'; actor: string; other: string; text: string }
  | { kind: 'review'; actor: string; professional: string; rating: number; text: string }
  | { kind: 'trackers'; actor: string; child: string; events: readonly TrackerEvent[] }
  | { kind: 'cycle'; actor: string; startDaysAgo: number; cycleLengthDays: number }
  | { kind: 'support'; actor: string; topic: string; text: string }
  | { kind: 'report'; actor: string; target: Target | { kind: 'user'; user: string }; reason: string; details?: string | undefined }
  | { kind: 'promotion'; actor: string; planKey: string; target: Content['promotions'][number]['target'] }
  | { kind: 'story'; actor: string; caption: string; audience: 'everyone' | 'friends'; motif: string };

export type Mode = 'seed' | 'stories';

const oldestFirst = <T extends { ageHours: number }>(items: readonly T[]): T[] => [...items].sort((a, b) => b.ageHours - a.ageHours);

function postSteps(post: Post): Step[] {
  const steps: Step[] = [{ kind: 'post', actor: post.author, post: post.key }];
  for (const c of oldestFirst<Comment>(post.comments)) steps.push({ kind: 'comment', actor: c.author, post: post.key, comment: c.key });
  for (const liker of post.likes) steps.push({ kind: 'like', actor: liker, target: { kind: 'post', post: post.key } });
  for (const c of post.comments) {
    for (const liker of c.likes ?? []) steps.push({ kind: 'like', actor: liker, target: { kind: 'comment', post: post.key, comment: c.key } });
  }
  (post.shares ?? []).forEach((s, index) => steps.push({ kind: 'share', actor: s.by, post: post.key, index }));
  return steps;
}

function listingSteps(listing: Listing): Step[] {
  const steps: Step[] = [{ kind: 'listing', actor: listing.owner, listing: listing.key }];
  if (listing.sold === true) steps.push({ kind: 'listing-sold', actor: listing.owner, listing: listing.key });
  return steps;
}

function reportSteps(content: Content): Step[] {
  const steps: Step[] = [];
  for (const p of content.posts) {
    for (const r of p.reports ?? []) steps.push({ kind: 'report', actor: r.by, target: { kind: 'post', post: p.key }, reason: r.reason, details: r.details });
    for (const c of p.comments) {
      for (const r of c.reports ?? []) {
        steps.push({ kind: 'report', actor: r.by, target: { kind: 'comment', post: p.key, comment: c.key }, reason: r.reason, details: r.details });
      }
    }
  }
  for (const r of content.userReports) steps.push({ kind: 'report', actor: r.by, target: { kind: 'user', user: r.target }, reason: r.reason, details: r.details });
  return steps;
}

export function buildPlan(content: Content, mode: Mode): Step[] {
  const personas = [...content.regulars, ...content.professionals];
  if (mode === 'stories') {
    const authors = [...new Set(content.stories.map((s) => s.author))];
    return [
      ...authors.map((actor): Step => ({ kind: 'account', actor })),
      ...content.stories.map((s): Step => ({ kind: 'story', actor: s.author, caption: s.caption, audience: s.audience, motif: s.image })),
    ];
  }
  const steps: Step[] = [];
  for (const p of personas) steps.push({ kind: 'account', actor: p.key });
  for (const r of content.regulars) steps.push({ kind: 'privacy', actor: r.key, visibility: r.profileVisibility });
  for (const p of personas) steps.push({ kind: 'avatar', actor: p.key, motif: p.avatar });

  for (const f of oldestFirst(content.friendships)) {
    steps.push({ kind: 'friend-request', actor: f.from, target: f.to });
    if (f.accept) steps.push({ kind: 'friend-accept', actor: f.to, requester: f.from });
  }
  for (const f of oldestFirst(content.follows)) steps.push({ kind: 'follow', actor: f.follower, professional: f.professional });

  for (const g of oldestFirst(content.groups)) {
    steps.push({ kind: 'group', actor: g.owner, group: g.key });
    for (const m of oldestFirst(g.members)) {
      steps.push({ kind: 'group-join', actor: m.user, group: g.key });
      if (g.privacy === 'private') steps.push({ kind: 'group-approve', actor: g.owner, group: g.key, member: m.user });
      if (m.role !== undefined) steps.push({ kind: 'group-role', actor: g.owner, group: g.key, member: m.user, role: m.role });
    }
  }

  for (const a of oldestFirst(content.articles)) steps.push({ kind: 'article', actor: a.author, article: a.key });
  for (const p of oldestFirst(content.posts)) steps.push(...postSteps(p));
  for (const l of oldestFirst(content.listings)) steps.push(...listingSteps(l));
  for (const c of oldestFirst(content.contacts)) {
    steps.push({ kind: 'listing-contact', actor: c.from, listing: c.listing });
    const owner = content.listings.find((l) => l.key === c.listing)?.owner ?? '';
    for (const m of c.replies) steps.push({ kind: 'message', actor: m.from, other: m.from === owner ? c.from : owner, text: m.text });
  }

  for (const h of oldestFirst(content.helpOffers)) {
    const author = content.posts.find((p) => p.key === h.post)?.author ?? '';
    steps.push({ kind: 'offer-help', actor: h.professional, post: h.post });
    if (!h.accept) continue;
    steps.push({ kind: 'offer-accept', actor: author, post: h.post, professional: h.professional });
    for (const m of h.conversation ?? []) steps.push({ kind: 'message', actor: m.from, other: m.from === author ? h.professional : author, text: m.text });
    if (h.review !== undefined) steps.push({ kind: 'review', actor: author, professional: h.professional, rating: h.review.rating, text: h.review.text });
  }

  for (const c of content.chats) {
    const [first, ...rest] = c.messages;
    if (first === undefined) continue;
    steps.push({ kind: 'chat-start', actor: c.from, target: c.to, text: first.text });
    if (c.pending === true) continue;
    steps.push({ kind: 'chat-accept', actor: c.to, requester: c.from });
    for (const m of rest) steps.push({ kind: 'message', actor: m.from, other: m.from === c.from ? c.to : c.from, text: m.text });
    if (c.review !== undefined) steps.push({ kind: 'review', actor: c.from, professional: c.to, rating: c.review.rating, text: c.review.text });
  }

  for (const t of content.trackers) steps.push({ kind: 'trackers', actor: t.persona, child: t.child, events: t.events });
  for (const c of [...content.cycles].sort((a, b) => b.startDaysAgo - a.startDaysAgo)) {
    steps.push({ kind: 'cycle', actor: c.persona, startDaysAgo: c.startDaysAgo, cycleLengthDays: c.cycleLengthDays });
  }
  for (const s of content.support) steps.push({ kind: 'support', actor: s.persona, topic: s.topic, text: s.text });
  steps.push(...reportSteps(content));
  for (const p of content.promotions) steps.push({ kind: 'promotion', actor: p.owner, planKey: p.planKey, target: p.target });
  return steps;
}

/**
 * Every persona a step touches: its actor, the persona it acts on, and the owner of the content it acts on (a post's author, a reply's
 * parent author, a Group's owner, a listing's owner).
 */
export function personasOf(step: Step, content: Content): string[] {
  const commentAuthor = (post: string, key: string | undefined) => content.posts.find((p) => p.key === post)?.comments.find((c) => c.key === key)?.author;
  const groupOwner = (key: string | undefined) => content.groups.find((g) => g.key === key)?.owner;
  /** A post's author and, for a Group post, the Group's owner (whose Group it lives in). */
  const postPeople = (key: string) => {
    const p = content.posts.find((x) => x.key === key);
    return [p?.author, groupOwner(p?.group)];
  };
  const listingOwner = (key: string) => content.listings.find((l) => l.key === key)?.owner;
  const targetOf = (t: Target | { kind: 'user'; user: string }) =>
    t.kind === 'user' ? [t.user] : t.kind === 'post' ? postPeople(t.post) : [...postPeople(t.post), commentAuthor(t.post, t.comment)];
  const others = (() => {
    switch (step.kind) {
      case 'friend-request':
      case 'chat-start':
        return [step.target];
      case 'friend-accept':
      case 'chat-accept':
        return [step.requester];
      case 'follow':
      case 'review':
        return [step.professional];
      case 'group':
      case 'group-join':
        return [groupOwner(step.group)];
      case 'group-approve':
      case 'group-role':
        return [groupOwner(step.group), step.member];
      case 'post':
        return postPeople(step.post);
      case 'comment': {
        const c = content.posts.find((p) => p.key === step.post)?.comments.find((x) => x.key === step.comment);
        return [...postPeople(step.post), commentAuthor(step.post, c?.replyTo)];
      }
      case 'like':
      case 'report':
        return targetOf(step.target);
      case 'share':
      case 'offer-help':
        return postPeople(step.post);
      case 'offer-accept':
        return [step.professional];
      case 'listing-contact':
        return [listingOwner(step.listing)];
      case 'message':
        return [step.other];
      default:
        return [];
    }
  })();
  return [...new Set([step.actor, ...others.filter((k): k is string => k !== undefined)])];
}

/**
 * The plan narrowed to the steps that touch one of `only` (a new persona added after the first seed): those steps in their order, after
 * the account step of every persona they touch (a sign-in that creates nothing for an existing account). Nothing else is run, so content
 * that was changed or removed in the product since the first seed is never written again.
 */
export function focusPlan(steps: readonly Step[], content: Content, only: readonly string[]): Step[] {
  const wanted = new Set(only);
  const kept = steps.filter((s) => s.kind !== 'account' && personasOf(s, content).some((k) => wanted.has(k)));
  const touched = new Set([...only, ...kept.flatMap((s) => personasOf(s, content))]);
  const accounts = steps.filter((s) => s.kind === 'account' && touched.has(s.actor));
  return [...accounts, ...kept];
}

/** One line per step for the dry run: the kind, the actor and what it acts on (keys only, never a text). */
export function describeStep(step: Step): string {
  const on = (() => {
    switch (step.kind) {
      case 'friend-request':
      case 'chat-start':
        return step.target;
      case 'friend-accept':
      case 'chat-accept':
        return step.requester;
      case 'follow':
      case 'review':
        return step.professional;
      case 'group':
      case 'group-join':
        return step.group;
      case 'group-approve':
      case 'group-role':
        return `${step.group}/${step.member}`;
      case 'article':
        return step.article;
      case 'post':
      case 'offer-help':
        return step.post;
      case 'offer-accept':
        return `${step.post}/${step.professional}`;
      case 'comment':
        return `${step.post}/${step.comment}`;
      case 'like':
        return step.target.kind === 'post' ? step.target.post : `${step.target.post}/${step.target.comment}`;
      case 'share':
        return `${step.post}#${step.index}`;
      case 'listing':
      case 'listing-sold':
      case 'listing-contact':
        return step.listing;
      case 'message':
        return step.other;
      case 'trackers':
        return `${step.child} (${step.events.length})`;
      case 'report':
        return step.target.kind === 'user' ? `user ${step.target.user}` : step.target.kind === 'post' ? step.target.post : step.target.comment;
      case 'promotion':
        return step.planKey;
      default:
        return '';
    }
  })();
  return `${step.kind.padEnd(16)} ${step.actor.padEnd(8)} ${on}`.trimEnd();
}
