// Professionals and services (I11; FR-PROREG-001/002, FR-SERV-001..008, FR-SERV-011, FR-FOLLOW-001, FR-PRO-001, FR-PRO-003, FR-ALG-005). The
// caller is already authenticated; each call is one identity transaction. The database decides who may read and write what (the I11
// policies); this layer orders the steps of one action (accept an Offer Help and open its conversation together) and names a database
// refusal by its SQLSTATE: 42501 not allowed, 23503 no such account or post, 23505 already done, 23514 a value out of range, NS029 the
// daily Offer Help limit. No text of a message, review or article reaches a log line.

import {
  CONSENT_PRIVACY_VERSION,
  CONSENT_TERMS_VERSION,
  type ArticleWrite,
  type DirectoryQuery,
  type HelpRequestItem,
  type OutreachItem,
  type ProfessionalCard,
  type ProfessionalDashboard,
  type ProfessionalPage,
  type ProfessionalProfileWrite,
  type PromotedProfessional,
  type ReviewWrite,
  PROFESSIONAL_FIELD_TOPICS,
  TOPIC_RULES,
  topicPatternSource,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { markRead } from '../repositories/chat-repository.js';
import { promotedProfessionals, recordExposure } from './promoted-units.js';
import { isPromotedProfileSource } from '../repositories/promotions-repository.js';
import {
  answerOutreach,
  deleteArticle,
  deleteFollow,
  insertArticle,
  insertFollow,
  insertOutreach,
  insertProfessionalAccount,
  openOutreachConversation,
  readArticles,
  readDashboard,
  readFollowing,
  readDirectory,
  readOutreach,
  readOwnAccountType,
  readProfessionalHead,
  readReviewableConversation,
  updateArticle,
  updateOwnProfile,
} from '../repositories/professionals-repository.js';
import { readOwnTopicWeights } from '../repositories/search-repository.js';
import { readHelpRequests } from '../repositories/help-requests-repository.js';
import { deleteOwnReview, insertReview, readOwnReview, readReviews, updateOwnReview } from '../repositories/professional-reviews-repository.js';

export type ProRefusal =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'not_allowed' }
  | { readonly kind: 'already_done' }
  | { readonly kind: 'rate_limited' };
export type ProOutcome<T> = ({ readonly kind: 'ok' } & T) | ProRefusal;

/** A database refusal by SQLSTATE; undefined for anything else (a fault, rethrown). */
function refusalOf(error: unknown): ProRefusal | undefined {
  switch (readDatabaseFault(error)?.code) {
    case '42501':
      return { kind: 'not_allowed' };
    case '23503':
      return { kind: 'unavailable' };
    case '23505':
      return { kind: 'already_done' };
    case '23514':
    case '22P02':
      return { kind: 'invalid' };
    case 'NS029':
      return { kind: 'rate_limited' };
    default:
      return undefined;
  }
}

async function guarded<T>(work: () => Promise<ProOutcome<T>>): Promise<ProOutcome<T>> {
  try {
    return await work();
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal === undefined) throw error;
    return refusal;
  }
}

/** The search topics' half-life for the directory's organic order (the Intent Signal decays; it is gone after 30 days). */
const INTENT_HALF_LIFE_HOURS = 24 * 7;

// ---- registration and the account's kind ---------------------------------------------------------------------------------------------

/** POST /api/register/professional (FR-PROREG-001/002): the account, its profile and the consent; `already_registered` when one exists. */
export async function registerProfessional(
  database: Database,
  identity: Identity,
  profile: ProfessionalProfileWrite,
): Promise<{ readonly kind: 'created' } | { readonly kind: 'already_registered' } | ProRefusal> {
  try {
    await inIdentityTransaction(database, identity, async (tx) => {
      if ((await readOwnAccountType(tx)) !== undefined) throw new AlreadyRegistered();
      await insertProfessionalAccount(tx, profile, { termsVersion: CONSENT_TERMS_VERSION, privacyVersion: CONSENT_PRIVACY_VERSION });
    });
    return { kind: 'created' };
  } catch (error) {
    if (error instanceof AlreadyRegistered) return { kind: 'already_registered' };
    const fault = readDatabaseFault(error);
    if (fault?.code === '23505' && fault.constraint === 'users_pkey') return { kind: 'already_registered' };
    const refusal = refusalOf(error);
    if (refusal !== undefined) return refusal;
    throw error;
  }
}

class AlreadyRegistered extends Error {
  constructor() {
    super('already registered');
    this.name = 'AlreadyRegistered';
  }
}

