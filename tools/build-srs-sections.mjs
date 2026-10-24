// Generates docs/srs/SECTIONS.md: for every SRS markdown file (not archive/), its ## and ### headings as an outline.
// No line numbers (they rot): find the heading here, then grep that heading in the file.
// Usage: node tools/build-srs-sections.mjs [--check]. --check writes nothing and exits 1 when SECTIONS.md is stale.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = new Set(['INDEX.md', 'SECTIONS.md', 'archive']);

function listFiles(dir, rel = '') {
  const out = [];
  for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (SKIP.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, r));
    else if (e.name.endsWith('.md')) out.push(r);
  }
  return out;
}

export function headings(markdown) {
  const found = [];
  let fence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    const m = !fence && /^(#{2,3}) +(.+?)\s*#*\s*$/.exec(line);
    if (m) found.push({ level: m[1].length, title: m[2] });
  }
  return found;
}

export function build(srsDir) {
  const out = [
    '# SRS — מפת כותרות', '',
    'נוצר אוטומטית: `node tools/build-srs-sections.mjs` (נקרא גם מ-`tools/build-srs-index.js`). אין לערוך ידנית.',
    'לנושא ללא מזהה: מצאו כאן את הכותרת, ואז `grep` לכותרת בקובץ וקראו רק את הקטע. בלי מספרי שורות.', '',
  ];
  for (const rel of listFiles(srsDir)) {
    const hs = headings(readFileSync(path.join(srsDir, rel), 'utf8'));
    out.push(`## [${rel}](${rel})`, '');
    if (!hs.length) out.push('_(אין כותרות ## או ###)_');
    for (const h of hs) out.push(`${h.level === 3 ? '  ' : ''}- ${h.title}`);
    out.push('');
  }
  return out.join('\n');
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const SRS_DIR = path.resolve(here, '..', 'docs', 'srs');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = build(SRS_DIR);
  const target = path.join(SRS_DIR, 'SECTIONS.md');
  if (process.argv.includes('--check')) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== text) {
      console.error('docs/srs/SECTIONS.md is stale: run node tools/build-srs-sections.mjs');
      process.exit(1);
    }
  } else writeFileSync(target, text, 'utf8');
}
