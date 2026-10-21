// The Moderators team (I14): the Admin's team screen (FR-ADMIN-004), joining with an invitation, System Announcements (FR-ADMIN-008), the
// community settings' report reasons (FR-ADMIN-007), the Admin Analytics (FR-ADMIN-010, FR-ADMIN-003) and the staff inbox counts (AC-044).
// The web checks what it sends and the server checks again, by the same rules. Every body is strict. Who may do what is the database's.
import { z } from 'zod';
import { LISTING_CATEGORIES, PERMISSION_KEYS, PROFESSIONAL_FIELDS, SUPPORT_TOPICS, type PermissionKey } from '../constants/index.js';
import { codePointLength } from './text.js';

/** An invitation is valid this many hours (the database's default; Afik 21.10.2026). */
export const INVITATION_HOURS = 48;
export const INVITATION_NOTE_MIN = 2;
export const INVITATION_NOTE_MAX = 80;
export const ANNOUNCEMENT_TITLE_MIN = 2;
export const ANNOUNCEMENT_TITLE_MAX = 80;
export const ANNOUNCEMENT_BODY_MAX = 1000;
export const REPORT_REASON_LABEL_MIN = 2;
export const REPORT_REASON_LABEL_MAX = 60;
export const ANNOUNCEMENT_STATUSES = ['draft', 'published', 'removed'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];
export const ANALYTICS_PERIODS = [7, 30, 90] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];
/** How many published announcements the feed shows at most, newest first. */
export const FEED_ANNOUNCEMENTS_MAX = 3;

/** BR-028 / AC-032: a key that needs another to work (the database's has_permission() holds the same pairs). */
export const PERMISSION_REQUIRES: Readonly<Partial<Record<PermissionKey, PermissionKey>>> = {
  SUPPORT_HANDLE: 'SUPPORT_VIEW',
  USER_WARN: 'USER_VIEW',
  USER_SUSPEND: 'USER_VIEW',
  USER_BAN: 'USER_VIEW',
  PRIVATE_GROUP_MODERATE: 'REPORTS_VIEW',
};

/** The keys plus the ones they need, in PERMISSION_KEYS order (the screen adds a key's base when the key is chosen). */
export function withRequiredKeys(keys: readonly PermissionKey[]): PermissionKey[] {
  const chosen = new Set<PermissionKey>(keys);
  for (const key of keys) {
    const base = PERMISSION_REQUIRES[key];
    if (base !== undefined) chosen.add(base);
  }
  return PERMISSION_KEYS.filter((key) => chosen.has(key));
}

