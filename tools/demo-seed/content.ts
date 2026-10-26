// The demo content (docs/lecturer-demo-plan-HE.md §2 stage ג, §3; docs/lecturer-demo-idea-HE.md §5-§7): read from the JSON files in
// ./content, checked by shape here and by cross-reference in checkContent. Data only: the runner turns it into API calls, the shift step
// into created_at moves. Every time is relative ("ageHours" before the run), so the content stays right on any day it is loaded.
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const key = z.string().regex(/^[a-z0-9-]{2,40}$/);
const hours = z.number().int().min(0).max(24 * 120);
const text = z.string().trim().min(1);
const audience = z.enum(['everyone', 'friends', 'followers']);
const stage = z.enum(['planning', 'pregnant', 'has_child']);

export const regularSchema = z.strictObject({
  key,
  fullName: text,
  parentGender: z.enum(['woman', 'man', 'other', 'prefer_not_to_say']),
  stages: z.array(stage).min(1),
  pregnancyWeek: z.number().int().min(4).max(41).optional(),
  children: z.array(z.strictObject({ name: text, sex: z.enum(['boy', 'girl', 'unknown']), ageMonths: z.number().int().min(0).max(200) })),
  joinedDaysAgo: z.number().int().min(1).max(120),
  avatar: z.string(),
  profileVisibility: z.enum(['open', 'restricted']),
  story: text,
});
export const professionalSchema = z.strictObject({
  key,
  fullName: text,
  businessName: text.nullable(),
  gender: z.enum(['woman', 'man', 'other', 'prefer_not_to_say']).nullable(),
  field: z.string(),
  fieldOther: text.nullable(),
  yearsExperience: z.number().int().min(0).max(60),
  area: z.string().nullable(),
  priceFrom: z.number().int().min(0).nullable(),
  joinedDaysAgo: z.number().int().min(1).max(120),
  avatar: z.string(),
  about: text.nullable(),
});
const reportSchema = z.strictObject({ by: key, reason: z.string(), details: text.optional(), ageHours: hours.optional() });
const commentSchema = z.strictObject({
  key,
  author: key,
  ageHours: hours,
  body: text,
  replyTo: key.optional(),
  likes: z.array(key).optional(),
  reports: z.array(reportSchema).optional(),
});
export const postSchema = z.strictObject({
  key,
  author: key,
  ageHours: hours,
  audience,
  stageTag: stage.optional(),
  anonymous: z.literal(true).optional(),
  group: key.optional(),
  body: text,
  likes: z.array(key),
  comments: z.array(commentSchema),
  shares: z.array(z.strictObject({ by: key, ageHours: hours, audience, text: text.optional() })).optional(),
  reports: z.array(reportSchema).optional(),
});
const message = z.strictObject({ from: key, ageHours: hours, text });
const review = z.strictObject({ ageHours: hours, rating: z.number().int().min(1).max(5), text });
const promotion = z.strictObject({
  owner: key,
  planKey: z.string(),
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('profile') }),
    z.strictObject({ kind: z.literal('post'), post: key }),
    z.strictObject({ kind: z.literal('listing'), listing: key }),
  ]),
});
const trackerEvent = z.strictObject({
  kind: z.enum(['breastfeeding', 'bottle', 'sleep', 'diaper', 'growth', 'vaccine', 'bath']),
  hoursAgo: z.number().min(0).max(24 * 60),
  minutes: z.number().int().min(1).max(600).optional(),
  choice: z.string().optional(),
  amountMl: z.number().int().optional(),
  weightKg: z.number().optional(),
  heightCm: z.number().optional(),
  name: text.optional(),
});

