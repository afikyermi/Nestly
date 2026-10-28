// Regenerates docs/srs/INDEX.md from the markdown SRS, which is the master.
//
// Usage:  node tools/build-srs-index.js [--check]   (--check writes nothing, exits 1 when INDEX.md or SECTIONS.md is stale)
//
// Reads only docs/srs/**/*.md (except INDEX.md) and tools/srs-ac-names.json. Writes only docs/srs/INDEX.md.
// Run it after any change that adds, removes or renames an FR or AC, or a new section file.
//
// Fails, writing nothing, when:
//   - an AC has no short name in srs-ac-names.json, or a name points at an AC that no longer exists
//   - an FR id appears twice, or one FR prefix is split across two 05-functional files
//   - a 05-functional file is missing from DOMAIN_ORDER (add it there to place it in the index)
//   - any link in the generated index does not resolve
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRS = path.join(ROOT, 'docs', 'srs');
const NAMES = path.join(__dirname, 'srs-ac-names.json');

// Order of the functional domain files in the index (product order, not alphabetical).
const DOMAIN_ORDER = [
  'auth.md', 'registration.md', 'feed.md', 'home-tracking.md', 'marketplace.md', 'services.md', 'chat.md',
  'relationships-groups.md', 'profile-settings.md', 'search.md', 'notifications.md', 'navigation.md',
  'professional.md', 'moderation.md', 'admin.md', 'algorithms-data.md', 'assistant.md',
];
const FAMILIES = [
  ['BR', /^\| (BR-\d+) \|/, 'חוקים עסקיים'], ['VAL', /^\| (VAL-\d+) \|/, 'ולידציות'],
  ['ERR', /^\| (ERR-\d+) \|/, 'שגיאות ותרחישי קצה'], ['NFR', /^\| (NFR-[A-Z0-9]+-\d+) \|/, 'דרישות לא-פונקציונליות'],
  ['UC', /^\| (UC-\d+) \|/, 'Use Cases'], ['PG', /^\| (PG-\d+) \|/, 'מסכים'], ['OP', /^\| (OP-\d+) \|/, 'נקודות פתוחות ומעקב החלטות'],
  ['ALG', /^\| (ALG-\d+) \|/, 'קטלוג האלגוריתמים'], ['P-ALG', /^\| (P-ALG-\d+) \|/, 'עקרונות האלגוריתמים'],
];

