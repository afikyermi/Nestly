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
  DIRECTORY_SORTS,
  FIELD_OTHER_MAX,
  FIELD_OTHER_MIN,
  FULL_NAME_MAX_LENGTH,
  FULL_NAME_MIN_LENGTH,
  PARENT_GENDERS,
  PRICE_FROM_MAX,
  PROFESSIONAL_ABOUT_MAX,
  PROFESSIONAL_AREAS,
  PROFESSIONAL_FIELDS,
  REVIEW_TEXT_MAX,
  YEARS_EXPERIENCE_MAX,
  type ArticleStatus,
  type OutreachStatus,
  type ParentGender,
  type ProfessionalArea,
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
  .strictObject({ ...profileFields, consent: registrationConsentInput })
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

/** GET /api/professionals (FR-SERV-001/002, AC-009): category, area, minimum rating, maximum price, minimum experience, sort. */
export const directoryQuerySchema = z.strictObject({
  field: z.enum(PROFESSIONAL_FIELDS).optional(),
  area: z.enum(PROFESSIONAL_AREAS).optional(),
  minRating: queryNumber(5),
  maxPrice: queryNumber(PRICE_FROM_MAX),
  minYears: queryNumber(YEARS_EXPERIENCE_MAX),
  sort: z.enum(DIRECTORY_SORTS).optional(),
});
export type DirectoryQuery = z.output<typeof directoryQuerySchema>;

/** POST /api/posts/:id/offer-help (FR-SERV-005): the first message. Same rule as a chat message. */
export const offerHelpSchema = z.strictObject({ text: textOf(2000, 'invalid') });

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

// ---- what the server answers ----------------------------------------------------------------------------------------------------------

/** A directory card (FR-SERV-001): the public profile with its rating. */
export interface ProfessionalCard {
  readonly id: string;
  readonly fullName: string;
  readonly businessName: string | null;
  readonly field: ProfessionalField;
  readonly fieldOther: string | null;
  readonly yearsExperience: number;
  readonly area: ProfessionalArea | null;
  readonly priceFrom: number | null;
  /** BR-072: the average of the reviews, one decimal; null with no review. */
  readonly rating: number | null;
  readonly reviewCount: number;
}

export interface ProfessionalReviewItem {
  readonly id: string;
  readonly rating: number;
  readonly text: string;
  readonly at: string;
}

export interface ProfessionalArticleItem {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly field: ProfessionalField;
  readonly status: ArticleStatus;
  readonly at: string;
  readonly isMine: boolean;
}

/** GET /api/professionals/:id (FR-SERV-003): the profile, the viewer's Follow, what it may do, reviews and articles. */
export interface ProfessionalPage extends ProfessionalCard {
  readonly gender: ParentGender | null;
  readonly about: string | null;
  readonly isMe: boolean;
  readonly isFollowing: boolean;
  /** FR-SERV-004: a Regular viewer may open a chat (or go to its conversation). */
  readonly conversationId: string | null;
  readonly canChat: boolean;
  /** FR-SERV-011: the conversation a Regular viewer can review this Professional on, if any. */
  readonly reviewableConversationId: string | null;
  readonly reviews: readonly ProfessionalReviewItem[];
  readonly articles: readonly ProfessionalArticleItem[];
}

/** An Offer Help as its two sides see it (FR-SERV-005/006). The post's text is a short excerpt. */
export interface OutreachItem {
  readonly id: string;
  readonly professionalId: string;
  readonly professionalName: string | null;
  readonly field: ProfessionalField | null;
  readonly fieldOther: string | null;
  readonly postId: string | null;
  readonly postExcerpt: string | null;
  readonly text: string;
  readonly status: OutreachStatus;
  readonly at: string;
  readonly conversationId: string | null;
}

/** GET /api/professional/dashboard (FR-PRO-001, AC-018): aggregates of the caller's own account only. */
export interface ProfessionalDashboard {
  readonly fullName: string;
  readonly field: ProfessionalField;
  readonly fieldOther: string | null;
  readonly followers: number;
  /** Conversations with the Professional opened in the last 30 days (Chat Starts). */
  readonly chatStarts30d: number;
  readonly rating: number | null;
  readonly reviewCount: number;
  /** Likes and comments by others on the Professional's posts in the last 30 days (Organic Engagement). */
  readonly engagement30d: number;
  readonly posts30d: number;
  readonly articles: number;
  readonly offersToday: number;
  readonly offersPerDay: number;
}

/** A post that asks for help, as a Professional's home lists it (FR-SERV-005). */
export interface HelpRequestItem {
  readonly postId: string;
  readonly excerpt: string;
  readonly isAnonymous: boolean;
  readonly authorName: string | null;
  readonly at: string;
  readonly offered: boolean;
}
