// Global search (FR-SEARCH-001, FR-ALG-008, NFR-SEC-006; migration 20261020400000). Runs inside the caller's identity transaction and nowhere
// else. People: nestly.search_people(), the SECURITY DEFINER that counts the call, applies the limit and returns an id and a full name.
// Posts: a plain read of `posts` under the caller's own policy (posts_select_viewer), so audience, hides, reports and - when they exist -
// blocks and Private Groups decide what is found; there is no permission predicate here. Ranking comes after authorization (AC-065): exact,
// prefix, word prefix, anywhere; then newest. The Intent Signal rows hold the topic only, never the text.

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { searchIntentsInsert } from '../db/schema.js';

const peopleRow = z.object({ user_id: z.guid().nullable(), full_name: z.string().nullable(), outcome: z.enum(['found', 'limited']) });

export type PeopleSearch = { readonly kind: 'found'; readonly people: { userId: string; fullName: string }[] } | { readonly kind: 'limited' };

/** One counted People Search. A missing or invalid limit raises SQLSTATE NS001 and rolls the transaction back. */
export async function searchPeople(tx: IdentityTx, text: string, limit: number): Promise<PeopleSearch> {
  const rows = z.array(peopleRow).parse(await tx.execute(sql`select user_id, full_name, outcome from nestly.search_people(${text}, ${limit}, 0)`));
  if (rows.some((row) => row.outcome === 'limited')) return { kind: 'limited' };
  const people = rows.flatMap((row) => (row.user_id !== null && row.full_name !== null ? [{ userId: row.user_id, fullName: row.full_name }] : []));
  return { kind: 'found', people };
}

/** `%`, `_` and `\` in the text are characters, not patterns. */
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`);

const postRow = z.object({ id: z.guid(), authorId: z.guid().nullable(), body: z.string(), createdAt: z.string() });

export interface FoundPost {
  readonly id: string;
  readonly authorId: string | null;
  readonly body: string;
  readonly createdAt: string;
}

export async function searchPosts(tx: IdentityTx, text: string, limit: number): Promise<FoundPost[]> {
  const q = escapeLike(text.toLowerCase());
  const rows = await tx.execute(sql`
    select p.id, p.author_id as "authorId", p.body, to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
    from nestly.posts p
    where p.body is not null and lower(p.body) like ${`%${q}%`}
    order by case when lower(p.body) = ${text.toLowerCase()} then 0
                  when lower(p.body) like ${`${q}%`} then 1
                  when lower(p.body) like ${`% ${q}%`} then 2
                  else 3 end,
             p.created_at desc, p.id desc
    limit ${limit}`);
  return z.array(postRow).parse(rows);
}

/** Stores the detected topics of a search (the owner's rows: the user is the caller's, set by the database). */
export async function recordTopics(tx: IdentityTx, topics: readonly string[]): Promise<void> {
  if (topics.length === 0) return;
  await tx.insert(searchIntentsInsert).values(topics.map((topic) => ({ topic })));
}

