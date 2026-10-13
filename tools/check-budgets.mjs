// Line budgets (agent-slim stage 5): files agents read on every run, and code files outside the ESLint caps.
// Usage: node tools/check-budgets.mjs [--config <path>] [--root <dir>]. Exit 1 on any violation.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);

// Number of "\n" characters, plus one if the content does not end with "\n"; empty is 0.
export function countLines(buf) {
  if (buf.length === 0) return 0;
  let n = 0;
  for (const byte of buf) if (byte === 10) n++;
  return buf[buf.length - 1] === 10 ? n : n + 1;
}

// Only "*" (within a segment) and "**" (across segments) are supported.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function validateConfig(config) {
  if (typeof config !== 'object' || config === null) return 'config must be a JSON object';
  if (typeof config.alwaysRead !== 'object' || config.alwaysRead === null) return 'config lacks "alwaysRead"';
  if (typeof config.code !== 'object' || config.code === null || !Number.isInteger(config.code.max)) {
    return 'config lacks "code.max"';
  }
  return null;
}

// tracked: repo-relative paths with "/" separators. Returns the list of violation lines.
export function checkBudgets(config, root, tracked) {
  const violations = [];
  const lineCount = (rel) => countLines(readFileSync(path.join(root, rel)));

  for (const [rel, budget] of Object.entries(config.alwaysRead)) {
    if (!existsSync(path.join(root, rel))) {
      violations.push(`${rel}: missing (listed in alwaysRead)`);
      continue;
    }
    const lines = lineCount(rel);
    if (lines > budget) violations.push(`${rel}: ${lines} lines, budget ${budget}`);
  }

  const { max, testMax = max, exclude = [], exceptions = {} } = config.code;
  const excluded = exclude.map(globToRegExp);
  const trackedSet = new Set(tracked);

  for (const [rel, exception] of Object.entries(exceptions)) {
    if (!trackedSet.has(rel)) {
      violations.push(`${rel}: stale exception (file is not tracked)`);
      continue;
    }
    const base = /\.(test|spec)\./.test(path.posix.basename(rel)) ? testMax : max;
    if (lineCount(rel) <= base) violations.push(`${rel}: stale exception (within the default cap of ${base})`);
  }

  for (const rel of tracked) {
    if (!CODE_EXT.has(path.posix.extname(rel))) continue;
    if (excluded.some((re) => re.test(rel))) continue;
    if (!existsSync(path.join(root, rel))) continue;
    const isTest = /\.(test|spec)\./.test(path.posix.basename(rel));
    const cap = exceptions[rel]?.max ?? (isTest ? testMax : max);
    const lines = lineCount(rel);
    if (lines > cap) violations.push(`${rel}: ${lines} lines, cap ${cap}`);
  }

  return violations;
}

function parseArgs(argv) {
  const opts = { config: null, root: process.cwd() };
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--config') opts.config = argv[i + 1];
    else if (argv[i] === '--root') opts.root = argv[i + 1];
  }
  return opts;
}

function fail(message) {
  console.error(`budgets: ${message}`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parseArgs(process.argv.slice(2));
  const root = path.resolve(opts.root);
  const configPath = path.resolve(opts.config ?? path.join(root, 'tools', 'line-budgets.json'));
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    fail(`cannot read config ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const invalid = validateConfig(config);
  if (invalid) fail(invalid);

  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0')
      .filter(Boolean);
  } catch (error) {
    fail(`git ls-files failed in ${root}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const violations = checkBudgets(config, root, tracked);
  if (violations.length > 0) {
    for (const line of violations) console.error(`budgets: ${line}`);
    process.exit(1);
  }
  console.log(
    `budgets: ok (${Object.keys(config.alwaysRead).length} always-read files, ${tracked.length} tracked files checked)`,
  );
}
