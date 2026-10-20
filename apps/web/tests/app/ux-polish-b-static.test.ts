// I3 ux-polish-b, the two 🟡 static criteria (.work/ux-polish-b/spec.md c10, c11; screen.md "Confirmations"). Derived from the spec only.
// Like the F1.2 import scan beside it, the spec itself asks for a scan of the source tree: this reads file text, never imports or runs it.
// c10: the original quote (author or "מהקהילה", audience, time, body, "הפוסט המקורי כבר לא זמין") is ONE shared component used by the feed card, the post
//      page share view and the share-in-feed window; the share-link window's options are the shared MenuItem.
// c11: the confirmations kept (journeys, remove friend, post delete, comment delete): the ConfirmDialog call sites are exactly screen.md's list.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = existsSync(path.resolve(process.cwd(), 'src')) ? process.cwd() : path.resolve(process.cwd(), 'apps/web');
const SRC = path.join(WEB, 'src');

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}
const rel = (f: string): string => path.relative(SRC, f).split(path.sep).join('/');
/** Product source only: no stories, no tests. */
const product = filesUnder(SRC).filter((f) => /\.tsx?$/.test(f) && !/\.stories\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const read = (f: string): string => readFileSync(f, 'utf8');
const find = (suffix: string): string => {
  const hit = product.find((f) => rel(f).endsWith(suffix));
  if (hit === undefined) throw new Error(`${suffix} not found under src/`);
  return hit;
};
/** The imports of a file: every module specifier after `from`. */
const importsOf = (text: string): string[] => [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
const QUOTE_TAG = /<blockquote\b|role=["']blockquote["']/;

describe('ux-polish-b c10 [NFR-USAB-004] one shared original-quote component', () => {
  const quoteFiles = product.filter((f) => QUOTE_TAG.test(read(f)));
  const VIEWS = ['features/posts/FeedCard.tsx', 'features/posts/PostShareView.tsx', 'features/posts/ShareFeedSheet.tsx'];

  it('[c10] exactly one product file draws the quote (one definition)', () => {
    expect(quoteFiles.map(rel)).toHaveLength(1);
  });

  it('[c10] the feed card, the post page share view and the share-in-feed window draw no blockquote of their own', () => {
    for (const view of VIEWS) expect(QUOTE_TAG.test(read(find(view))), `${view} has its own blockquote`).toBe(false);
  });

  it('[c10] each of the three imports that one definition', () => {
    const [definition] = quoteFiles;
    expect(definition).toBeDefined();
    const base = path.basename(definition ?? '').replace(/\.tsx?$/, '');
    for (const view of VIEWS) {
      const specifiers = importsOf(read(find(view)));
      expect(
        specifiers.some((s) => s === base || s.endsWith(`/${base}`)),
        `${view} must import ${base} (imports: ${specifiers.join(', ')})`,
      ).toBe(true);
    }
  });

  it('[c10] the share-link window imports the shared MenuItem for its options', () => {
    const specifiers = importsOf(read(find('components/domain/share-link-sheet.tsx')));
    expect(specifiers.some((s) => s.endsWith('/menu-item') || s === 'menu-item' || s.endsWith('shared/menu-item'))).toBe(true);
  });
});

describe('ux-polish-b c11 [NFR-USAB-004 FR-PROFILE-002 DR-1 DR-3 FR-REL-001] confirmations kept: the ConfirmDialog call sites are screen.md\'s list', () => {
  const sites = product.filter((f) => !rel(f).startsWith('components/') && /<ConfirmDialog\b/.test(read(f)));
  const count = (file: string): number => (read(find(file)).match(/<ConfirmDialog\b/g) ?? []).length;

  it('[c11] exactly the post-delete (feed, post page), comment-delete, remove-friend (/u/:id, /friends), journeys, tracker-record and guide-state (I6) dialogs; nothing else added', () => {
    expect(sites.map(rel).sort()).toEqual(
      [
        'features/admin-guides/AdminGuidesScreen.tsx',
        'features/friends/FriendsContent.tsx',
        'features/journeys/JourneysContent.tsx',
        'features/posts/CommentsView.tsx',
        'features/posts/FeedContent.tsx',
        'features/posts/PostContent.tsx',
        'features/trackers/CycleScreen.tsx',
        'features/trackers/TrackerScreen.tsx',
        'features/user-profile/UserProfileContent.tsx',
      ].sort(),
    );
  });

  it('[c11] one dialog each on the feed, the post page, the comments and /friends (a later part adds none: the card edit is not a dialog); /u/:id has the remove-friend dialog and the block dialog (FR-REL-002)', () => {
    for (const file of ['features/posts/FeedContent.tsx', 'features/posts/PostContent.tsx', 'features/posts/CommentsView.tsx', 'features/friends/FriendsContent.tsx']) {
      expect(count(file), file).toBe(1);
    }
    expect(count('features/user-profile/UserProfileContent.tsx')).toBe(2);
  });
});
