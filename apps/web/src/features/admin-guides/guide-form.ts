import { checkDateParts, type AdminGuideDto } from '@nestly/shared';
import type { DateParts } from '@/components/shared/date-input';
import type { GuideBody } from '@/services/api/admin-guides';
import { GUIDES_TEXT } from '@/lib/admin-guides-texts';

// The guide form as typed: texts only. guideToBody makes the body the server checks again (checkGuideCreate / checkGuideUpdate).
export interface GuideForm {
  stageKind: string;
  rangeFrom: string;
  rangeTo: string;
  title: string;
  body: string;
  source: string;
  sourceDate: DateParts;
}

const EMPTY_DATE: DateParts = { day: '', month: '', year: '' };

export const emptyGuideForm = (): GuideForm => ({ stageKind: '', rangeFrom: '', rangeTo: '', title: '', body: '', source: '', sourceDate: EMPTY_DATE });

export function formFromGuide(guide: AdminGuideDto): GuideForm {
  const [year = '', month = '', day = ''] = (guide.sourceCheckedOn ?? '').split('-');
  return {
    stageKind: guide.stageKind,
    rangeFrom: guide.rangeFrom === null ? '' : String(guide.rangeFrom),
    rangeTo: guide.rangeTo === null ? '' : String(guide.rangeTo),
    title: guide.title,
    body: guide.body,
    source: guide.source,
    sourceDate: guide.sourceCheckedOn === null ? EMPTY_DATE : { day: String(Number(day)), month: String(Number(month)), year },
  };
}

export type GuideBodyResult = { ok: true; body: GuideBody } | { ok: false; error: string };

const whole = (value: string): number | null => (/^\d{1,3}$/.test(value.trim()) ? Number(value.trim()) : null);

export function guideToBody(form: GuideForm): GuideBodyResult {
  if (form.stageKind === '') return { ok: false, error: GUIDES_TEXT.reasons.invalid_body };
  if (form.title.trim() === '' || form.body.trim() === '' || form.source.trim() === '') return { ok: false, error: GUIDES_TEXT.reasons.text_invalid };
  let rangeFrom: number | null = null;
  let rangeTo: number | null = null;
  if (form.stageKind !== 'planning') {
    rangeFrom = whole(form.rangeFrom);
    rangeTo = whole(form.rangeTo);
    if (rangeFrom === null || rangeTo === null) return { ok: false, error: GUIDES_TEXT.reasons.range_invalid };
  }
  const date = checkDateParts(form.sourceDate);
  if (date.kind === 'partial' || date.kind === 'invalid') return { ok: false, error: GUIDES_TEXT.reasons.date_invalid };
  return {
    ok: true,
    body: { stageKind: form.stageKind, rangeFrom, rangeTo, title: form.title.trim(), body: form.body.trim(), source: form.source.trim(), sourceCheckedOn: date.kind === 'date' ? date.iso : null },
  };
}

export function reasonText(reason: string): string {
  const known: Record<string, string> = GUIDES_TEXT.reasons;
  return known[reason] ?? GUIDES_TEXT.saveFailed;
}

export function describeStage(guide: AdminGuideDto): string {
  if (guide.stageKind === 'planning') return GUIDES_TEXT.stagePlanning;
  const from = guide.rangeFrom ?? 0;
  const to = guide.rangeTo ?? 0;
  return guide.stageKind === 'pregnancy' ? `הריון, ${GUIDES_TEXT.weeks(from, to)}` : `הורות, ${GUIDES_TEXT.months(from, to)}`;
}
