// The speed of the per-run cleanup (nightly 24.10, run #419: one user at a time, 8-12 s each, timed out the 5 minute step):
// users run DELETE_CONCURRENCY at once, leftovers only within SWEEP_BUDGET_SECONDS, and a user that met a concurrent delete is retried
// once, alone. Split from preview-e2e-cleanup.test.mjs (line budget).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as cleanup from './preview-e2e-cleanup.ts';

const cliText = readFileSync(new URL('./preview-e2e-cleanup-cli.ts', import.meta.url), 'utf8');
const GOOD_FACTS = { dbUser: 'postgres', bypassRls: true, canDeleteAuthUsers: true, nestlyTables: [...cleanup.EXPECTED_NESTLY_TABLES] };
const cands = (n, own = false, tag = 'u') => Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, own }));
const found = (candidates) => ({ candidates });
function stubClient(over = {}) {
  const calls = { deleted: [] };
  const client = {
    preflight: async () => GOOD_FACTS,
    findCandidates: async () => found([]),
    deleteUser: async (id) => {
      calls.deleted.push(id);
      return { 'auth.users': 1 };
    },
    countRunLeftovers: async () => 0,
    ...over,
  };
  return { client, calls };
}
const runIt = async (client, log = () => {}) => cleanup.runCleanup({ client, runId: '4242', runAttempt: '1', log });

test('[cleanup speed] users are deleted DELETE_CONCURRENCY at a time, never more, and each in its own deleteUser call', async () => {
  let running = 0;
  let peak = 0;
  const { client, calls } = stubClient({
    findCandidates: async () => found([...cands(20, true, 'own'), ...cands(20, false, 'old')]),
    deleteUser: async (id) => {
      calls.deleted.push(id);
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return { 'auth.users': 1 };
    },
  });
  const r = await runIt(client);
  assert.equal(peak, cleanup.DELETE_CONCURRENCY);
  assert.equal(new Set(calls.deleted).size, 40);
  assert.equal(calls.deleted.length, 40);
  assert.deepEqual(calls.deleted.slice(0, 20).sort(), cands(20, true, 'own').map((c) => c.id).sort(), "this run's users start first");
  assert.equal(r.deletedOwn, 20);
  assert.equal(r.deletedSwept, 20);
  assert.equal(r.ok, true);
});

test("[cleanup speed] after the time budget no leftover is started (counted as left for the next runs, not a failure); this run's users still are", async () => {
  let clock = 0;
  const { client, calls } = stubClient({
    findCandidates: async () => found([...cands(3, true, 'own'), ...cands(5, false, 'old')]),
    deleteUser: async (id) => {
      calls.deleted.push(id);
      clock += 100_000; // each delete "takes" 100 s
      return { 'auth.users': 1 };
    },
  });
  const r = await cleanup.runCleanup({ client, runId: '4242', runAttempt: '1', log: () => {}, concurrency: 1, budgetSeconds: 240, now: () => clock });
  assert.deepEqual(calls.deleted, ['own0', 'own1', 'own2']);
  assert.equal(r.deletedOwn, 3);
  assert.equal(r.deletedSwept, 0);
  assert.equal(r.deferredSwept, 5);
  assert.equal(r.ok, true);
});

test("[cleanup speed] a budget that runs out never skips this run's own users", async () => {
  let clock = 0;
  const { client, calls } = stubClient({
    findCandidates: async () => found(cands(4, true, 'own')),
    deleteUser: async (id) => {
      calls.deleted.push(id);
      clock += 1_000_000;
      return { 'auth.users': 1 };
    },
  });
  const r = await cleanup.runCleanup({ client, runId: '4242', runAttempt: '1', log: () => {}, concurrency: 2, budgetSeconds: 1, now: () => clock });
  assert.equal(calls.deleted.length, 4);
  assert.equal(r.deferredSwept, 0);
  assert.equal(r.ok, true);
});

for (const code of ['40P01', '55P03', '40001']) {
  test(`[cleanup speed] a user whose transaction meets a concurrent one (${code}) is retried once, alone, and the run succeeds`, async () => {
    const tries = new Map();
    const lines = [];
    const { client, calls } = stubClient({
      findCandidates: async () => found([{ id: 'a', own: true }, { id: 'b', own: true }, { id: 'c', own: false }]),
      deleteUser: async (id) => {
        calls.deleted.push(id);
        tries.set(id, (tries.get(id) ?? 0) + 1);
        if (id === 'a' && tries.get(id) === 1) throw Object.assign(new Error('deadlock with user-id-sentinel'), { code });
        return { 'auth.users': 1 };
      },
    });
    const r = await runIt(client, (l) => lines.push(l));
    assert.deepEqual(calls.deleted, ['a', 'b', 'c', 'a']);
    assert.equal(r.failedUsers, 0);
    assert.equal(r.deletedOwn, 2);
    assert.equal(r.deletedSwept, 1);
    assert.equal(r.ok, true);
    assert.ok(lines.every((l) => !l.includes('sentinel')));
  });
}

test('[cleanup speed] a retried user that fails again is a failure; one that fails with another code is not retried', async () => {
  const { client, calls } = stubClient({
    findCandidates: async () => found([{ id: 'a', own: true }, { id: 'b', own: true }]),
    deleteUser: async (id) => {
      calls.deleted.push(id);
      if (id === 'a') throw Object.assign(new Error('deadlock'), { code: '40P01' });
      throw Object.assign(new Error('restrict'), { code: '23503' });
    },
  });
  const r = await runIt(client);
  assert.deepEqual(calls.deleted, ['a', 'b', 'a']);
  assert.equal(r.failedUsers, 2);
  assert.equal(r.ok, false);
});

