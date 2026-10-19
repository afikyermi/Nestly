import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// F3.9 c6, static by design (.work/hide-post/spec.md c6, algorithm-review.md): the promise is about where the table is named. `post_hides` is
// named in code in the hide repository only, and no feed module reaches that repository (F3.2 c2 keeps it out of feed*.ts as well, see
// feed-sql.static.test.ts). Same method as likes-repository.static.test.ts.
const root = new URL('../src/', import.meta.url);
const walk = (base: URL): URL[] =>
  readdirSync(base, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, base)) : e.name.endsWith('.ts') ? [new URL(e.name, base)] : []));
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const sources = walk(root).map((f) => ({ name: f.pathname.split('/src/')[1] ?? f.pathname, text: code(readFileSync(f, 'utf8')) }));

describe('[F3.9 c6] post_hides, static', () => {
  it('[F3.9 c6] the table is named in code in repositories/post-hides-repository.ts only', () => {
    const hits = sources.filter(({ text }) => /\bpost_hides\b/.test(text)).map(({ name }) => name);
    expect(hits).toEqual(['repositories/post-hides-repository.ts']);
  });

  it('[F3.9 c6] only the hide service imports the hide repository; no feed module does', () => {
    const importers = sources.filter(({ text }) => /post-hides-repository/.test(text)).map(({ name }) => name);
    expect(importers).toEqual(['services/post-hides-service.ts']);
    const feedModules = sources.filter(({ name }) => /(^|\/)feed[^/]*\.ts$/.test(name));
    expect(feedModules.length, 'there are feed modules (the check is not vacuous)').toBeGreaterThan(0);
    for (const { name, text } of feedModules) expect(text, name).not.toMatch(/post_hides|postHides|post-hides/i);
  });

  it('[F3.9 c6] the hide repository inserts and deletes the caller row and never reads a hide back', () => {
    const text = sources.find(({ name }) => name === 'repositories/post-hides-repository.ts')?.text ?? '';
    expect(text).toMatch(/insert\s+into\s+nestly\.post_hides/i);
    expect(text).toMatch(/delete\s+from\s+nestly\.post_hides/i);
    expect(text).not.toMatch(/select[^`]*\bfrom\s+(?:nestly\.)?post_hides/i);
  });

  it('[F3.9 c6] no recommendation-feedback table or module exists', () => {
    for (const { name, text } of sources) expect(text, name).not.toMatch(/recommendation_?feedback/i);
  });
});
