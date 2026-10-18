// The community feed (I3 F3.2 a2; FR-FEED-001, FR-ALG-002, ERR-027, BR-065; I3-algorithm.md). The caller is already authenticated; one page is
// one identity transaction. The database decides who may see which post, count and name (row policies); this layer reads the configuration
// and the snapshot clock, asks the ranking statement for the page, re-ranks it (shared), reads the display fields by the page's ids and
// builds the answer. The viewer's Stage is read only when the configuration gives it weight. An empty feed is a page, never an error.

import {
  feedPageResponse,
  resolveFeedConfig,
  selectFeedPage,
  serializeFeedCursor,
  type FeedConfigFallback,
  type FeedCursor,
  type FeedPageResponse,
  type FeedUnit,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction, type IdentityTx } from '../db/identity-transaction.js';
import type { Identity } from '../lib/token-verifier.js';
import { readOwnAccounts } from '../repositories/account-state-repository.js';
import { readDisplayPosts, readFeedConfigRows, readRankedPosts, readSnapshotClock, type DisplayPost } from '../repositories/feed-repository.js';
import { readOwnStages } from '../repositories/journeys-repository.js';

/** The caller cannot read a feed: a stopped account (ERR-037), or an account that is not a Regular parent's. */
export type FeedRefusal = { readonly kind: 'stopped' } | { readonly kind: 'forbidden' };

export type FeedOutcome =
  | { readonly kind: 'page'; readonly page: FeedPageResponse; readonly fallback: FeedConfigFallback | null }
  | { readonly kind: 'cursor_invalid' }
  | FeedRefusal;

/** More than one own users row cannot happen with the primary key; seeing them means a policy is wrong. */
export class FeedFault extends Error {
  constructor(what: string) {
    super(what);
    this.name = 'FeedFault';
  }
}

async function classifyViewer(tx: IdentityTx): Promise<FeedRefusal | undefined> {
  const accounts = await readOwnAccounts(tx);
  if (accounts.length > 1) throw new FeedFault('more than one own users row');
  const [account] = accounts;
  if (account === undefined) return { kind: 'forbidden' };
  if (account.status !== 'active') return { kind: 'stopped' };
  return account.accountType === 'regular' ? undefined : { kind: 'forbidden' };
}

/** The unit as the answer carries it, or undefined for a row that cannot be one (a shape the database forbids): it is left out. */
function unitOf(row: DisplayPost): FeedUnit | undefined {
  const common = { id: row.id, source: 'organic', audience: row.audience, stageTag: row.stageTag, createdAt: row.createdAt } as const;
  if (row.isAnonymous) {
    // The real author is not read anywhere; an anonymous unit is never the caller's and has no author key. A share is never anonymous.
    if (row.isShare || row.body === null) return undefined;
    return { ...common, kind: 'post', body: row.body, isMine: false, isAnonymous: true };
  }
  const named = { isMine: row.isMine, isAnonymous: false, author: { name: row.authorName } } as const;
  if (!row.isShare) return row.body === null ? undefined : { ...common, kind: 'post', body: row.body, ...named };
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
          author: { name: row.originalAuthorName },
        } as const)
      : ({ available: false } as const);
  // A share's own text is `sharerText`; `body` stays empty (a1 findings, "For a2").
  return { ...common, kind: 'share', body: null, sharerText: row.body, original, ...named };
}

/** GET /feed: one page. `cursor` is null for a first page; a structurally valid cursor whose `asOf` is in the database's future is refused. */
export async function readFeedPage(database: Database, identity: Identity, cursor: FeedCursor | null): Promise<FeedOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<FeedOutcome> => {
    const refusal = await classifyViewer(tx);
    if (refusal !== undefined) return refusal;
    const clock = await readSnapshotClock(tx, cursor === null ? null : cursor.asOf);
    if (!clock.isCursorUsable) return { kind: 'cursor_invalid' };

    const resolution = resolveFeedConfig(await readFeedConfigRows(tx), cursor === null ? null : cursor.configVersion);
    const { config, configVersion } = resolution;
    // A cursor pinned to a version that cannot be used is dropped: the page is a new first page of a new snapshot.
    const after = cursor !== null && !resolution.restarted ? cursor : null;
    const asOf = after === null ? clock.nowText : after.asOf;
    const stages = config.wStage > 0 ? await readOwnStages(tx) : [];

    const ranked = await readRankedPosts(tx, { asOf, config, stages, after });
    const selection = selectFeedPage(ranked, config);
    const display = new Map((await readDisplayPosts(tx, selection.units.map((unit) => unit.id))).map((row) => [row.id, row]));
    const items: FeedUnit[] = [];
    for (const unit of selection.units) {
      const row = display.get(unit.id); // gone since the ranking statement: no longer readable, so not listed
      const item = row === undefined ? undefined : unitOf(row);
      if (item !== undefined) items.push(item);
    }
    const last = selection.cursorFrom;
    const nextCursor =
      last === null ? null : serializeFeedCursor({ asOf, configVersion, tier: last.tier, score: last.score, createdAt: last.createdAt, id: last.id });
    const page = feedPageResponse.parse({ items, nextCursor, configVersion, ...(resolution.restarted ? { restarted: true } : {}) });
    return { kind: 'page', page, fallback: resolution.fallback };
  });
}
