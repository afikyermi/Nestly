// What a share or a link names (I3 F3.5 c2, F3.6 c1, c2; FR-FEED-006, FR-FEED-007, BR-064, BR-066; Afik 2א). Pure: the same rules on the
// feed card and the post page, which only decide whether to show the actions. The database refuses a share whatever these say (NS002), and
// a link opens only what the opener may read (RLS); these keep a control from being shown that could only fail.
import type { PostAudience } from '../constants/index.js';
import type { ShareOriginal } from './response.js';

/** What the rules read of a feed unit or a post page: both fit. */
export type ShareableUnit =
  | { readonly kind: 'post'; readonly id: string; readonly audience: PostAudience; readonly isAnonymous: boolean; readonly isMine: boolean }
  | { readonly kind: 'share'; readonly original: ShareOriginal };

/** The post a link or a share names: a named post itself, a share's original when available (BR-066), with its audience and owner. */
function namedPost(unit: ShareableUnit): { id: string; audience: PostAudience; isMine: boolean } | null {
  if (unit.kind === 'share') return unit.original.available ? unit.original : null;
  return unit.isAnonymous ? null : unit;
}

/**
 * The id a "שיתוף בפיד" shares (F3.5 c2), else null: a named post for everyone that is not the viewer's, or a share's original that is
 * available, for everyone and not the viewer's. A share is never shared as itself (BR-066). The share's own audience does not matter.
 */
export function shareTargetOf(unit: ShareableUnit): string | null {
  const post = namedPost(unit);
  return post !== null && post.audience === 'everyone' && !post.isMine ? post.id : null;
}

/**
 * The link "שיתוף קישור" sends (F3.6 c1): `${origin}/posts/${id}` of a named post for everyone, the viewer's own included, or of a share's
 * available original for everyone; else null (anonymous, friends-only, not available). No query, no user id, no text: only the post id.
 */
export function postLinkOf(origin: string, unit: ShareableUnit): string | null {
  const post = namedPost(unit);
  return post !== null && post.audience === 'everyone' ? `${origin}/posts/${post.id}` : null;
}

/** The site link of "שיתוף Nestly" (F3.6 c11). */
export const siteLinkOf = (origin: string): string => `${origin}/`;

/** The title a shared link carries (F3.6 c2): fixed words, never anything of the post. */
export const POST_SHARE_TITLE = 'פוסט ב-Nestly';
export const SITE_SHARE_TITLE = 'Nestly';

/** Where each share option sends the link (F3.6 c2): the title and the URL only, never the body, a name, the audience, a tag or a date. */
export interface ShareTargets {
  readonly whatsapp: string;
  readonly email: string;
  readonly device: { readonly title: string; readonly url: string };
}

export function shareTargetsOf(title: string, url: string): ShareTargets {
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`,
    device: { title, url },
  };
}
