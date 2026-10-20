// Global search (FR-SEARCH-001, VAL-037): the text is trimmed and its spaces folded; two to 100 characters, else it is no query at all.
import { z } from 'zod';
import { SEARCH_QUERY_MAX, SEARCH_QUERY_MIN, SEARCH_TYPES } from '../constants/search.js';

/** The text as the database reads it: trimmed, runs of white space folded to one space. */
export function normalizeSearchText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export type SearchQueryCheck = { ok: true; text: string; type: (typeof SEARCH_TYPES)[number] } | { ok: false };

/** The query string of GET /api/search: `q` (required) and `type` (default all); any other key is refused. */
export function checkSearchQuery(query: unknown): SearchQueryCheck {
  const parsed = z.strictObject({ q: z.string(), type: z.enum(SEARCH_TYPES).optional() }).safeParse(query);
  if (!parsed.success) return { ok: false };
  const text = normalizeSearchText(parsed.data.q);
  const length = [...text].length;
  if (length < SEARCH_QUERY_MIN || length > SEARCH_QUERY_MAX) return { ok: false };
  return { ok: true, text, type: parsed.data.type ?? 'all' };
}

export const searchPerson = z.strictObject({ userId: z.guid(), fullName: z.string() });
export const searchPost = z.strictObject({
  id: z.guid(),
  authorId: z.guid().nullable(),
  authorName: z.string().nullable(),
  snippet: z.string(),
  createdAt: z.iso.datetime(),
});

/** GET /api/search. `groups` is empty until groups exist. `peopleLimited`: the People Search limit was reached (people omitted, posts still answered). */
export const searchResponse = z.strictObject({
  people: z.array(searchPerson),
  groups: z.array(z.strictObject({ id: z.guid(), name: z.string() })),
  posts: z.array(searchPost),
  peopleLimited: z.boolean(),
});
export type SearchPerson = z.infer<typeof searchPerson>;
export type SearchPost = z.infer<typeof searchPost>;
export type SearchResponse = z.infer<typeof searchResponse>;