/** GET /api/account/kind: which product the signed-in account gets (presentation only: every call is checked again by the database). */
export async function readAccountKind(database: Database, identity: Identity): Promise<'regular' | 'professional' | 'staff' | 'none'> {
  const type = await inIdentityTransaction(database, identity, (tx) => readOwnAccountType(tx));
  if (type === 'regular' || type === 'professional') return type;
  return type === undefined ? 'none' : 'staff';
}

// ---- directory, page, profile ----------------------------------------------------------------------------------------------------------

/**
 * GET /api/professionals (FR-SERV-001/002, FR-ALG-005; I13 FR-ALG-007): the organic list as asked and, apart from it, the promoted
 * Professionals that match the same filters (labelled "ממומן"); their impressions are recorded after the read (never the page's failure).
 */
export async function listProfessionals(database: Database, identity: Identity, query: DirectoryQuery): Promise<{ professionals: ProfessionalCard[]; promoted: PromotedProfessional[] }> {
  const read = await inIdentityTransaction(database, identity, async (tx) => {
    const patterns =
      (query.sort ?? 'match') === 'match'
        ? (await readOwnTopicWeights(tx, new Date().toISOString(), INTENT_HALF_LIFE_HOURS)).flatMap(({ topic, weight }) =>
            TOPIC_RULES[topic] === undefined || weight <= 0 ? [] : [{ pattern: topicPatternSource(topic), weight }],
          )
        : [];
    const professionals = await readDirectory(tx, query, patterns);
    const promoted = await promotedProfessionals(tx, query);
    return { professionals, promoted };
  });
  if (read.promoted.length > 0) await recordExposure(database, identity, { impressions: read.promoted.map((unit) => unit.promotionId) });
  return read;
}

/** GET /api/professionals/:id (FR-SERV-003). */
export async function readProfessional(database: Database, identity: Identity, id: string, promotionId?: string): Promise<ProOutcome<{ page: ProfessionalPage }>> {
  const outcome = await inIdentityTransaction(database, identity, async (tx): Promise<ProOutcome<{ page: ProfessionalPage; paid: boolean }>> => {
    const head = await readProfessionalHead(tx, id);
    if (head === undefined) return { kind: 'unavailable' };
    const caller = await readOwnAccountType(tx);
    const isRegular = caller === 'regular';
    const page: ProfessionalPage = {
      ...head,
      canChat: isRegular && !head.isMe,
      reviewableConversationId: isRegular ? await readReviewableConversation(tx, id) : null,
      myReview: isRegular ? ((await readOwnReview(tx, id)) ?? null) : null,
      reviews: await readReviews(tx, id),
      articles: await readArticles(tx, id),
    };
    return { kind: 'ok', page, paid: promotionId !== undefined && await isPromotedProfileSource(tx, promotionId, id) };
  });
  // FR-PRO-002 (I13): an organic view of the Professional's profile, recorded apart from the read (its own view, staff and a block: dropped)
  if (outcome.kind === 'ok' && !outcome.page.isMe && !outcome.paid) await recordExposure(database, identity, { professionalViews: [{ professionalId: id, kind: 'profile_view' }] });
  return outcome.kind === 'ok' ? { kind: 'ok', page: outcome.page } : outcome;
}

/** PUT /api/professional/profile: the owner's edit. */
export async function editOwnProfile(database: Database, identity: Identity, profile: ProfessionalProfileWrite): Promise<ProOutcome<object>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ProOutcome<object>> =>
      (await updateOwnProfile(tx, profile)) === 0 ? { kind: 'not_allowed' } : { kind: 'ok' },
    ),
  );
}

// ---- Follow -----------------------------------------------------------------------------------------------------------------------------

/** GET /api/professionals/following (PG-039). */
export async function listFollowing(database: Database, identity: Identity): Promise<ProfessionalCard[]> {
  return inIdentityTransaction(database, identity, (tx) => readFollowing(tx));
}

/** PUT (follow; a repeat is the same) and DELETE (unfollow; none is the same) /api/professionals/:id/follow. */
export async function changeFollow(database: Database, identity: Identity, id: string, follow: boolean): Promise<ProOutcome<object>> {
  if (id === identity.userId) return { kind: 'invalid' };
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ProOutcome<object>> => {
      if (follow) await insertFollow(tx, id);
      else await deleteFollow(tx, id);
      return { kind: 'ok' };
    }),
  );
}

// ---- Offer Help -------------------------------------------------------------------------------------------------------------------------

/** POST /api/posts/:id/offer-help (FR-SERV-005, BR-007..010). */
export async function offerHelp(database: Database, identity: Identity, postId: string, text: string): Promise<ProOutcome<{ id: string }>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ProOutcome<{ id: string }>> => ({ kind: 'ok', id: await insertOutreach(tx, postId, text) })),
  );
}

