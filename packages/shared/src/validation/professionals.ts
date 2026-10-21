// Professionals and services (I11; FR-PROREG-001/002, FR-SERV-001..008, FR-SERV-011, FR-FOLLOW-001, FR-PRO-001, FR-PRO-003). The web checks what
// it sends and the server checks again, by the same rules (the database's CHECKs say the same). Every body is strict; no body names the
// caller, and nothing here decides who may do what (RLS does).
import { z } from 'zod';
import {
  ARTICLE_BODY_MAX,
  ARTICLE_STATUSES,
  ARTICLE_TITLE_MAX,
  ARTICLE_TITLE_MIN,
  BUSINESS_NAME_MAX,
  BUSINESS_NAME_MIN,
  CHAT_TEXT_MAX,
  DIRECTORY_SORTS,
  FIELD_OTHER_MAX,
  FIELD_OTHER_MIN,
  FULL_NAME_MAX_LENGTH,
  FULL_NAME_MIN_LENGTH,
  OUTREACH_STATUSES,
  PARENT_GENDERS,
  PRICE_FROM_MAX,
  PROFESSIONAL_ABOUT_MAX,
  PROFESSIONAL_AREAS,
  PROFESSIONAL_FIELDS,
  REVIEW_TEXT_MAX,
  YEARS_EXPERIENCE_MAX,
  type ProfessionalField,
} from '../constants/index.js';
import { registrationConsentInput } from './registration-credentials.js';
import { checkName, codePointLength } from './text.js';

/** A trimmed name of min..max code points (VAL-001 counting); the message is the code the form shows. */
const nameOf = (min: number, max: number, code: string) =>
  z
    .string()
    .max(4 * max, code)
    .transform((raw, ctx) => {
      const result = checkName(raw, min, max);
      if (result.ok) return result.value;
      ctx.issues.push({ code: 'custom', message: code, input: raw });
      return z.NEVER;
    });

/** Free text: trimmed, not blank, no NUL, at most `max` code points. */
const textOf = (max: number, code: string) =>
  z
    .string()
    .max(4 * max, code)
    .refine((value) => value.trim() !== '' && !value.includes('\u0000') && codePointLength(value.trim()) <= max, code)
    .transform((value) => value.trim());

const uuid = z.guid().transform((value) => value.toLowerCase());

/** A uuid in a path: `guid`, so Postgres' cast cannot fail; else 400 before any query. */
export const professionalIdParams = z.object({ id: uuid });

export const PROFESSIONAL_ERROR_CODES = [
  'full_name_length',
  'business_name_length',
  'field_required',
  'field_other_length',
  'years_invalid',
  'about_too_long',
  'price_invalid',
  'area_invalid',
  'gender_invalid',
] as const;
export type ProfessionalErrorCode = (typeof PROFESSIONAL_ERROR_CODES)[number];

/** The editable fields of a Professional profile (FR-PROREG-001, FR-SERV-003). Empty optional texts are sent as null. */
const profileFields = {
  fullName: nameOf(FULL_NAME_MIN_LENGTH, FULL_NAME_MAX_LENGTH, 'full_name_length'),
  businessName: nameOf(BUSINESS_NAME_MIN, BUSINESS_NAME_MAX, 'business_name_length').nullable(),
  gender: z.enum(PARENT_GENDERS, { error: 'gender_invalid' }).nullable(),
  field: z.enum(PROFESSIONAL_FIELDS, { error: 'field_required' }),
  fieldOther: nameOf(FIELD_OTHER_MIN, FIELD_OTHER_MAX, 'field_other_length').nullable(),
  yearsExperience: z.number({ error: 'years_invalid' }).int('years_invalid').min(0, 'years_invalid').max(YEARS_EXPERIENCE_MAX, 'years_invalid'),
  area: z.enum(PROFESSIONAL_AREAS, { error: 'area_invalid' }).nullable(),
  about: textOf(PROFESSIONAL_ABOUT_MAX, 'about_too_long').nullable(),
  priceFrom: z.number({ error: 'price_invalid' }).int('price_invalid').min(0, 'price_invalid').max(PRICE_FROM_MAX, 'price_invalid').nullable(),
};

/** `other` takes a field text; any other field takes none (professional_profiles_field_other_check). */
const fieldOtherAgrees = (value: { field: ProfessionalField; fieldOther: string | null }) => (value.field === 'other') === (value.fieldOther !== null);

/** PUT /api/professional/profile: the whole editable profile. */
export const professionalProfileSchema = z.strictObject(profileFields).refine(fieldOtherAgrees, { message: 'field_other_length', path: ['fieldOther'] });
export type ProfessionalProfileInput = z.input<typeof professionalProfileSchema>;
export type ProfessionalProfileWrite = z.output<typeof professionalProfileSchema>;