/** Trimmed text of min..max code points, no NUL. */
const text = (min: number, max: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .refine((value) => !value.includes('\u0000') && codePointLength(value) >= min && codePointLength(value) <= max, 'invalid');

/** A one-time invitation code: 32 random bytes, base64url (43 characters). */
export const invitationCode = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** POST /api/admin/team/invitations. */
export const invitationCreateSchema = z.strictObject({ note: text(INVITATION_NOTE_MIN, INVITATION_NOTE_MAX) });
/** POST /api/team/join. */
export const joinTeamSchema = z.strictObject({ code: invitationCode });
/** PUT /api/admin/team/:userId/permissions: the whole set; every key's base included (BR-028). */
export const moderatorKeysSchema = z
  .strictObject({ permissions: z.array(z.enum(PERMISSION_KEYS)).max(PERMISSION_KEYS.length) })
  .refine((value) => new Set(value.permissions).size === value.permissions.length, 'duplicate')
  .refine((value) => withRequiredKeys(value.permissions).length === value.permissions.length, 'missing_base');
export type ModeratorKeysRequest = z.infer<typeof moderatorKeysSchema>;
/** POST /api/admin/announcements and PATCH /api/admin/announcements/:id. */
export const announcementSchema = z.strictObject({ title: text(ANNOUNCEMENT_TITLE_MIN, ANNOUNCEMENT_TITLE_MAX), body: text(1, ANNOUNCEMENT_BODY_MAX) });
export type AnnouncementRequest = z.infer<typeof announcementSchema>;
/** POST /api/admin/announcements/:id/status. */
export const announcementStatusSchema = z.strictObject({ status: z.enum(['published', 'removed']) });
/** PATCH /api/admin/report-reasons/:key. */
export const reportReasonUpdateSchema = z.strictObject({
  label: text(REPORT_REASON_LABEL_MIN, REPORT_REASON_LABEL_MAX),
  priority: z.int().min(1).max(4),
  sortOrder: z.int().min(0).max(1000),
  isActive: z.boolean(),
});
export type ReportReasonUpdate = z.infer<typeof reportReasonUpdateSchema>;
/** POST /api/admin/report-reasons: a new reason (its key is the server's). */
export const reportReasonCreateSchema = z.strictObject({
  label: text(REPORT_REASON_LABEL_MIN, REPORT_REASON_LABEL_MAX),
  priority: z.int().min(2).max(4),
  sortOrder: z.int().min(0).max(1000),
});
export type ReportReasonCreate = z.infer<typeof reportReasonCreateSchema>;
/** GET /api/admin/analytics?days=7|30|90. */
export const analyticsQuerySchema = z.strictObject({
  days: z
    .enum(['7', '30', '90'])
    .optional()
    .transform((value): AnalyticsPeriod => (value === undefined ? 30 : value === '7' ? 7 : value === '90' ? 90 : 30)),
});

export type TeamCheck<T> = { ok: true; value: T } | { ok: false };
function check<T>(schema: z.ZodType<T>, input: unknown): TeamCheck<T> {
  const result = schema.safeParse(input);
  return result.success ? { ok: true, value: result.data } : { ok: false };
}
export const checkInvitationCreate = (input: unknown) => check(invitationCreateSchema, input);
export const checkJoinTeam = (input: unknown) => check(joinTeamSchema, input);
export const checkModeratorKeys = (input: unknown) => check(moderatorKeysSchema, input);
export const checkAnnouncement = (input: unknown) => check(announcementSchema, input);
export const checkAnnouncementStatus = (input: unknown) => check(announcementStatusSchema, input);
export const checkReportReasonUpdate = (input: unknown) => check(reportReasonUpdateSchema, input);
export const checkReportReasonCreate = (input: unknown) => check(reportReasonCreateSchema, input);
export const checkAnalyticsQuery = (input: unknown) => check(analyticsQuerySchema, input);

// ---- answers ---------------------------------------------------------------------------------------------------------------
export const INVITATION_STATES = ['open', 'expired', 'revoked', 'accepted'] as const;
export const teamMember = z.object({
  userId: z.guid(),
  /** The note of the invitation that created the account (who it is for); null for a Moderator created otherwise. */
  label: z.string().nullable(),
  status: z.enum(['active', 'suspended', 'banned']),
  permissions: z.array(z.enum(PERMISSION_KEYS)),
  joinedAt: z.string(),
});
export type TeamMember = z.infer<typeof teamMember>;
export const teamInvitation = z.object({
  id: z.guid(),
  note: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  state: z.enum(INVITATION_STATES),
});
export type TeamInvitation = z.infer<typeof teamInvitation>;
export const teamBody = z.object({ moderators: z.array(teamMember), invitations: z.array(teamInvitation) });
export type TeamView = z.infer<typeof teamBody>;
export const invitationCreatedBody = z.object({ id: z.guid(), code: invitationCode, expiresAt: z.string() });
export type InvitationCreated = z.infer<typeof invitationCreatedBody>;

export const announcement = z.object({
  id: z.guid(),
  title: z.string(),
  body: z.string(),
  status: z.enum(ANNOUNCEMENT_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
});
export type Announcement = z.infer<typeof announcement>;
export const announcementsBody = z.object({ items: z.array(announcement) });
/** What a user sees of a published announcement. */
export const publishedAnnouncement = z.strictObject({ id: z.guid(), title: z.string(), body: z.string(), publishedAt: z.string() });
export type PublishedAnnouncement = z.infer<typeof publishedAnnouncement>;

export const reportReasonRow = z.object({
  key: z.string(),
  label: z.string(),
  priority: z.number().int(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  isCore: z.boolean(),
});
export type ReportReasonRow = z.infer<typeof reportReasonRow>;
export const reportReasonsBody = z.object({ items: z.array(reportReasonRow) });
/** GET /api/report-reasons: the reasons a reporter may choose now, in their order. */
export const activeReportReasonsBody = z.object({ items: z.array(z.object({ key: z.string(), label: z.string() })) });

const dayCount = z.object({ day: z.string(), count: z.number().int() });
export const analyticsBody = z.object({
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  accounts: z.object({
    byType: z.object({ regular: z.number().int(), professional: z.number().int(), moderator: z.number().int(), admin: z.number().int() }),
    byStatus: z.object({ active: z.number().int(), suspended: z.number().int(), banned: z.number().int() }),
    registrations: z.array(z.object({ day: z.string(), regular: z.number().int(), professional: z.number().int() })),
  }),
  content: z.object({
    posts: z.array(dayCount),
    comments: z.array(dayCount),
    likes: z.array(dayCount),
    /** How many accounts posted 1, 2-5, 6-20 or more than 20 times in the period: numbers only, no account (BR-058). */
    postsPerAuthor: z.array(z.object({ bucket: z.enum(['1', '2-5', '6-20', '21+']), accounts: z.number().int() })),
  }),
  friendships: z.object({ requested: z.number().int(), accepted: z.number().int() }),
  moderation: z.object({
    reports: z.array(dayCount),
    byReason: z.array(z.object({ label: z.string(), count: z.number().int() })),
    open: z.number().int(),
    actionTaken: z.number().int(),
    dismissed: z.number().int(),
    medianHoursToClose: z.number().nullable(),
    enforcements: z.object({ warning: z.number().int(), suspension: z.number().int(), ban: z.number().int() }),
  }),
  /** FR-ADMIN-003 Support metrics (I11 follow-ups): numbers only, never a text, a person or an id (BR-058). */
  support: z.object({
    requests: z.array(dayCount),
    byTopic: z.array(z.object({ topic: z.enum(SUPPORT_TOPICS), count: z.number().int() })),
    byStatus: z.object({ open: z.number().int(), inProgress: z.number().int(), closed: z.number().int() }),
    /** Of the period's requests, how many got a reply from Support, and the median hours to that first reply. */
    answered: z.number().int(),
    medianHoursToFirstReply: z.number().nullable(),
  }),
  /** FR-ADMIN-010 (SRS audit 21.10): Groups. Members, joins and content are counted in Public Groups only: a Private Group's members and
   *  content are not read for the analytics screen. */
  groups: z.object({
    active: z.object({ public: z.number().int(), private: z.number().int() }),
    created: z.number().int(),
    publicMembers: z.number().int(),
    publicJoins: z.number().int(),
    publicPosts: z.number().int(),
    publicComments: z.number().int(),
  }),
  /** FR-ADMIN-010: Professionals. Active accounts by field, and the period's follows, chats opened and reviews. Offer Help is not counted: its rows
   *  carry the opening message, which the analytics screen does not read. */
  professionals: z.object({
    active: z.number().int(),
    byField: z.array(z.object({ field: z.enum(PROFESSIONAL_FIELDS), count: z.number().int() })),
    follows: z.number().int(),
    chatStarts: z.number().int(),
    reviews: z.number().int(),
  }),
  /** FR-ADMIN-010: Marketplace. Listings shown now, by category, and the period's new and sold listings and chats opened about one. */
  marketplace: z.object({
    active: z.number().int(),
    byCategory: z.array(z.object({ category: z.enum(LISTING_CATEGORIES), count: z.number().int() })),
    created: z.number().int(),
    sold: z.number().int(),
    chats: z.number().int(),
  }),
});
export type AnalyticsView = z.infer<typeof analyticsBody>;

/** AC-044: the staff member's administrative notices, only for the areas its keys cover (an area it cannot see is absent). */
export const inboxBody = z.object({ openReports: z.number().int().optional(), queuedImages: z.number().int().optional() });
export type StaffInbox = z.infer<typeof inboxBody>;
