// Cross-reference checks of the demo content: every name points at a persona of the right kind, keys are unique, and the story is
// possible in time order (nobody acts before joining, a comment comes after its post, a Group post after joining the Group, a reply
// after its parent). The product would refuse some of these (a friends-only post seen by a stranger); the rest would read wrong.
import type { Content } from './content.ts';
import { personaKinds } from './content.ts';

export function checkContent(content: Content): string[] {
  const problems: string[] = [];
  const kinds = personaKinds(content);
  const joined = new Map<string, number>();
  for (const p of [...content.regulars, ...content.professionals]) joined.set(p.key, p.joinedDaysAgo * 24);

  const seen = new Set<string>();
  const unique = (k: string, what: string) => {
    if (seen.has(k)) problems.push(`duplicate key ${k} (${what})`);
    seen.add(k);
  };
  for (const k of kinds.keys()) unique(k, 'persona');

  const persona = (k: string, where: string, kind?: 'regular' | 'professional') => {
    const found = kinds.get(k);
    if (found === undefined) problems.push(`${where}: unknown persona ${k}`);
    else if (kind !== undefined && found !== kind) problems.push(`${where}: ${k} is not a ${kind}`);
  };
  const after = (who: string, age: number, where: string) => {
    const j = joined.get(who);
    if (j !== undefined && age >= j) problems.push(`${where}: ${who} acts ${age}h ago but joined ${j}h ago`);
  };

  const friends = new Set<string>();
  for (const f of content.friendships) {
    persona(f.from, 'friendship', 'regular');
    persona(f.to, 'friendship', 'regular');
    after(f.from, f.ageHours, `friendship ${f.from}->${f.to}`);
    after(f.to, f.ageHours, `friendship ${f.from}->${f.to}`);
    if (f.accept) friends.add([f.from, f.to].sort().join('|'));
  }
  const areFriends = (a: string, b: string) => a === b || friends.has([a, b].sort().join('|'));
  for (const f of content.follows) {
    persona(f.follower, 'follow');
    persona(f.professional, 'follow', 'professional');
    after(f.follower, f.ageHours, 'follow');
  }

  const groups = new Map<string, Map<string, number>>();
  for (const g of content.groups) {
    unique(g.key, 'group');
    persona(g.owner, `group ${g.key}`);
    after(g.owner, g.ageHours, `group ${g.key}`);
    const members = new Map<string, number>([[g.owner, g.ageHours]]);
    for (const m of g.members) {
      persona(m.user, `group ${g.key}`);
      after(m.user, m.ageHours, `group ${g.key} member`);
      if (m.ageHours >= g.ageHours) problems.push(`group ${g.key}: ${m.user} joins before the group exists`);
      members.set(m.user, m.ageHours);
    }
    groups.set(g.key, members);
  }

  const posts = new Map<string, Content['posts'][number]>();
  for (const p of content.posts) {
    unique(p.key, 'post');
    posts.set(p.key, p);
    persona(p.author, `post ${p.key}`);
    after(p.author, p.ageHours, `post ${p.key}`);
    if (p.anonymous === true) persona(p.author, `post ${p.key} (anonymous)`, 'regular');
    const members = p.group === undefined ? undefined : groups.get(p.group);
    if (p.group !== undefined && members === undefined) problems.push(`post ${p.key}: unknown group ${p.group}`);
    const canSee = (who: string, age: number | null, where: string) => {
      if (members !== undefined) {
        const since = members.get(who);
        if (since === undefined) problems.push(`${where}: ${who} is not a member of ${p.group ?? ''}`);
        else if (age !== null && age >= since) problems.push(`${where}: ${who} acts before joining ${p.group ?? ''}`);
      }
      if (p.audience === 'friends' && !areFriends(p.author, who)) problems.push(`${where}: ${who} cannot see a friends-only post`);
    };
    canSee(p.author, p.ageHours, `post ${p.key}`);
    for (const l of p.likes) {
      persona(l, `post ${p.key} like`);
      canSee(l, null, `post ${p.key} like`);
    }
    const comments = new Map<string, number>();
    for (const c of p.comments) {
      unique(c.key, 'comment');
      persona(c.author, `comment ${c.key}`);
      after(c.author, c.ageHours, `comment ${c.key}`);
      canSee(c.author, c.ageHours, `comment ${c.key}`);
      if (c.ageHours >= p.ageHours) problems.push(`comment ${c.key} is older than its post`);
      if (c.replyTo !== undefined) {
        const parent = comments.get(c.replyTo);
        if (parent === undefined) problems.push(`comment ${c.key}: reply to unknown or later comment ${c.replyTo}`);
        else if (c.ageHours >= parent) problems.push(`comment ${c.key} is older than its parent`);
      }
      comments.set(c.key, c.ageHours);
      for (const l of c.likes ?? []) persona(l, `comment ${c.key} like`);
      for (const r of c.reports ?? []) persona(r.by, `comment ${c.key} report`);
    }
    for (const s of p.shares ?? []) {
      persona(s.by, `post ${p.key} share`, 'regular');
      if (s.ageHours >= p.ageHours) problems.push(`post ${p.key}: shared before it was written`);
      if (p.audience !== 'everyone' || p.anonymous === true) problems.push(`post ${p.key}: only a public named post can be shared`);
    }
    for (const r of p.reports ?? []) persona(r.by, `post ${p.key} report`);
  }

  for (const a of content.articles) {
    unique(a.key, 'article');
    persona(a.author, `article ${a.key}`, 'professional');
    after(a.author, a.ageHours, `article ${a.key}`);
    const pro = content.professionals.find((x) => x.key === a.author);
    if (pro !== undefined && pro.field !== a.field) problems.push(`article ${a.key}: field ${a.field} is not its author's field`);
  }

  for (const h of content.helpOffers) {
    const where = `help offer ${h.professional} on ${h.post}`;
    persona(h.professional, where, 'professional');
    const post = posts.get(h.post);
    if (post === undefined) {
      problems.push(`${where}: unknown post`);
      continue;
    }
    if (h.ageHours >= post.ageHours) problems.push(`${where}: offered before the post`);
    if (post.audience === 'friends') problems.push(`${where}: a friends-only post cannot get an offer`);
    if (post.group !== undefined && !(groups.get(post.group)?.has(h.professional) ?? false)) problems.push(`${where}: not a member of the group`);
    if (h.accept && (h.acceptAgeHours === undefined || h.acceptAgeHours >= h.ageHours)) problems.push(`${where}: accepted before it was sent`);
    if (!h.accept && (h.conversation !== undefined || h.review !== undefined)) problems.push(`${where}: a conversation needs an accepted offer`);
    checkThread(h.conversation ?? [], [post.author, h.professional], h.acceptAgeHours ?? h.ageHours, where, problems);
    if (h.review !== undefined && !(h.conversation ?? []).some((m) => m.from === h.professional && m.ageHours > (h.review?.ageHours ?? 0))) {
      problems.push(`${where}: a review needs a message of the professional before it`);
    }
  }

  const listings = new Map<string, number>();
  for (const l of content.listings) {
    unique(l.key, 'listing');
    persona(l.owner, `listing ${l.key}`, 'regular');
    after(l.owner, l.ageHours, `listing ${l.key}`);
    listings.set(l.key, l.ageHours);
  }
  for (const c of content.contacts) {
    const age = listings.get(c.listing);
    const owner = content.listings.find((l) => l.key === c.listing)?.owner;
    if (age === undefined || owner === undefined) problems.push(`contact on unknown listing ${c.listing}`);
    else {
      if (c.ageHours >= age) problems.push(`contact on ${c.listing} before the listing`);
      checkThread(c.replies, [c.from, owner], c.ageHours, `contact on ${c.listing}`, problems);
    }
  }
  for (const c of content.chats) {
    const where = `chat ${c.from}->${c.to}`;
    persona(c.from, where);
    persona(c.to, where);
    const [first] = c.messages;
    if (first !== undefined && first.from !== c.from) problems.push(`${where}: the first message is not the starter's`);
    checkThread(c.messages, [c.from, c.to], Number.POSITIVE_INFINITY, where, problems);
    if (c.pending === true && c.messages.length !== 1) problems.push(`${where}: a pending request holds one message`);
    if (c.review !== undefined) persona(c.to, `${where} review`, 'professional');
  }
  for (const p of content.promotions) {
    persona(p.owner, 'promotion');
    if (p.target.kind === 'post' && posts.get(p.target.post)?.author !== p.owner) problems.push(`promotion: ${p.owner} does not own ${p.target.post}`);
    if (p.target.kind === 'listing' && content.listings.find((l) => l.key === (p.target.kind === 'listing' ? p.target.listing : ''))?.owner !== p.owner) {
      problems.push(`promotion: ${p.owner} does not own the listing`);
    }
  }
  for (const t of content.trackers) {
    const r = content.regulars.find((x) => x.key === t.persona);
    if (r === undefined || !r.children.some((c) => c.name === t.child)) problems.push(`tracker: ${t.persona} has no child ${t.child}`);
  }
  for (const s of content.support) persona(s.persona, 'support');
  for (const r of content.userReports) {
    persona(r.by, 'user report');
    persona(r.target, 'user report');
  }
  for (const s of content.stories) persona(s.author, 'story', 'regular');
  return problems;
}

/** Messages oldest first (ageHours falling), each from one of the two parties, all after `since`. */
function checkThread(messages: Content['chats'][number]['messages'], parties: string[], since: number, where: string, problems: string[]) {
  let last = since;
  for (const m of messages) {
    if (!parties.includes(m.from)) problems.push(`${where}: ${m.from} is not a party`);
    if (m.ageHours >= last) problems.push(`${where}: messages are not in time order`);
    last = m.ageHours;
  }
}