/** GET /api/outreach: the Offer Help on the caller's posts and, for a Professional, the ones it sent. */
export async function listOutreach(database: Database, identity: Identity): Promise<{ received: OutreachItem[]; sent: OutreachItem[] }> {
  return inIdentityTransaction(database, identity, async (tx) => ({ received: await readOutreach(tx, 'received'), sent: await readOutreach(tx, 'sent') }));
}

/** POST /api/outreach/:id/accept (FR-SERV-006, AC-012/013): the author accepts and the conversation opens in the same transaction. */
export async function acceptOutreach(database: Database, identity: Identity, id: string): Promise<ProOutcome<{ conversationId: string }>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ProOutcome<{ conversationId: string }>> => {
      const professionalId = await answerOutreach(tx, id, 'accepted');
      if (professionalId === undefined) return { kind: 'unavailable' };
      const conversationId = await openOutreachConversation(tx, professionalId, id);
      await markRead(tx, { conversationId });
      return { kind: 'ok', conversationId };
    }),
  );
}

/** POST /api/outreach/:id/decline (VAL-011): that request only. */
export async function declineOutreach(database: Database, identity: Identity, id: string): Promise<ProOutcome<object>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ProOutcome<object>> =>
      (await answerOutreach(tx, id, 'declined')) === undefined ? { kind: 'unavailable' } : { kind: 'ok' },
    ),
  );
}

// ---- reviews and articles ---------------------------------------------------------------------------------------------------------------

/** POST /api/professionals/:id/reviews (FR-SERV-011, AC-093): on the caller's reviewable conversation; a second one is 409 (edit it instead). */
export async function writeReview(database: Database, identity: Identity, professionalId: string, review: ReviewWrite): Promise<ProOutcome<object>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ProOutcome<object>> => {
      const conversationId = await readReviewableConversation(tx, professionalId);
      if (conversationId === null) return { kind: 'not_allowed' };
      await insertReview(tx, professionalId, conversationId, review);
      return { kind: 'ok' };
    }),
  );
}

/** PUT /api/professionals/:id/reviews (§11.21): the writer edits its own active review; 404 when it has none, 403 when the database refuses. */
export async function editReview(database: Database, identity: Identity, professionalId: string, review: ReviewWrite): Promise<ProOutcome<object>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ProOutcome<object>> =>
      (await updateOwnReview(tx, professionalId, review)) === 0 ? { kind: 'unavailable' } : { kind: 'ok' },
    ),
  );
}

/** DELETE /api/professionals/:id/reviews: the writer deletes its own active review; 404 when it has none. */
export async function removeReview(database: Database, identity: Identity, professionalId: string): Promise<ProOutcome<object>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ProOutcome<object>> =>
      (await deleteOwnReview(tx, professionalId)) === 0 ? { kind: 'unavailable' } : { kind: 'ok' },
    ),
  );
}

export async function createArticle(database: Database, identity: Identity, article: ArticleWrite): Promise<ProOutcome<{ id: string }>> {
  return guarded(() => inIdentityTransaction(database, identity, async (tx): Promise<ProOutcome<{ id: string }>> => ({ kind: 'ok', id: await insertArticle(tx, article) })));
}

export async function editArticle(database: Database, identity: Identity, id: string, article: ArticleWrite): Promise<ProOutcome<object>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ProOutcome<object>> =>
      (await updateArticle(tx, id, article)) === 0 ? { kind: 'unavailable' } : { kind: 'ok' },
    ),
  );
}

export async function removeArticle(database: Database, identity: Identity, id: string): Promise<ProOutcome<object>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ProOutcome<object>> => ((await deleteArticle(tx, id)) === 0 ? { kind: 'unavailable' } : { kind: 'ok' })),
  );
}

// ---- the Professional's home ------------------------------------------------------------------------------------------------------------

/** GET /api/professional/home (FR-PRO-001, AC-018): the own dashboard and the newest posts in its field it may Offer Help on (§13.4). */
export async function readProfessionalHome(
  database: Database,
  identity: Identity,
): Promise<ProOutcome<{ dashboard: ProfessionalDashboard; helpRequests: HelpRequestItem[] }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const dashboard = await readDashboard(tx);
    if (dashboard === undefined) return { kind: 'not_allowed' };
    const patterns = PROFESSIONAL_FIELD_TOPICS[dashboard.field].map((topic) => topicPatternSource(topic));
    return { kind: 'ok', dashboard, helpRequests: await readHelpRequests(tx, patterns) };
  });
}
