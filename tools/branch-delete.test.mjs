// Tests for tools/branch-delete.mjs (guard retro item 5, Afik 18.10.2026): main never; ready/* yes; any other branch only
// when merged at its current tip; odd names refused. The facts are injected; no git or network. Add to `test:tools`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, deleteArgs } from './branch-delete.mjs';

const TIP = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const exists = (over = {}) => ({ exists: true, tip: TIP, ancestorOfMain: false, mergedPrHeads: [], ...over });

test('[item 5] main is never deleted, whatever the facts say', () => {
  for (const b of ['main', 'MAIN', 'refs/heads/main', 'master', 'HEAD']) {
    assert.equal(decide(b, exists({ ancestorOfMain: true, mergedPrHeads: [TIP] })).ok, false, b);
  }
});

test('[item 5] a ready/ candidate is deleted; "ready/" alone and look-alikes are not', () => {
  assert.equal(decide('ready/p4-proof', exists()).ok, true);
  assert.equal(decide('ready/i3/f3-1', exists()).ok, true);
  assert.equal(decide('ready/', exists()).ok, false);
  assert.equal(decide('readyish/x', exists()).ok, false);
  assert.equal(decide('x/ready/y', exists()).ok, false);
});

test('[item 5] another branch only when merged at its current tip', () => {
  assert.equal(decide('feat/x', exists({ ancestorOfMain: true })).ok, true, 'tip in main');
  assert.equal(decide('feat/x', exists({ mergedPrHeads: [TIP] })).ok, true, 'squash-merged PR at exactly this tip');
  assert.equal(decide('feat/x', exists({ mergedPrHeads: [OTHER] })).ok, false, 'merged once, then new commits pushed');
  assert.equal(decide('claude/guard-allowlist-implementation-xcv55m', exists()).ok, false, 'closed without a merge');
});

test('[item 5] a missing branch or an odd name is refused (no option injection, no ranges)', () => {
  assert.equal(decide('feat/x', { exists: false, tip: null, ancestorOfMain: false, mergedPrHeads: [] }).ok, false);
  for (const b of ['--force', '-d', 'a..b', 'a//b', 'a b', 'a;rm', '']) assert.equal(decide(b, exists({ ancestorOfMain: true })).ok, false, b);
});

test('[item 5, CRITIC PR 69 #1] a ref-like name is refused before any lookup: a decoy cannot aim the delete at another ref', () => {
  for (const b of ['refs/heads/feat/unmerged', 'refs/tags/v1', 'heads/feat/x', 'tags/v1', 'remotes/origin/main', 'REFS/heads/x']) {
    assert.equal(decide(b, exists({ ancestorOfMain: true, mergedPrHeads: [TIP] })).ok, false, b);
    assert.throws(() => deleteArgs(b, TIP), /refused/, b);
  }
});

test('[item 5, CRITIC PR 69 #1-2] the delete pushes the full ref name with a lease on the approved tip', () => {
  assert.deepEqual(deleteArgs('ready/p4-proof', TIP), ['push', 'origin', `--force-with-lease=refs/heads/ready/p4-proof:${TIP}`, ':refs/heads/ready/p4-proof']);
  for (const [b, tip] of [['main', TIP], ['feat/x', 'not-a-sha'], ['feat/x/', TIP], ['x.lock', TIP]]) assert.throws(() => deleteArgs(b, tip), /refused/, b);
});
