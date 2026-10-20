// The Admin's guide writes (FR-ADMIN-012, BR-070). The body is strict: no id, no published_at, no actor. Publishing needs the date the
// sources were checked; the database repeats that (status_guides_published_check). Judged against the server's date.
import { z } from 'zod';
import { GUIDE_STAGE_KINDS, GUIDE_STATUSES, type GuideStageKind, type GuideStatus } from '../constants/trackers.js';
import { isIsoDay } from '../tracking/time.js';

export const GUIDE_LIMITS = { title: 120, body: 4000, source: 300, pregnancyWeeks: 42, parentingMonths: 216 } as const;

export const GUIDE_WRITE_REASONS = ['invalid_body', 'text_invalid', 'range_invalid', 'date_invalid', 'source_date_required'] as const;
export type GuideWriteReason = (typeof GUIDE_WRITE_REASONS)[number];

const isReason = (message: string): message is GuideWriteReason => GUIDE_WRITE_REASONS.some((r) => r === message);

const text = (max: number) => z.string('text_invalid').max(max * 2, 'text_invalid');
const rangeNumber = z.number('range_invalid').int('range_invalid').nullable();

const fields = {
  stageKind: z.enum(GUIDE_STAGE_KINDS, 'invalid_body'),
  rangeFrom: rangeNumber,
  rangeTo: rangeNumber,
  title: text(GUIDE_LIMITS.title),
  body: text(GUIDE_LIMITS.body),
  source: text(GUIDE_LIMITS.source),
  sourceCheckedOn: z.string('date_invalid').nullable(),
};
const createSchema = z.strictObject(fields);
const updateSchema = z.strictObject({ ...fields, status: z.enum(GUIDE_STATUSES, 'invalid_body') });

export interface GuideValue {
  stageKind: GuideStageKind;
  rangeFrom: number | null;
  rangeTo: number | null;
  title: string;
  body: string;
  source: string;
  sourceCheckedOn: string | null;
}

export type GuideWriteCheck =
  | { ok: true; value: GuideValue; status: GuideStatus | null }
  | { ok: false; reason: GuideWriteReason };

function check(parsed: z.ZodSafeParseResult<GuideValue & { status?: GuideStatus }>, today: string): GuideWriteCheck {
  if (!parsed.success) {
    const [first] = parsed.error.issues;
    return { ok: false, reason: first !== undefined && isReason(first.message) ? first.message : 'invalid_body' };
  }
  const { status, ...value } = parsed.data;
  const title = value.title.trim();
  const body = value.body.trim();
  const source = value.source.trim();
  if (title === '' || title.length > GUIDE_LIMITS.title || body === '' || body.length > GUIDE_LIMITS.body || source === '' || source.length > GUIDE_LIMITS.source) {
    return { ok: false, reason: 'text_invalid' };
  }
  const { stageKind, rangeFrom, rangeTo } = value;
  if (stageKind === 'planning') {
    if (rangeFrom !== null || rangeTo !== null) return { ok: false, reason: 'range_invalid' };
  } else {
    const max = stageKind === 'pregnancy' ? GUIDE_LIMITS.pregnancyWeeks : GUIDE_LIMITS.parentingMonths;
    const min = stageKind === 'pregnancy' ? 1 : 0;
    if (rangeFrom === null || rangeTo === null || rangeFrom < min || rangeTo < rangeFrom || rangeTo > max) return { ok: false, reason: 'range_invalid' };
  }
  const checked = value.sourceCheckedOn;
  if (checked !== null && (!isIsoDay(checked) || checked < '2000-01-01' || checked > today)) return { ok: false, reason: 'date_invalid' };
  if (status === 'published' && checked === null) return { ok: false, reason: 'source_date_required' };
  return { ok: true, value: { ...value, title, body, source }, status: status ?? null };
}

/** POST /api/admin/guides: a new guide (always a draft). `today` is YYYY-MM-DD. */
export function checkGuideCreate(body: unknown, today: string): GuideWriteCheck {
  return check(createSchema.safeParse(body), today);
}

/** PUT /api/admin/guides/:id: the fields and the status (draft, published or hidden). */
export function checkGuideUpdate(body: unknown, today: string): GuideWriteCheck {
  return check(updateSchema.safeParse(body), today);
}

export const adminGuideDto = z.object({
  id: z.string(),
  stageKind: z.enum(GUIDE_STAGE_KINDS),
  rangeFrom: z.number().nullable(),
  rangeTo: z.number().nullable(),
  title: z.string(),
  body: z.string(),
  source: z.string(),
  sourceCheckedOn: z.string().nullable(),
  status: z.enum(GUIDE_STATUSES),
  publishedAt: z.string().nullable(),
});
export type AdminGuideDto = z.infer<typeof adminGuideDto>;
export const adminGuidesResponse = z.object({ guides: z.array(adminGuideDto) });
