// The community feed (I3 F3.2 a2; FR-FEED-001, FR-ALG-002, ERR-027, BR-065; I3-algorithm.md). The caller is already authenticated; one page is
// one identity transaction. The database decides who may see which post, count and name (row policies); this layer reads the configuration
// and the snapshot clock, asks the ranking statement for the page, re-ranks it (shared), reads the display fields by the page's ids and
// builds the answer. The viewer's own account type chooses the ranking profile and nothing else (AC-061; algorithm-review.md R1, R2): a
// Regular parent gets every term, a Professional the content signals only; Admin and Moderator have no feed. The viewer's Stage is read only
// for the Regular profile and only when the configuration gives it weight. An empty feed is a page, never an error.

import {
  feedPageResponse,
  professionalTag,
  resolveFeedConfig,
  selectFeedPage,
  serializeFeedCursor,
  TOPIC_RULES,
  topicPatternSource,
  type FeedConfigFallback,
  type FeedCursor,
  type FeedPageResponse,
  type FeedUnit,
  type AccountType,
  type ProfessionalField,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnAccounts } from '../repositories/account-state-repository.js';
import { readPublishedAnnouncements } from '../repositories/team-repository.js';
import {
  readDisplayPosts,
  readFeedConfigRows,
  readRankedPosts,
  readSnapshotClock,
  type DisplayPost,
  type RankingParameters,
  type RankingProfile,
} from '../repositories/feed-repository.js';
import { readOwnStages } from '../repositories/journeys-repository.js';
import { readCommentCounts, readLikeCounts, readLikedTargetIds } from '../repositories/likes-repository.js';
import { readOwnTopicWeights } from '../repositories/search-repository.js';
import type { MediaStorage } from '../media/storage-admin.js';
import type { PostImageRow } from '../repositories/media-repository.js';
import { imagesByPost, readPostImageRows } from './posts-service.js';

/** The caller cannot read a feed: a stopped account (ERR-037), or an account that is neither a Regular parent's nor a Professional's. */
export type FeedRefusal = { readonly kind: 'stopped' } | { readonly kind: 'forbidden' };

export type FeedOutcome =
  | {
      readonly kind: 'page';
      readonly page: FeedPageResponse;
      readonly fallback: FeedConfigFallback | null;
    }
  | { readonly kind: 'cursor_invalid' }
  | FeedRefusal;

/** More than one own users row cannot happen with the primary key; seeing them means a policy is wrong. */
export class FeedFault extends Error {
  constructor(what: string) {
    super(what);
    this.name = 'FeedFault';
  }
}

/** The ranking profile of an account type (AC-061, DR-1): Regular → every term, Professional → content signals; Admin and Moderator → none. */
export function rankingProfileOf(accountType: AccountType): RankingProfile | null {
  switch (accountType) {
    case 'regular':
      return 'regular';
    case 'professional':
      return 'content';
    case 'admin':
    case 'moderator':
      return null;
  }
}

/** Whether the page reads the viewer's own Stage (R2): never for the content profile, whatever `wStage` is; for a Regular only above 0. */
export function readsViewerStages(profile: RankingProfile, wStage: number): boolean {
  return profile === 'regular' && wStage > 0;
}

/** The caller's ranking profile, or why there is no feed. The account type is read here only, to choose the profile (R1: never a row filter). */
async function classifyViewer(tx: IdentityTx): Promise<FeedRefusal | { readonly kind: 'viewer'; readonly profile: RankingProfile }> {
  const accounts = await readOwnAccounts(tx);
  if (accounts.length > 1) throw new FeedFault('more than one own users row');
  const [account] = accounts;
  if (account === undefined) return { kind: 'forbidden' };
  if (account.status !== 'active') return { kind: 'stopped' };
  const profile = rankingProfileOf(account.accountType);
  return profile === null ? { kind: 'forbidden' } : { kind: 'viewer', profile };
}

/** A named author: its name and, for a Professional, the "יועץ · תחום" tag (decisions-in-force §4, I11). */
function authorOf(name: string | null, field: ProfessionalField | null, fieldOther: string | null): { name: string | null; tag?: string } {
  return field === null ? { name } : { name, tag: professionalTag(field, fieldOther) };
}

/** The displayed counts and the viewer's own like-state of one unit (F3.3): read after the ranking, never an input to it. */
export interface UnitReactions {
  readonly likeCount: number;
  readonly commentCount: number;
  readonly likedByMe: boolean;
}

/** The unit as the answer carries it, or undefined for a row that cannot be one (a shape the database forbids): it is left out. */
export function unitOf(row: DisplayPost, reactions: UnitReactions): FeedUnit | undefined {
  const common = {
    id: row.id,
    source: 'organic',
    audience: row.audience,
    stageTag: row.stageTag,
    createdAt: row.createdAt,
    ...reactions,
  } as const;
  if (row.isAnonymous) {
    // The real author is not read anywhere; an anonymous unit is never the caller's and has no author key. A share is never anonymous.
    if (row.isShare || row.body === null) return undefined;
    return {
      ...common,
      kind: 'post',
      body: row.body,
      isMine: false,
      isAnonymous: true,
    };
  }
  const named = {
    isMine: row.isMine,
    isAnonymous: false,
    author: authorOf(row.authorName, row.authorField, row.authorFieldOther),
  } as const;
  if (!row.isShare) {
    return row.body === null ? undefined : { ...common, kind: 'post', body: row.body, ...(row.isHelpRequest ? { isHelpRequest: true as const } : {}), ...named };
  }
  const { originalId, originalBody, originalAudience, originalCreatedAt, originalIsAnonymous } = row;
  const original =
    originalId !== null && originalBody !== null && originalAudience !== null && originalCreatedAt !== null && originalIsAnonymous === false
      ? ({
          available: true,
          id: originalId,
          body: originalBody,
          audience: originalAudience,
          createdAt: originalCreatedAt,
          isAnonymous: false,
          isMine: row.originalIsMine,
          author: authorOf(row.originalAuthorName, row.originalAuthorField, row.originalAuthorFieldOther),
        } as const)
      : ({ available: false } as const);
  // A share's own text is `sharerText`; `body` stays empty (a1 findings, "For a2").
  return {
    ...common,
    kind: 'share',
    body: null,
    sharerText: row.body,
    original,
    ...named,
  };
}

