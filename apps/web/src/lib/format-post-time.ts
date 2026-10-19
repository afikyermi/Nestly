// The date and time of a post as a reader sees it (F3.2b): Hebrew, the reader's own time zone, e.g. "18 באוק׳ 2026, 09:00".
const formatter = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formatPostTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : formatter.format(date);
}