/** POST /api/register/professional (FR-PROREG-001/002): step 1 of the Professional flow plus the consent and 18+ declaration. */
export const professionalRegistrationSchema = z
  .strictObject({
    ...profileFields,
    consent: registrationConsentInput,
    // Afik 21.10.2026: the required declaration that the Professional holds the training and licence its field needs
    qualification: z.literal(true, { error: 'qualification_required' }),
  })
  .refine(fieldOtherAgrees, { message: 'field_other_length', path: ['fieldOther'] });
export type ProfessionalRegistrationInput = z.input<typeof professionalRegistrationSchema>;

/** A query string number: absent or empty is no filter. */
const queryNumber = (max: number) =>
  z
    .string()
    .regex(/^\d{1,6}$/)
    .transform(Number)
    .pipe(z.number().int().min(0).max(max))
    .optional();

/** GET /api/professionals (FR-SERV-001/002, AC-009): category, area, minimum rating, maximum price, minimum experience, sort. Not strict: a
 * platform rewrite may add its own query parameter (e.g. `path`), which is ignored. */
export const directoryQuerySchema = z.object({
  field: z.enum(PROFESSIONAL_FIELDS).optional(),
  area: z.enum(PROFESSIONAL_AREAS).optional(),
  minRating: queryNumber(5),
  maxPrice: queryNumber(PRICE_FROM_MAX),
  minYears: queryNumber(YEARS_EXPERIENCE_MAX),
  sort: z.enum(DIRECTORY_SORTS).optional(),
});
export type DirectoryQuery = z.output<typeof directoryQuerySchema>;

/** POST /api/posts/:id/offer-help (FR-SERV-005): the first message. Same rule as a chat message. */
export const offerHelpSchema = z.strictObject({ text: textOf(CHAT_TEXT_MAX, 'invalid') });

/** POST /api/professionals/:id/reviews (FR-SERV-011): a rating of 1-5 and a text. */
export const reviewSchema = z.strictObject({
  rating: z.number().int().min(1).max(5),
  text: textOf(REVIEW_TEXT_MAX, 'review_invalid'),
});
export type ReviewWrite = z.output<typeof reviewSchema>;

/** POST /api/professional/articles and PUT /api/professional/articles/:id (FR-PRO-003). */
export const articleSchema = z.strictObject({
  title: nameOf(ARTICLE_TITLE_MIN, ARTICLE_TITLE_MAX, 'title_length'),
  body: textOf(ARTICLE_BODY_MAX, 'body_invalid'),
  field: z.enum(PROFESSIONAL_FIELDS),
  status: z.enum(ARTICLE_STATUSES),
});
export type ArticleWrite = z.output<typeof articleSchema>;

// ---- what the server answers (the web checks every answer with these) -------------------------------------------------------------

const fieldEnum = z.enum(PROFESSIONAL_FIELDS);
const at = z.string().min(1);

/** A directory card (FR-SERV-001): the public profile with its rating (BR-072: the average of the reviews, one decimal; null with none). */
export const professionalCard = z.strictObject({
  id: z.guid(),
  fullName: z.string(),
  businessName: z.string().nullable(),
  field: fieldEnum,
  fieldOther: z.string().nullable(),
  yearsExperience: z.number().int(),
  area: z.enum(PROFESSIONAL_AREAS).nullable(),
  priceFrom: z.number().int().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int(),
});
export type ProfessionalCard = z.infer<typeof professionalCard>;
/** FR-ALG-007, BR-005 (I13): a promoted Professional, apart from the organic list and always labelled "ממומן" (§11.5); the organic order never weighs it. */
export const promotedProfessional = z.strictObject({ promotionId: z.guid(), card: professionalCard });
export type PromotedProfessional = z.infer<typeof promotedProfessional>;
export const directoryResponse = z.strictObject({ professionals: z.array(professionalCard), promoted: z.array(promotedProfessional).default([]) });
/** GET /api/professionals/following (PG-039, FR-FOLLOW-001): the Professionals the caller follows, as directory cards. */
export const followingResponse = z.strictObject({ professionals: z.array(professionalCard) });

export const professionalReviewItem = z.strictObject({ id: z.guid(), rating: z.number().int(), text: z.string(), at });
export type ProfessionalReviewItem = z.infer<typeof professionalReviewItem>;

export const professionalArticleItem = z.strictObject({
  id: z.guid(),
  title: z.string(),
  body: z.string(),
  field: fieldEnum,
  status: z.enum(ARTICLE_STATUSES),
  at,
  isMine: z.boolean(),
  /** Hidden or removed by staff after a report (I11 follow-ups): only its owner still reads it. */
  isTakenDown: z.boolean(),
});
export type ProfessionalArticleItem = z.infer<typeof professionalArticleItem>;