export const contentSchema = z.strictObject({
  regulars: z.array(regularSchema),
  professionals: z.array(professionalSchema),
  friendships: z.array(z.strictObject({ from: key, to: key, accept: z.boolean(), ageHours: hours })),
  follows: z.array(z.strictObject({ follower: key, professional: key, ageHours: hours })),
  groups: z.array(
    z.strictObject({
      key,
      owner: key,
      ageHours: hours,
      name: text,
      description: text,
      rules: text,
      privacy: z.enum(['public', 'private']),
      members: z.array(z.strictObject({ user: key, ageHours: hours, role: z.enum(['admin', 'moderator']).optional() })),
    }),
  ),
  posts: z.array(postSchema),
  articles: z.array(z.strictObject({ key, author: key, field: z.string(), ageHours: hours, title: text, body: text })),
  helpOffers: z.array(
    z.strictObject({
      post: key,
      professional: key,
      ageHours: hours,
      accept: z.boolean(),
      acceptAgeHours: hours.optional(),
      text,
      conversation: z.array(message).optional(),
      review: review.optional(),
    }),
  ),
  listings: z.array(
    z.strictObject({
      key,
      owner: key,
      ageHours: hours,
      title: text,
      /** Preferences: the first one the deployed product knows is sent (a category added in parallel may not exist yet). */
      category: z.array(z.string()).min(1),
      condition: z.enum(['new', 'like_new', 'good', 'used']),
      /** Whole shekels; 0 is "למסירה" (sent as 0 when the product allows it, else as null). */
      price: z.number().int().min(0),
      city: z.string(),
      image: z.string().optional(),
      sold: z.literal(true).optional(),
    }),
  ),
  contacts: z.array(z.strictObject({ listing: key, from: key, ageHours: hours, text, replies: z.array(message) })),
  chats: z.array(
    z.strictObject({
      from: key,
      to: key,
      pending: z.literal(true).optional(),
      acceptAgeHours: hours.optional(),
      messages: z.array(message).min(1),
      review: review.optional(),
    }),
  ),
  promotions: z.array(promotion),
  trackers: z.array(z.strictObject({ persona: key, child: text, events: z.array(trackerEvent) })),
  cycles: z.array(z.strictObject({ persona: key, startDaysAgo: z.number().int().min(0).max(365), cycleLengthDays: z.number().int().min(15).max(60) })),
  support: z.array(z.strictObject({ persona: key, topic: z.string(), text })),
  userReports: z.array(z.strictObject({ by: key, target: key, reason: z.string(), details: text.optional() })),
  stories: z.array(z.strictObject({ author: key, audience: z.enum(['everyone', 'friends']), caption: text, image: z.string() })),
});

export type Content = z.infer<typeof contentSchema>;
export type Regular = z.infer<typeof regularSchema>;
export type Professional = z.infer<typeof professionalSchema>;
export type Post = Content['posts'][number];
export type Comment = Post['comments'][number];
export type Listing = Content['listings'][number];
export type TrackerEvent = Content['trackers'][number]['events'][number];

const FILES = ['personas', 'social', 'posts-feed', 'posts-groups', 'posts-more', 'professional', 'market', 'activity'] as const;

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./content/${name}.json`, import.meta.url), 'utf8'));
}

/** All the content files merged into one object and parsed. Throws with the path of the first bad field. */
export function loadContent(read: (name: string) => unknown = readJson): Content {
  const merged: Record<string, unknown> = { posts: [], promotions: [] };
  for (const name of FILES) {
    const part = read(name);
    if (typeof part !== 'object' || part === null) throw new Error(`content/${name}.json is not an object`);
    for (const field of Object.keys(part)) {
      const value: unknown = Reflect.get(part, field);
      const before = merged[field];
      const items: unknown[] | null = Array.isArray(value) ? value.map((v: unknown) => v) : null;
      merged[field] = Array.isArray(before) && items !== null ? [...before.map((v: unknown) => v), ...items] : value;
    }
  }
  return contentSchema.parse(merged);
}

export type PersonaKind = 'regular' | 'professional';

/** Every persona key with its kind. */
export function personaKinds(content: Content): Map<string, PersonaKind> {
  const kinds = new Map<string, PersonaKind>();
  for (const r of content.regulars) kinds.set(r.key, 'regular');
  for (const p of content.professionals) kinds.set(p.key, 'professional');
  return kinds;
}
