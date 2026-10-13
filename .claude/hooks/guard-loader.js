#!/usr/bin/env node
// Loads the PreToolUse guard — decisions.md (2026-10-13, "Agent-system slimming"), spec stage1-guard.md (b, F4).
//
// Usage: node guard-loader.js <role>   (the guard's own CLI; the role is read from process.argv by the guard)
//
// Runs main() of ./guard.js. If guard.js does not load (missing, syntax error, throws at load, no main), it runs
// the last FETCHED main — `git show origin/main:.claude/hooks/guard.js` — compiled in memory, never from a file.
// That can be older than main's tip. If that fails too: exit 2, "guard could not load".
//
// Fails closed: every path that is not the guard's own process.exit(0) ends in exit 2, never 1.
// A guard that loads and blocks wrongly is not detected here; that is what its tests are for.

'use strict';

const fail = (what) => {
  try {
    process.stderr.write(`Blocked by .claude/hooks/guard-loader.js: ${what}\n`);
  } finally {
    process.exit(2);
  }
};
process.on('uncaughtException', () => fail('guard error'));
process.on('unhandledRejection', () => fail('guard error'));

// The guard ends with process.exit. If the process ends any other way, it ends blocked.
let exited = false;
const realExit = process.exit;
process.exit = (code) => {
  exited = true;
  return realExit.call(process, code);
};
process.on('exit', () => {
  if (!exited) process.exitCode = 2;
});

const path = require('path');
const Module = require('module');
const { execFileSync } = require('child_process');

const GUARD = path.join(__dirname, 'guard.js');
const ROOT = path.resolve(__dirname, '..', '..');

function loadLocal() {
  const m = require(GUARD);
  return typeof m.main === 'function' ? m.main : null;
}

function loadFallback() {
  const src = execFileSync('git', ['show', 'origin/main:.claude/hooks/guard.js'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const mod = new Module(GUARD, module);
  mod.filename = GUARD;
  mod.paths = Module._nodeModulePaths(__dirname);
  mod._compile(src, GUARD);
  return typeof mod.exports.main === 'function' ? mod.exports.main : null;
}

function load() {
  for (const loader of [loadLocal, loadFallback]) {
    try {
      const main = loader();
      if (main) return main;
    } catch {
      // try the next source
    }
  }
  return null;
}

try {
  const main = load();
  if (!main) fail('guard could not load');
  else main();
} catch {
  fail('guard error');
}
