// Measures what each role loads: automatically (CLAUDE.md, preloaded skills) and by
// instruction on every run, per the "Sources" of CLAUDE.md. Run: node tools/measure-context.mjs
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CLAUDE = 'CLAUDE.md';
const skill = (name) => `.claude/skills/${name}/SKILL.md`;
const UI_SKILLS = ['rtl-hebrew', 'accessibility', 'design-system', 'ux-copy-he'].map(skill);

// Keep in step with CLAUDE.md "Sources". "conditional" files are read only for some tasks.
export const ROLES = {
  ORCHESTRATOR: {
    auto: [CLAUDE],
    instructed: ['WORKPLAN-HE.md', 'decisions-in-force.md'],
    conditional: [skill('srs-lookup'), skill('srs-update')],
  },
  BUILDER: {
    auto: [CLAUDE],
    instructed: ['decisions-in-force.md', '.claude/knowledge/conventions.md'],
    conditional: ['.claude/knowledge/data-model.md', '.claude/knowledge/data-model-tables.md', skill('srs-lookup'), skill('srs-update'), ...UI_SKILLS],
  },
};

export const SHARED = [CLAUDE, 'decisions-in-force.md', 'WORKPLAN-HE.md'];

// # selects an exact Markdown heading, including children. Conditional totals are whole-file
// upper bounds, not instructions to read the table catalog. Missing files/sections fail visibly.
export function measure(ref) {
  const [file, section] = ref.split('#');
  let text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (section) {
    const lines = text.split('\n');
    const start = lines.findIndex((line) => /^#{1,6} /.test(line) && line.replace(/^#+ /, '') === section);
    if (start < 0) throw new Error(`Missing context section: ${ref}`);
    const level = lines[start].match(/^#+/)[0].length;
    let end = start + 1;
    while (end < lines.length && !(new RegExp(`^#{1,${level}} `)).test(lines[end])) end++;
    text = lines.slice(start, end).join('\n');
  }
  return { bytes: Buffer.byteLength(text), lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0) };
}

const sum = (paths) => paths.reduce((total, p) => total + measure(p).bytes, 0);
const kb = (bytes) => `${(bytes / 1000).toFixed(1)}K`;

export function report() {
  const rows = Object.entries(ROLES).map(([role, r]) => {
    const auto = sum(r.auto);
    const instructed = sum(r.instructed);
    return { role, auto, instructed, total: auto + instructed, conditional: sum(r.conditional) };
  });
  const shared = SHARED.map((p) => ({ path: p, ...measure(p) }));
  return { rows, shared };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { rows, shared } = report();
  console.log('| role | auto | instructed | total | conditional |\n|---|---|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.role} | ${kb(r.auto)} | ${kb(r.instructed)} | ${kb(r.total)} | ${kb(r.conditional)} |`);
  }
  console.log('\n| file | bytes | lines |\n|---|---|---|');
  for (const s of shared) console.log(`| ${s.path} | ${s.bytes} | ${s.lines} |`);
}
