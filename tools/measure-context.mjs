// Measures what each agent role loads: automatically (definition, CLAUDE.md,
// preloaded skills) and by instruction on every run. Baseline for the agent-system
// slimming (.work/agent-slim/). Run: node tools/measure-context.mjs
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CLAUDE = 'CLAUDE.md';
const skill = (name) => `.claude/skills/${name}/SKILL.md`;
const agent = (name) => `.claude/agents/${name}.md`;
const workflow = (...sections) => sections.map((section) => `.claude/workflow.md#${section === 'Test rules' ? 'Test rules — this project' : section}`);

// Keep in step with the read instructions in the agent definitions, their preloaded
// skills and CLAUDE.md. "conditional" files are read only for some tasks.
export const ROLES = {
  ORCHESTRATOR: {
    auto: [CLAUDE],
    instructed: ['WORKPLAN-HE.md', '.claude/workflow.md', 'decisions.md'],
    conditional: ['.claude/learning.md'],
  },
  BUILDER: {
    auto: [agent('builder'), CLAUDE],
    instructed: ['.claude/knowledge/conventions.md', 'decisions.md', ...workflow('Artifacts per feature', 'Standard path', 'Traceability')],
    conditional: ['.claude/knowledge/data-model.md', '.claude/knowledge/data-model-tables.md', ...workflow('Domains — cross-cutting concerns without their own agent', 'Test rules'), skill('rtl-hebrew'), skill('accessibility'), skill('design-system'), skill('ux-copy-he')],
  },
  CRITIC: {
    auto: [agent('critic'), CLAUDE, skill('srs-lookup'), skill('security-craft')],
    instructed: ['decisions.md', '.claude/knowledge/srs-review-points.md', ...workflow('Review independence', 'Verdicts', 'Closing a part — P1 (approval: Afik, 17.10.2026)')],
    conditional: ['.claude/knowledge/data-model.md', '.claude/knowledge/data-model-tables.md', ...workflow('Domains — cross-cutting concerns without their own agent')],
  },
  'DATA ARCHITECT': {
    auto: [agent('data-architect'), CLAUDE],
    instructed: ['decisions.md', '.claude/knowledge/data-model.md#Read map', '.claude/knowledge/data-model.md#Authorization enforcement layer — DECIDED', '.claude/knowledge/data-model.md#Platform rules — database access — DECIDED', ...workflow('Gates', 'Artifacts per feature', 'Closing a part — P1 (approval: Afik, 17.10.2026)')],
    conditional: ['.claude/knowledge/data-model-tables.md', '.claude/knowledge/data-model.md#Schema conventions — DECIDED', '.claude/knowledge/data-model.md#Planned — input from the SRS (nothing below is built)'],
  },
  SPEC: { auto: [agent('spec'), CLAUDE, skill('srs-lookup')], instructed: ['decisions.md', ...workflow('Artifacts per feature')], conditional: [] },
  'ALGORITHM & DATA': {
    auto: [agent('algorithm-data'), CLAUDE, skill('srs-lookup')],
    instructed: ['decisions.md', ...workflow('Verdicts')],
    conditional: ['.claude/knowledge/ai-ml-readiness.md'],
  },
  'TEST ENGINEER': { auto: [agent('test-engineer'), CLAUDE, skill('srs-lookup')], instructed: ['decisions.md', ...workflow('Review independence', 'Standard path', 'Test rules', 'Artifacts per feature')], conditional: [...workflow('Bug-fix path', 'Closing a part — P1 (approval: Afik, 17.10.2026)')] },
  SCOUT: { auto: [agent('scout'), CLAUDE], instructed: [], conditional: [] },
};

export const SHARED = [
  'decisions.md', 'WORKPLAN-HE.md', 'incidents.md', 'debt.md', 'escapes.md', 'noise.md',
  CLAUDE, '.claude/workflow.md', '.claude/learning.md',
];

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
