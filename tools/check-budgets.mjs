// Context/code budgets and prospective .work contracts (P2). No history lookup or mutable merge base.
// Usage: node tools/check-budgets.mjs [--config <path>] [--root <dir>]. Exit 1 on any violation.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const WORK_NAMES = ['spec.md', 'schema.md', 'notes.md'];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const workPath = (rel) => typeof rel === 'string' &&
  /^\.work\/(?:[^/\\*?:\[\]]+\/)+(spec|schema|notes)\.md$/.test(rel) &&
  !rel.split('/').some((part) => part === '.' || part === '..');

function validateWorkConfig(work) {
  if (!object(work) || !object(work.limits) || !positive(work.maxLineBytes) ||
      !Array.isArray(work.historical) || !object(work.exceptions)) return 'invalid workArtifacts config';
  for (const name of WORK_NAMES) {
    const cap = work.limits[name];
    if (!object(cap) || !positive(cap.lines) || !positive(cap.bytes)) return `invalid workArtifacts limit: ${name}`;
  }
  if (work.historical.some((p) => !workPath(p)) || new Set(work.historical).size !== work.historical.length) {
    return 'invalid or duplicate workArtifacts historical path';
  }
  for (const [rel, exception] of Object.entries(work.exceptions)) {
    if (!workPath(rel) || !object(exception)) return `invalid workArtifacts exception: ${rel}`;
    const cap = work.limits[path.posix.basename(rel)];
    if (exception.kind !== 'security' || ['owner', 'reason', 'scope'].some((key) =>
      typeof exception[key] !== 'string' || !exception[key].trim()) ||
      !positive(exception.lines) || !positive(exception.bytes) ||
      exception.lines < cap.lines || exception.bytes < cap.bytes ||
      (exception.lines === cap.lines && exception.bytes === cap.bytes)) {
      return `${rel}: security exception needs owner, reason, scope and raised finite line/byte caps`;
    }
  }
  return null;
}

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
  for (const [rel, budget] of Object.entries(config.alwaysRead)) {
    if (Number.isInteger(budget) && budget >= 0) continue;
    if (!object(budget) || !positive(budget.lines) || !positive(budget.bytes)) return `invalid alwaysRead budget: ${rel}`;
  }
  if (config.workArtifacts !== undefined) return validateWorkConfig(config.workArtifacts);
  return null;
}

// New paths stay prospective after they are committed. Historical exemptions are explicit paths,
// frozen at adoption, not `git diff` results (which would exempt yesterday's new contract).
export function checkWorkBudgets(work, root, files, measurements = []) {
  if (!work) return [];
  const violations = [];
  const historical = new Set(work.historical);
  const candidates = new Set(files.filter(workPath));
  const present = new Set();
  for (const rel of candidates) {
    if (!existsSync(path.join(root, rel))) continue;
    present.add(rel);
    if (historical.has(rel)) continue;
    const buf = readFileSync(path.join(root, rel));
    const lines = countLines(buf);
    const bytes = buf.length;
    const base = work.limits[path.posix.basename(rel)];
    const exception = work.exceptions[rel];
    const cap = exception ?? base;
    measurements.push(`${rel}: ${lines} lines / ${bytes} UTF-8 bytes` +
      (exception ? ` (security exception, owner: ${exception.owner})` : ''));
    if (lines > cap.lines || bytes > cap.bytes) {
      violations.push(`${rel}: ${lines} lines / ${bytes} UTF-8 bytes, caps ${cap.lines} lines / ${cap.bytes} bytes`);
    }
    // CRLF counts two on-disk bytes, but CR is not prose; report the actual physical line.
    const longLine = buf.toString('utf8').split(/\r?\n/).findIndex((line) => Buffer.byteLength(line) > work.maxLineBytes);
    if (longLine >= 0) violations.push(`${rel}:${longLine + 1}: line exceeds ${work.maxLineBytes} UTF-8 bytes; wrap prose, do not fold it`);
    if (exception && lines <= base.lines && bytes <= base.bytes) violations.push(`${rel}: stale security exception (within default caps)`);
  }
  for (const rel of Object.keys(work.exceptions)) {
    if (historical.has(rel) || !present.has(rel)) violations.push(`${rel}: stale security exception (historical or missing contract)`);
  }
  return violations;
}

// tracked: repo-relative paths with "/" separators. Returns the list of violation lines.
export function checkBudgets(config, root, tracked, workFiles = tracked, measurements = []) {
  const violations = [];
  const lineCount = (rel) => countLines(readFileSync(path.join(root, rel)));

  for (const [rel, budget] of Object.entries(config.alwaysRead)) {
    if (!existsSync(path.join(root, rel))) {
      violations.push(`${rel}: missing (listed in alwaysRead)`);
      continue;
    }
    const buf = readFileSync(path.join(root, rel));
    const lines = countLines(buf);
    const cap = object(budget) ? budget : { lines: budget };
    measurements.push(`${rel}: ${lines} lines / ${buf.length} UTF-8 bytes`);
    if (lines > cap.lines || (cap.bytes !== undefined && buf.length > cap.bytes)) {
      violations.push(`${rel}: ${lines} lines / ${buf.length} UTF-8 bytes, budget ${cap.lines} lines` +
        (cap.bytes !== undefined ? ` / ${cap.bytes} bytes` : ''));
    }
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

  return violations.concat(checkWorkBudgets(config.workArtifacts, root, workFiles, measurements));
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
  let workFiles;
  try {
    tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0')
      .filter(Boolean);
    workFiles = config.workArtifacts ? execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.work'],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean) : tracked;
  } catch (error) {
    fail(`git ls-files failed in ${root}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const measurements = [];
  const violations = checkBudgets(config, root, tracked, workFiles, measurements);
  if (violations.length > 0) {
    for (const line of violations) console.error(`budgets: ${line}`);
    process.exit(1);
  }
  for (const line of measurements) console.log(`budgets: ${line}`);
  console.log(
    `budgets: ok (${Object.keys(config.alwaysRead).length} always-read files, ${tracked.length} tracked files checked)`,
  );
}