/** GET /api/professionals/:id (FR-SERV-003): the profile, the viewer's Follow, what it may do, reviews and articles. */
export const professionalPage = professionalCard.extend({
  gender: z.enum(PARENT_GENDERS).nullable(),
  about: z.string().nullable(),
  isMe: z.boolean(),
  isFollowing: z.boolean(),
  /** The caller's conversation with the Professional, if any. */
  conversationId: z.guid().nullable(),
  /** FR-SERV-004: a Regular viewer may write to the Professional. */
  canChat: z.boolean(),
  /** FR-SERV-011: the conversation a Regular viewer can review this Professional on, if any. */
  reviewableConversationId: z.guid().nullable(),
  reviews: z.array(professionalReviewItem),
  articles: z.array(professionalArticleItem),
});
export type ProfessionalPage = z.infer<typeof professionalPage>;

/** An Offer Help as its two sides see it (FR-SERV-005/006). The post's text is a short excerpt; an anonymous author is never named. */
export const outreachItem = z.strictObject({
  id: z.guid(),
  professionalId: z.guid(),
  professionalName: z.string().nullable(),
  field: fieldEnum.nullable(),
  fieldOther: z.string().nullable(),
  postId: z.guid().nullable(),
  postExcerpt: z.string().nullable(),
  text: z.string(),
  status: z.enum(OUTREACH_STATUSES),
  at,
  conversationId: z.guid().nullable(),
});
export type OutreachItem = z.infer<typeof outreachItem>;
export const outreachResponse = z.strictObject({ received: z.array(outreachItem), sent: z.array(outreachItem) });

/** The profile fields a Professional may leave empty: the dashboard's completeness counts them (the required ones are always there). */
export const PROFILE_OPTIONAL_FIELDS = ['businessName', 'gender', 'area', 'about', 'priceFrom'] as const;
export type ProfileOptionalField = (typeof PROFILE_OPTIONAL_FIELDS)[number];

/** FR-PRO-001, AC-018: aggregates of the caller's own account only (VAL-032). */
export const professionalDashboard = z.strictObject({
  /** The Professional itself (its own page). */
  userId: z.guid(),
  fullName: z.string(),
  field: fieldEnum,
  fieldOther: z.string().nullable(),
  followers: z.number().int(),
  /** Conversations with the Professional opened in the last 30 days (Chat Starts). */
  chatStarts30d: z.number().int(),
  rating: z.number().nullable(),
  reviewCount: z.number().int(),
  /** Likes and comments by others on the Professional's posts in the last 30 days (Organic Engagement). */
  engagement30d: z.number().int(),
  posts30d: z.number().int(),
  articles: z.number().int(),
  offersToday: z.number().int(),
  offersPerDay: z.number().int(),
  // I11 follow-ups (Afik 21.10.2026, §9.8): "waiting for you", the Offer Help answers and the profile's completeness
  /** Conversations with an unread message. */
  unreadChats: z.number().int(),
  /** Unread notifications of an accepted Offer Help. */
  acceptedOffersNew: z.number().int(),
  /** Unread notifications of a new review. */
  reviewsNew: z.number().int(),
  offersAccepted: z.number().int(),
  offersDeclined: z.number().int(),
  /** The optional profile fields still empty. */
  profileMissing: z.array(z.enum(PROFILE_OPTIONAL_FIELDS)),
});
export type ProfessionalDashboard = z.infer<typeof professionalDashboard>;

/** A post that asks for help, as a Professional's home lists it (FR-SERV-005). */
export const helpRequestItem = z.strictObject({
  postId: z.guid(),
  excerpt: z.string(),
  isAnonymous: z.boolean(),
  authorName: z.string().nullable(),
  at,
  offered: z.boolean(),
});
export type HelpRequestItem = z.infer<typeof helpRequestItem>;
export const professionalHomeResponse = z.strictObject({ dashboard: professionalDashboard, helpRequests: z.array(helpRequestItem) });

export const accountKindResponse = z.strictObject({ kind: z.enum(['regular', 'professional', 'staff', 'none']) });
export type AccountKind = z.infer<typeof accountKindResponse>['kind'];

/** A created row's id (an article, an Offer Help). */
export const createdIdResponse = z.strictObject({ id: z.guid() });
/** An accepted Offer Help's conversation (FR-SERV-006). */
export const outreachAcceptResponse = z.strictObject({ conversationId: z.guid() });
/** A registration or a review that was saved. */
export const createdStatusResponse = z.strictObject({ status: z.literal('created') });