const CHECK = process.argv.includes('--check');
const fail = [];
const read = (rel) => fs.readFileSync(path.join(SRS, rel), 'utf8').split(/\r?\n/);
const h1 = (lines) => (lines.find((l) => /^# /.test(l)) || '').replace(/^# /, '');

// ---- section files (top level) ----
const top = fs.readdirSync(SRS).filter((f) => f.endsWith('.md') && f !== 'INDEX.md' && f !== 'SECTIONS.md');
const rank = (f) => (f.startsWith('appendix-') ? 1000 + f.charCodeAt(9) : parseInt(f, 10));
top.sort((a, b) => rank(a) - rank(b));

// ---- functional domain files ----
const funcDir = path.join(SRS, '05-functional');
const funcFiles = fs.readdirSync(funcDir).filter((f) => f.endsWith('.md'));
for (const f of funcFiles) if (!DOMAIN_ORDER.includes(f)) fail.push(`05-functional/${f} is not in DOMAIN_ORDER`);
for (const f of DOMAIN_ORDER) if (!funcFiles.includes(f)) fail.push(`DOMAIN_ORDER lists missing file ${f}`);

const frs = [];
const domains = [];
for (const f of DOMAIN_ORDER.filter((x) => funcFiles.includes(x))) {
  const rel = `05-functional/${f}`;
  const lines = read(rel);
  const title = h1(lines).replace(/^5\. דרישות פונקציונליות · /, '');
  const prefixes = [];
  for (const l of lines) {
    const m = l.match(/^## (FR-([A-Z]+)-\d{3}) — (.+)$/);
    if (!m) continue;
    frs.push({ id: m[1], prefix: m[2], name: m[3], file: rel });
    if (!prefixes.includes(m[2])) prefixes.push(m[2]);
  }
  domains.push({ file: rel, title, prefixes });
}
const ids = frs.map((x) => x.id);
for (const id of ids) if (ids.indexOf(id) !== ids.lastIndexOf(id)) fail.push(`FR id repeats: ${id}`);
const prefixFile = {};
for (const x of frs) {
  if (prefixFile[x.prefix] && prefixFile[x.prefix] !== x.file) fail.push(`FR-${x.prefix} is split across ${prefixFile[x.prefix]} and ${x.file}`);
  prefixFile[x.prefix] = x.file;
}

// ---- ACs ----
const names = JSON.parse(fs.readFileSync(NAMES, 'utf8'));
const acs = [];
for (const l of read('15-acceptance.md')) { const m = l.match(/^\| (AC-\d{3}) \| /); if (m) acs.push(m[1]); }
for (const a of acs) if (!names[a]) fail.push(`${a} has no short name in tools/srs-ac-names.json`);
for (const k of Object.keys(names)) if (!k.startsWith('_') && !acs.includes(k)) fail.push(`srs-ac-names.json names unknown ${k}`);

// ---- other id families ----
const fam = FAMILIES.map(([key, re, label]) => {
  let best = null;
  for (const f of top) {
    const found = read(f).map((l) => l.match(re)).filter(Boolean).map((m) => m[1]);
    if (found.length && (!best || found.length > best.found.length)) best = { file: f, found };
  }
  return best ? { key, label, file: best.file, count: best.found.length, first: best.found[0], last: best.found[best.found.length - 1] } : null;
}).filter(Boolean);

// ---- version ----
const verLine = read('00-document-info.md').find((l) => /^\| גרסה \|/.test(l));
const version = verLine ? verLine.split('|')[2].trim() : '?';
const dateLine = read('00-document-info.md').find((l) => /^\| תאריך \|/.test(l));
const date = dateLine ? dateLine.split('|')[2].trim() : '?';

// ---- SECTIONS.md (outline of every SRS file), generated first so the index can link to it ----
require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build-srs-sections.mjs'), ...(CHECK ? ['--check'] : [])], { stdio: 'inherit' });

// ---- render ----
const link = (rel) => `[${path.posix.basename(rel)}](${rel})`;
const out = [];
out.push('[← README הפרויקט](../../README.md)', '', '# SRS — אינדקס', '');
out.push(`**מקור האמת של מוצר Nestly.** SRS v${version} · ${date}.`, '');
out.push('ה-SRS מתוחזק ב-markdown ומפוצל לפי סעיפים. גרסאות ה-Word הקודמות נמצאות ב-[`archive/`](archive/) כהיסטוריה בלבד.', '');
out.push('לנושא ללא מזהה: מצאו את הכותרת ב-[SECTIONS.md](SECTIONS.md) (מפת כותרות לכל קובץ), ואז `grep` לכותרת.', '');
out.push('**הקובץ הזה נוצר אוטומטית** — `node tools/build-srs-index.js`. אין לערוך אותו ידנית. כשנוסף או משתנה FR או AC, מריצים את הכלי מחדש. ל-AC חדש מוסיפים קודם שם מקוצר ב-`tools/srs-ac-names.json`.', '');
out.push('## קבצים', '', '| § | קובץ | נושא |', '|---|---|---|');
for (const f of top) {
  if (f.startsWith('06-')) out.push(`| 5 | [05-functional/](05-functional/) | דרישות פונקציונליות — ${frs.length} FR ב-${domains.length} קבצי תחום (ראה למטה) |`);
  let sec = f.startsWith('appendix-') ? f[9].toUpperCase() : String(parseInt(f, 10));
  let label = h1(read(f)).replace(/^\d+\. /, '');
  if (f.startsWith('00-')) { sec = '—'; label = 'פרטי המסמך, היסטוריית שינויים, כלל הבסיס ותוכן העניינים המקורי'; }
  out.push(`| ${sec} | ${link(f)} | ${label} |`);
}
out.push('', '### 05-functional — קבצי תחום', '', '| קובץ | תחום | קידומות | FR |', '|---|---|---|---|');
for (const d of domains) out.push(`| ${link(d.file)} | ${d.title} | ${d.prefixes.map((p) => 'FR-' + p).join(' · ')} | ${frs.filter((x) => x.file === d.file).length} |`);
out.push('', `## דרישות פונקציונליות — ${frs.length}`, '', '| ID | שם | קובץ |', '|---|---|---|');
for (const x of frs) out.push(`| ${x.id} | ${x.name} | ${link(x.file)} |`);
out.push('', `## קריטריוני קבלה — ${acs.length}`, '', '> השמות קוצרו לצורך ניווט בלבד. הנוסח המחייב נמצא ב-[15-acceptance.md](15-acceptance.md).', '', '| ID | שם מקוצר | קובץ |', '|---|---|---|');
for (const a of acs) out.push(`| ${a} | ${names[a]} | ${link('15-acceptance.md')} |`);
out.push('', '## מזהים נוספים', '', '| סוג | נושא | טווח | כמות | קובץ |', '|---|---|---|---|---|');
for (const s of fam) out.push(`| ${s.key} | ${s.label} | ${s.first} … ${s.last} | ${s.count} | ${link(s.file)} |`);
const text = out.join('\n') + '\n';

for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
  if (m[1].startsWith('../../')) continue;
  if (!fs.existsSync(path.join(SRS, m[1]))) fail.push(`broken link: ${m[1]}`);
}
if (fail.length) { console.error('INDEX NOT WRITTEN:\n  ' + fail.join('\n  ')); process.exit(1); }
const indexFile = path.join(SRS, 'INDEX.md');
if (CHECK) {
  if (!fs.existsSync(indexFile) || fs.readFileSync(indexFile, 'utf8') !== text) { console.error('docs/srs/INDEX.md is stale: run node tools/build-srs-index.js'); process.exit(1); }
  process.exit(0);
}
fs.writeFileSync(indexFile, text, 'utf8');
console.log(`INDEX.md written — SRS v${version}: ${frs.length} FR in ${domains.length} domain files, ${acs.length} AC, ${top.length} section files.`);
for (const s of fam) console.log(`  ${s.key}: ${s.count} (${s.first}…${s.last}) in ${s.file}`);