test('[cleanup speed] the CLI opens DELETE_CONCURRENCY connections and keeps one transaction per user', () => {
  assert.match(cliText, /postgres\(url, \{ max: DELETE_CONCURRENCY,/);
  assert.match(cliText, /async deleteUser\(id, onAuditLock\): Promise<DeleteCounts> \{\s+return sql\.begin\(async \(tx\) => \{/);
});

// Performance plan E (25.10: the Audit table lock waited on, deletes 19-25 s): the statements are pipelined, the Audit lock comes last.
const deleteUserText = cliText.slice(cliText.indexOf('async deleteUser('), cliText.indexOf('async listPatternUsers('));

test('[cleanup speed E] a user is two pipelined batches: the lock and checks, then every delete; nothing awaited one statement at a time', () => {
  assert.equal([...deleteUserText.matchAll(/await Promise\.all\(/g)].length, 2);
  assert.doesNotMatch(deleteUserText, /await tx`/, 'no statement on its own round trip');
  assert.match(deleteUserText, /await Promise\.all\(steps\.map\(\(\[, query\]\) => query\)\)/);
  // every delete is a step whose label is its table, so its count is reported per table as before
  for (const m of deleteUserText.matchAll(/\['([a-z_.]+)', tx`delete from (?:nestly\.)?([a-z_.]+)/g)) {
    assert.equal(m[1], m[2], m[1]);
  }
});

test('[cleanup speed E] the Audit table lock is taken last: after every other delete, right before nestly.users, guard checked first', () => {
  const at = (s) => deleteUserText.indexOf(s);
  const disable = at('alter table nestly.audit_log disable trigger audit_log_append_only');
  assert.ok(at("guard?.tgenabled !== 'O'") < at('const steps'), 'the guard is checked before anything is deleted');
  assert.ok(at("['identity_link_checks', tx`delete") < disable, 'after the last user delete but nestly.users');
  assert.ok(disable < at("['audit_log', tx`delete from nestly.audit_log where actor_id = ${id}`]"));
  assert.ok(at("['audit_log', tx`") < at('alter table nestly.audit_log enable trigger audit_log_append_only'));
  assert.ok(at('alter table nestly.audit_log enable trigger audit_log_append_only') < at("['users', tx`delete from nestly.users where id = ${id}`]"));
  assert.ok(at("['users', tx`") < at("['auth.users', tx`delete from auth.users"));
  // the lock wait is measured by the server's clock on both sides of the ALTER
  const clocks = [...deleteUserText.matchAll(/clock_timestamp\(\)/g)].map((m) => m.index);
  assert.equal(clocks.length, 2);
  assert.ok(clocks[0] < disable && disable < clocks[1]);
  assert.match(deleteUserText, /onAuditLock\?\.\(after - before\)/);
});

test('[cleanup speed E] each user is timed: transaction ms always, Audit lock ms when the client reports it; failures are timed too', async () => {
  let clock = 0;
  const { client } = stubClient({
    findCandidates: async () => found([{ id: 'a', own: true }, { id: 'b', own: false }, { id: 'c', own: true }]),
    deleteUser: async (id, onAuditLock) => {
      clock += 700;
      if (id === 'a') onAuditLock?.(3.4);
      if (id === 'c') throw Object.assign(new Error('restrict c-sentinel'), { code: '23503' });
      return { 'auth.users': 1 };
    },
  });
  const r = await cleanup.runCleanup({ client, runId: '4242', runAttempt: '1', log: () => {}, concurrency: 1, now: () => clock });
  assert.deepEqual(r.timings, [
    { own: true, ok: true, transactionMs: 700, auditLockMs: 3.4 },
    { own: true, ok: false, transactionMs: 700, auditLockMs: null },
    { own: false, ok: true, transactionMs: 700, auditLockMs: null },
  ]);
});

test('[cleanup speed E] the timing lines carry counts and milliseconds only, with medians and maxima', () => {
  const t = cleanup.formatTimings([
    { own: true, ok: true, transactionMs: 812.4, auditLockMs: 2.6 },
    { own: false, ok: false, transactionMs: 1200, auditLockMs: null },
    { own: true, ok: true, transactionMs: 400, auditLockMs: 10 },
  ]);
  assert.deepEqual(t.perUser, [
    'attempt 1 of 3 (this run): transaction 812 ms; Audit lock 3 ms',
    'attempt 2 of 3 (leftover, failed): transaction 1200 ms; no Audit lock',
    'attempt 3 of 3 (this run): transaction 400 ms; Audit lock 10 ms',
  ]);
  assert.deepEqual(t.totals, ['transactions: 3; median 812 ms, max 1200 ms', 'Audit lock: taken by 2 user(s); median 7 ms, max 10 ms']);
  assert.deepEqual(cleanup.formatTimings([]), { perUser: [], totals: [] });
  assert.deepEqual(cleanup.formatTimings([{ own: true, ok: true, transactionMs: 5, auditLockMs: null }]).totals[1], 'Audit lock: taken by no user');
});

test('[cleanup speed E] the CLI prints the timing lines to the log and the totals to the step summary', () => {
  assert.match(cliText, /formatTimings\(report\.timings\)\.totals\.map/);
  assert.match(cliText, /for \(const t of \[\.\.\.timings\.perUser, \.\.\.timings\.totals\]\) line\(/);
});
