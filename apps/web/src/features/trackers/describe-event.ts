import type { TrackerEventDto } from '@nestly/shared';
import { DIAPER_LABEL, SIDE_LABEL } from '@/lib/tracker-texts';

const whenFormat = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
const number = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 });

export const formatWhen = (iso: string): string => whenFormat.format(new Date(iso));

function duration(startIso: string, endIso: string | null): string {
  if (endIso === null) return '';
  const minutes = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} דקות`;
  return rest === 0 ? `${hours} שעות` : `${hours} שעות ו-${rest} דקות`;
}

/** The one-line summary of an event: its main value (OP-008). Never a judgement of the value (BR-012). */
export function describeEvent(event: TrackerEventDto): string {
  switch (event.kind) {
    case 'breastfeeding':
      return [SIDE_LABEL[event.choice ?? ''], duration(event.occurredAt, event.endedAt)].filter(Boolean).join(' · ');
    case 'sleep':
      return duration(event.occurredAt, event.endedAt);
    case 'bottle':
      return `${number.format(event.amountMl ?? 0)} מ״ל`;
    case 'diaper':
      return DIAPER_LABEL[event.choice ?? ''] ?? '';
    case 'medicine':
      return [event.name, event.dosage].filter(Boolean).join(', ');
    case 'vaccine':
      return event.name ?? '';
    case 'growth':
      return [
        event.weightKg === null ? null : `משקל ${number.format(event.weightKg)} ק״ג`,
        event.heightCm === null ? null : `גובה ${number.format(event.heightCm)} ס״מ`,
        event.headCm === null ? null : `היקף ראש ${number.format(event.headCm)} ס״מ`,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'bath':
      return 'בוצעה';
  }
}
