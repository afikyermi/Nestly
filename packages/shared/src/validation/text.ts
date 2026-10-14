// Text rules shared by the full name (VAL-001) and the child name (DR-2).

/** btrim without a second argument: trims U+0020 only, at both ends. Tabs and other whitespace stay. */
export function trimSpaces(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === ' ') start += 1;
  while (end > start && value[end - 1] === ' ') end -= 1;
  return value.slice(start, end);
}

/** char_length: code points, not UTF-16 units. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export type NameCheck = { ok: true; value: string } | { ok: false; reason: 'empty' | 'length' };

/** Accepted iff the space-trimmed string has min..max code points. The value is the trimmed string. */
export function checkName(raw: string, min: number, max: number): NameCheck {
  const value = trimSpaces(raw);
  const length = codePointLength(value);
  if (length === 0) return { ok: false, reason: 'empty' };
  if (length < min || length > max) return { ok: false, reason: 'length' };
  return { ok: true, value };
}
