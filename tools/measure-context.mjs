// Measures what each agent role loads: automatically (definition, CLAUDE.md,
// preloaded skills) and by instruction on every run. Baseline for the agent-system
// slimming (.work/agent-slim/). Run: node tools/measure-context.mjs
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CLAUDE = 'CLAUDE.md';
const skill = (name) => `.claude/skills/${name}/SKILL.md`;
const agent = (name) => `.claude/agents/${name}.md`;

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
    instructed: ['.claude/knowledge/conventions.md', '.claude/knowledge/data-model.md', 'decisions.md'],
    conditional: [skill('rtl-hebrew'), skill('accessibility'), skill('design-system'), skill('ux-copy-he')],
  },
  CRITIC: {
    auto: [agent('critic'), CLAUDE, skill('srs-lookup'), skill('security-craft')],
    instructed: ['.claude/knowledge/srs-review-points.md', '.claude/knowledge/data-model.md'],
    conditional: [],
  },
  'DATA ARCHITECT': {
    auto: [agent('data-architect'), CLAUDE],
    instructed: ['.claude/knowledge/data-model.md'],
    conditional: [],
  },
  SPEC: { auto: [agent('spec'), CLAUDE, skill('srs-lookup')], instructed: [], conditional: [] },
  'ALGORITHM & DATA': {
    auto: [agent('algorithm-data'), CLAUDE, skill('srs-lookup')],
    instructed: [],
    conditional: ['.claude/knowledge/ai-ml-readiness.md'],
  },
  'TEST ENGINEER': { auto: [agent('test-engineer'), CLAUDE, skill('srs-lookup')], instructed: [], conditional: [] },
  SCOUT: { auto: [agent('scout'), CLAUDE], instructed: [], conditional: [] },
};

export const SHARED = [
  'decisions.md', 'WORKPLAN-HE.md', 'incidents.md', 'debt.md', 'escapes.md', 'noise.md',
  'open-questions.md', CLAUDE, '.claude/workflow.md', '.claude/learning.md', '.claude/hooks/guard.js',
];

export function measure(path) {
  try {
    const text = readFileSync(path, 'utf8');
    return { bytes: Buffer.byteLength(text), lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0) };
  } catch {
    return { bytes: 0, lines: 0 };
  }
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
