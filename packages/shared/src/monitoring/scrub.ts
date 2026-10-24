// Error monitoring (SRS §12 "Error monitoring": Sentry, errors only, no personal data sent). The server and the web app send an
// error report only after it passes through these two functions: free text loses anything that can name or reach a person, and an
// address keeps its route shape only. Pure string work, no URL or DOM API, so the same rules run on web, server and React Native.

/** The longest message kept; a longer one is cut (a stack of quoted input is not needed to find a bug). */
export const MAX_SCRUBBED_TEXT = 500;

const REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  // A query builder's error lists the bound values after "params:" (user text, emails, ids): everything after it goes.
  [/\bparams:[\s\S]*$/i, 'params: [scrubbed]'],
  // A Postgres unique or foreign-key detail quotes the row's value: "Key (email)=(a@b.c)".
  [/Key \(([^)]*)\)=\([^)]*\)/g, 'Key ($1)=([scrubbed])'],
  // "invalid input syntax for type uuid: "…"" quotes the input.
  [/(invalid input[^:\n]*:\s*)"[^"\n]*"/gi, '$1"[scrubbed]"'],
  // An address keeps scheme, host and path shape; its query and fragment (tokens, codes, search text) go.
  [/\b(https?:\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/gi, '$1'],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[token]'],
  [/\b(Bearer|Basic|Token)\s+[\w.~+/=-]+/gi, '$1 [token]'],
  [/[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]'],
  // Keys, hashes and opaque ids: a long run of letters and digits with at least one digit.
  [/\b(?=[\w-]*\d)[A-Za-z0-9_-]{20,}\b/g, '[id]'],
  // Phone numbers, ID numbers and other long digit runs.
  [/\+?\d[\d -]{6,}\d/g, '[number]'],
  // Text outside ASCII is user text in this product: Hebrew posts, names and messages, and also Russian, Arabic or an accented Latin
  // name (José). Every word holding such a letter goes whole, and a run of them, with what lies between, becomes one placeholder.
  [/[^\s"'`<>()[\]{}=,;:]*[^\s!-~][^\s"'`<>()[\]{}=,;:]*/g, '[text]'],
  [/\[text\](?:[\s\d'".,!?-]*\[text\])+/g, '[text]'],
  // A quoted string with a space in it, or a long one, is most likely quoted input (JSON.parse, a validator); an identifier (a
  // constraint, a property) has no space.
  [/"(?=[^"\n]*\s)[^"\n]{6,}"|"[^"\n]{40,}"/g, '"[text]"'],
  [/'(?=[^'\n]*\s)[^'\n]{6,}'|'[^'\n]{40,}'/g, "'[text]'"],
];

/** Free text of an error (message, value, breadcrumb) with anything personal replaced by a placeholder. */
export function scrubText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement);
  out = out.replace(/ {2,}/g, ' ').trim();
  return out.length > MAX_SCRUBBED_TEXT ? `${out.slice(0, MAX_SCRUBBED_TEXT)}…` : out;
}

const ID_SEGMENT = [
  /^\d+$/,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^(?=.*\d)[A-Za-z0-9_-]{16,}$/,
  // An email or a user name before an @; a scoped package (`node_modules/@supabase/…`, a stack frame's file) keeps its name.
  /.@/,
];

function templateSegment(segment: string): string {
  if (segment === '' || segment.startsWith(':')) return segment;
  // A percent-encoded or non-ASCII segment is a name or a slug typed by a person.
  if (segment.includes('%') || /[^\x20-\x7E]/.test(segment)) return ':text';
  return ID_SEGMENT.some((pattern) => pattern.test(segment)) ? ':id' : segment;
}

/**
 * An address reduced to its route shape: `https://host/posts/9b1d…?x=1#y` → `https://host/posts/:id`. Query and fragment are dropped;
 * each path segment that looks like an id, an email or typed text becomes `:id` / `:text`. A relative path stays relative.
 */
export function templateUrl(address: string): string {
  const cut = address.search(/[?#]/);
  const bare = cut === -1 ? address : address.slice(0, cut);
  const origin = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i.exec(bare)?.[0] ?? '';
  const path = bare.slice(origin.length);
  const host = origin.includes('@') ? origin.replace(/\/\/[^@]*@/, '//') : origin;
  return host + path.split('/').map(templateSegment).join('/');
}
