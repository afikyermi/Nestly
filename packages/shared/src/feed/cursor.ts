// The feed cursor (I3 F3.2 a1; I3-algorithm.md -> Pipeline 6). Opaque, not secret: eligibility is recomputed on every request, so a
// cursor grants nothing. Timestamps are the database's own text with six fractional digits and never pass through a JS Date (a Date
// has milliseconds and would break the keyset); `score` is a float8 as a JS number.
import { z } from 'zod';

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d{6}Z$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** The text of `to_char(x AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`: six fractional digits, a real calendar instant. */
export function isDbTimestamp(value: string): boolean {
  const m = TIMESTAMP.exec(value);
  if (!m) return false;
  const [year = 0, month = 0, day = 0, hour = 99, minute = 99, second = 99] = m.slice(1).map(Number);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month) && hour <= 23 && minute <= 59 && second <= 59;
}

export const dbTimestamp = z.string().refine(isDbTimestamp, { message: 'not a database timestamp with microseconds' });

export const feedCursor = z.strictObject({
  asOf: dbTimestamp,
  configVersion: z.number().int().min(0),
  tier: z.union([z.literal(0), z.literal(1)]),
  score: z.number(),
  createdAt: dbTimestamp,
  id: z.guid(),
});

export type FeedCursor = z.infer<typeof feedCursor>;

const MAX_CURSOR_LENGTH = 512;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** The text the client holds: the cursor as JSON in base64url. The JSON is ASCII only (digits, hex, ISO text), so a char is a byte. */
export function serializeFeedCursor(cursor: FeedCursor): string {
  const bytes = Array.from(JSON.stringify(feedCursor.parse(cursor)), (c) => c.charCodeAt(0));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = bytes.slice(i, i + 3);
    const bits = (a << 16) | (b << 8) | c;
    const chars = [bits >> 18, (bits >> 12) & 63, (bits >> 6) & 63, bits & 63].map((n) => B64.charAt(n));
    out += chars.slice(0, Math.min(4, bytes.length - i + 1)).join('');
  }
  return out;
}

function decodeBase64Url(text: string): string | null {
  if (text.length % 4 === 1) return null;
  let bits = 0;
  let count = 0;
  let out = '';
  for (const ch of text) {
    bits = (bits << 6) | B64.indexOf(ch);
    count += 6;
    if (count >= 8) {
      count -= 8;
      out += String.fromCharCode((bits >> count) & 255);
      bits &= (1 << count) - 1;
    }
  }
  return out;
}

/** Text from the query string to a cursor, or null for anything that is not exactly one: the route answers 400 `cursor_invalid`. */
export function parseFeedCursor(text: unknown): FeedCursor | null {
  if (typeof text !== 'string' || text.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const decoded = decodeBase64Url(text);
  if (decoded === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(decoded);
  } catch {
    return null;
  }
  const parsed = feedCursor.safeParse(json);
  if (!parsed.success) return null;
  return { ...parsed.data, id: parsed.data.id.toLowerCase() };
}
