// How the admin screens show a time: the Israeli date and the clock, in Asia/Jerusalem (the database keeps UTC). A value that is not a time is shown as it came.
export function formatAdminTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(date);
}
