// F1.6 criterion 19: /api/me answers map to the account state; only an exact "missing" holds the user. Expected values from the spec.
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAccountState } from '../../src/services/api/account-state';

function respond(status: number, body: unknown): void {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchAccountState and recoveryQuestions (F1.6 c19)', () => {
  it('[F1.6 c19] "missing" -> active-missing', async () => {
    respond(200, { state: 'active', recoveryQuestions: 'missing' });
    expect(await fetchAccountState('t')).toBe('active-missing');
  });
  it.each([
    ['"set"', { state: 'active', recoveryQuestions: 'set' }],
    ['absent', { state: 'active' }],
    ['null', { state: 'active', recoveryQuestions: null }],
    ['an unknown string', { state: 'active', recoveryQuestions: 'later' }],
    ['a wrong case', { state: 'active', recoveryQuestions: 'MISSING' }],
    ['a number', { state: 'active', recoveryQuestions: 1 }],
    ['an object', { state: 'active', recoveryQuestions: { missing: true } }],
  ])('[F1.6 c19] recoveryQuestions %s -> active (never a hold)', async (_name, body) => {
    respond(200, body);
    expect(await fetchAccountState('t')).toBe('active');
  });
  it.each(['not json', '', '[1]', 'null'])('[F1.6 c19] an unreadable 200 body %j -> failed', async (body) => {
    respond(200, body);
    expect(await fetchAccountState('t')).toBe('failed');
  });
  it.each([404, 500, 502])('[F1.6 c19] status %i -> failed', async (status) => {
    respond(status, { state: 'active', recoveryQuestions: 'missing' });
    expect(await fetchAccountState('t')).toBe('failed');
  });
  it('[F1.6 c19] recoveryQuestions "missing" on a non-active state is not a hold', async () => {
    respond(200, { state: 'unavailable', recoveryQuestions: 'missing' });
    expect(await fetchAccountState('t')).toBe('unavailable');
  });
});

describe('fetchAccountState and account deletion (I9)', () => {
  it.each([
    ['deletion_scheduled', 'deletion-scheduled'],
    ['deleted', 'deleted'],
  ])('[I9 PG-050] state %s -> %s', async (state, outcome) => {
    respond(200, { state });
    expect(await fetchAccountState('t')).toBe(outcome);
  });
  it('[I9] an unknown deletion word is not trusted', async () => {
    respond(200, { state: 'toString' });
    expect(await fetchAccountState('t')).toBe('failed');
  });
});