/** The viewer's topics as (pattern, weight) for the ranking statement; a topic without rules (none today) is skipped. */
async function readIntents(tx: IdentityTx, asOf: string, halfLifeHours: number): Promise<{ pattern: string; weight: number }[]> {
  return (await readOwnTopicWeights(tx, asOf, halfLifeHours)).flatMap(({ topic, weight }) =>
    TOPIC_RULES[topic] === undefined || weight <= 0 ? [] : [{ pattern: topicPatternSource(topic), weight }],
  );
}

/** One page, inside the caller's transaction. `cursor` is null for a first page; a cursor whose `asOf` is in the database's future is refused. */
async function readPage(tx: IdentityTx, viewerId: string, cursor: FeedCursor | null, storage: MediaStorage | undefined, imageRows: PostImageRow[]): Promise<FeedOutcome> {
  const viewer = await classifyViewer(tx);
  if (viewer.kind !== 'viewer') return viewer;
  const clock = await readSnapshotClock(tx, cursor === null ? null : cursor.asOf);
  if (!clock.isCursorUsable) return { kind: 'cursor_invalid' };

  const resolution = resolveFeedConfig(await readFeedConfigRows(tx), cursor === null ? null : cursor.configVersion);
  const { config, configVersion } = resolution;
  // A cursor pinned to a version that cannot be used is dropped: the page is a new first page of a new snapshot.
  const after = cursor !== null && !resolution.restarted ? cursor : null;
  const asOf = after === null ? clock.nowText : after.asOf;
  // The Stage is read in the Regular branch only: the content profile's statement has no Stage term to give it to.
  // FR-ALG-008: the viewer's own search topics, weighted for this snapshot's asOf, in the Regular branch only and only above weight 0.
  const parameters: RankingParameters =
    viewer.profile === 'regular'
      ? {
          profile: 'regular',
          asOf,
          config,
          after,
          stages: readsViewerStages(viewer.profile, config.wStage) ? await readOwnStages(tx) : [],
          intents: config.wIntent > 0 ? await readIntents(tx, asOf, config.intentHalfLifeHours) : [],
        }
      : { profile: 'content', asOf, config, after, viewerId };

  const ranked = await readRankedPosts(tx, parameters);
  const selection = selectFeedPage(ranked, config);
  const pageIds = selection.units.map((unit) => unit.id);
  const display = new Map((await readDisplayPosts(tx, pageIds)).map((row) => [row.id, row]));
  // F3.3: the displayed counts and the viewer's own likes, by the page's ids, after the order is fixed. None of them reaches the ranking.
  const likeCounts = await readLikeCounts(tx, 'post', pageIds);
  const commentCounts = await readCommentCounts(tx, pageIds);
  const liked = await readLikedTargetIds(tx, pageIds);
  // I5: a post's image rows the viewer may read, read after the order is fixed (never a ranking input); signed after the transaction
  imageRows.push(...(await readPostImageRows(tx, storage, pageIds)));
  const items: FeedUnit[] = [];
  for (const unit of selection.units) {
    const row = display.get(unit.id); // gone since the ranking statement: no longer readable, so not listed
    const reactions = {
      likeCount: likeCounts.get(unit.id) ?? 0,
      commentCount: commentCounts.get(unit.id) ?? 0,
      likedByMe: liked.has(unit.id),
    };
    const item = row === undefined ? undefined : unitOf(row, reactions);
    if (item !== undefined) items.push(item);
  }
  const last = selection.cursorFrom;
  const nextCursor =
    last === null
      ? null
      : serializeFeedCursor({
          asOf,
          configVersion,
          tier: last.tier,
          score: last.score,
          createdAt: last.createdAt,
          id: last.id,
        });
  // I14 (FR-ADMIN-008): the published System Announcements ride on the first page only, never into the ranking
  const announcements = after === null ? await readPublishedAnnouncements(tx) : [];
  const page = feedPageResponse.parse({
    items,
    nextCursor,
    configVersion,
    ...(resolution.restarted ? { restarted: true } : {}),
    ...(announcements.length > 0 ? { announcements } : {}),
  });
  return { kind: 'page', page, fallback: resolution.fallback };
}

/**
 * GET /feed: one page, in one transaction at REPEATABLE READ: the ranking, the display, the counts and the viewer's likes read one snapshot, so a
 * like the viewer's own state shows is also in the count.
 */
export async function readFeedPage(database: Database, identity: Identity, cursor: FeedCursor | null, storage?: MediaStorage): Promise<FeedOutcome> {
  const imageRows: PostImageRow[] = [];
  const outcome = await inIdentityTransaction(database, identity, (tx) => readPage(tx, identity.userId, cursor, storage, imageRows), { isolationLevel: 'repeatable read' });
  if (outcome.kind !== 'page' || imageRows.length === 0) return outcome;
  const imagesOf = await imagesByPost(storage, imageRows);
  const items = outcome.page.items.map((item) => {
    const images = item.kind === 'post' ? imagesOf.get(item.id) : undefined;
    return images === undefined ? item : { ...item, images };
  });
  return { ...outcome, page: feedPageResponse.parse({ ...outcome.page, items }) };
}
