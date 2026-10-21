// Global search (FR-SEARCH-001, FR-ALG-008, NFR-SEC-006, AC-039, AC-065, AC-078). One identity transaction per search. Authorization comes
// first and is the database's: People through the counted search_people(), Posts through the caller's own row policy; ranking happens after it.
// The People Search limit is the database's (60 per hour as Configuration): over it the people part is `limited` and the rest is still answered.
// The Intent Signal keeps the topic the fixed rules detect (never the text), once per search that was answered.

import {
  MAX_TOPICS_PER_SEARCH,
  SEARCH_RESULT_LIMIT,
  detectTopics,
  type SearchPost,
  type SearchResponse,
  type SearchType,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import { rateLimitFault, type RateLimited } from '../lib/profile-open-limit.js';
import type { Identity } from '../lib/token-verifier.js';
import { readVisibleNames } from '../repositories/friends-repository.js';
import { recordTopics, searchPeople, searchPosts } from '../repositories/search-repository.js';
import { searchGroups } from '../repositories/groups-repository.js';
import { classifyMember, isRefusal, type MemberRefusal } from './membership.js';

export type SearchOutcome = { readonly kind: 'ok'; readonly response: SearchResponse } | RateLimited | MemberRefusal;

const SNIPPET_LENGTH = 160;

/** The start of the text, or the part around the first match, as one line. */
function snippetOf(body: string, text: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(text.toLowerCase());
  const start = at > 40 ? at - 40 : 0;
  const part = [...flat.slice(start)].slice(0, SNIPPET_LENGTH).join('');
  return `${start > 0 ? '…' : ''}${part}${flat.length - start > part.length ? '…' : ''}`;
}

export async function search(database: Database, identity: Identity, text: string, type: SearchType): Promise<SearchOutcome> {
  try {
    return await inIdentityTransaction(database, identity, async (tx): Promise<SearchOutcome> => {
      const member = await classifyMember(tx);
      if (isRefusal(member)) return member;
      const response: SearchResponse = { people: [], groups: [], posts: [], peopleLimited: false };
      if (type === 'all' || type === 'people') {
        const found = await searchPeople(tx, text, SEARCH_RESULT_LIMIT);
        if (found.kind === 'limited') response.peopleLimited = true;
        else response.people = found.people;
      }
      if (type === 'all' || type === 'groups') {
        // I10 (BR-031, BR-032): every active Group's details are discoverable, Public and Private alike; content is not searched here.
        response.groups = await searchGroups(tx, text, SEARCH_RESULT_LIMIT);
      }
      if (type === 'all' || type === 'posts') {
        const found = await searchPosts(tx, text, SEARCH_RESULT_LIMIT);
        const names = new Map((await readVisibleNames(tx, [...new Set(found.flatMap((post) => (post.authorId === null ? [] : [post.authorId])))])).map((n) => [n.userId, n.fullName]));
        response.posts = found.map(
          (post): SearchPost => ({
            id: post.id,
            authorId: post.authorId,
            authorName: post.authorId === null ? null : (names.get(post.authorId) ?? null),
            snippet: snippetOf(post.body, text),
            createdAt: post.createdAt,
          }),
        );
      }
      if (!response.peopleLimited) await recordTopics(tx, detectTopics(text).slice(0, MAX_TOPICS_PER_SEARCH));
      return { kind: 'ok', response };
    });
  } catch (error) {
    const limited = rateLimitFault(error);
    if (limited === undefined) throw error;
    return limited;
  }
}
