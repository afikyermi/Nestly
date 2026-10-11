#!/usr/bin/env node
// WORKPLAN 7.3, tests T3 and T4 — nestly-preview only. Throwaway roles probe_server and probe_owner (created in T2).
//
// T3: a custom role connects through the Supabase pooler (transaction mode 6543, session mode 5432).
// T4: the identity transaction of data-model.md rule 3 under transaction pooling — fail-closed, no leak.
//
// The probe roles get a random password generated inside this process, used, and removed at the end
// (ALTER ROLE … PASSWORD NULL). It is never printed or stored. The admin connection comes from .env.preview
// through db-preview.mjs's checks.

import crypto from 'node:crypto';
import postgres from 'postgres';
import { PREVIEW_REF, readUrl, checkTarget, scrubber } from '../db-preview.mjs';

const raw = readUrl();
const adminUrl = checkTarget(raw);
const secrets = [];
const scrubAdmin = scrubber(raw, adminUrl);
const scrub = (s) => secrets.reduce((t, x) => t.split(x).join('***'), scrubAdmin(s));

const results = [];
const record = (id, pass, detail) => {
  results.push({ id, pass, detail: scrub(detail) });
};

function roleUrl(role, port, password) {
  const u = new URL(raw);
  u.username = `${role}.${PREVIEW_REF}`;
  u.password = password;
  u.port = String(port);
  return u.toString();
}

const opts = { ssl: 'require', prepare: false, max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} };
const admin = postgres(raw, opts);

async function errorOf(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e && e.message ? e.message : String(e);
  }
}

async function main() {
  const pwServer = crypto.randomBytes(24).toString('base64url');
  const pwOwner = crypto.randomBytes(24).toString('base64url');
  secrets.push(pwServer, pwOwner);
  await admin.unsafe(`alter role probe_server password '${pwServer}'`);
  await admin.unsafe(`alter role probe_owner password '${pwOwner}'`);

  // ---- T3 ----
  for (const [role, port, pw] of [['probe_server', 6543, pwServer], ['probe_owner', 5432, pwOwner], ['probe_server', 5432, pwServer]]) {
    const c = postgres(roleUrl(role, port, pw), opts);
    try {
      const [row] = await c`select current_user as cu, session_user as su`;
      record(`T3 ${role} :${port}`, row.cu === role && row.su === role, `current_user=${row.cu} session_user=${row.su}`);
    } catch (e) {
      record(`T3 ${role} :${port}`, false, e.message);
    } finally {
      await c.end({ timeout: 5 });
    }
  }

  // ---- T4, through transaction mode (6543) as probe_server ----
  const s = postgres(roleUrl('probe_server', 6543, pwServer), opts);
  try {
    // (i) outside a transaction, with no identity: auth.uid() must not yield a user.
    const err = await errorOf(() => s`select auth.uid()`);
    if (err) {
      record('T4.i no identity → auth.uid() fails', true, `error: ${err}`);
    } else {
      const [r] = await s`select auth.uid() as uid`;
      record('T4.i no identity → auth.uid() fails', r.uid === null, `no error; auth.uid() = ${r.uid} (null means no user, still fail-closed for RLS)`);
    }
    const [plain] = await s`select current_user as cu`;
    record('T4.i role outside a transaction', plain.cu === 'probe_server', `current_user=${plain.cu}`);

    // (ii) + (iv) the identity transaction, claims as a bound parameter with prepare:false.
    const uid = crypto.randomUUID();
    const claims = JSON.stringify({ sub: uid, role: 'authenticated' });
    const inside = await s.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      const [r] = await tx`select current_user as cu, auth.uid() as uid`;
      return r;
    });
    record('T4.ii identity inside the transaction', inside.cu === 'authenticated' && inside.uid === uid,
      `current_user=${inside.cu} auth.uid() matches=${inside.uid === uid}`);

    // (iii) afterwards, across several transactions: no role or claims leak.
    let leaked = false;
    let seen = '';
    for (let i = 0; i < 8; i++) {
      const [r] = await s`select current_user as cu, coalesce(current_setting('request.jwt.claims', true), '') as claims`;
      if (r.cu !== 'probe_server' || r.claims !== '') {
        leaked = true;
        seen = `current_user=${r.cu} claims=${r.claims ? 'set' : 'empty'}`;
      }
    }
    record('T4.iii no leak after commit (8 transactions)', !leaked, leaked ? seen : 'probe_server, empty claims every time');

    // (v) a failed transaction rolls the identity back too.
    await errorOf(() => s.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      throw new Error('deliberate rollback');
    }));
    const [after] = await s`select current_user as cu, coalesce(current_setting('request.jwt.claims', true), '') as claims`;
    record('T4.v no leak after rollback', after.cu === 'probe_server' && after.claims === '', `current_user=${after.cu} claims=${after.claims ? 'set' : 'empty'}`);

    // (vi) the server role cannot become a role it was not granted.
    const escalate = await errorOf(() => s.begin(async (tx) => { await tx`set local role postgres`; }));
    record('T4.vi cannot SET ROLE postgres', Boolean(escalate), escalate ? `error: ${escalate}` : 'SET ROLE postgres succeeded');
  } catch (e) {
    record('T4 unexpected error', false, e.message);
  } finally {
    await s.end({ timeout: 5 });
  }
}

try {
  await main();
} catch (e) {
  record('probe setup', false, e && e.message ? e.message : String(e));
} finally {
  await admin.unsafe('alter role probe_server password null').catch(() => {});
  await admin.unsafe('alter role probe_owner password null').catch(() => {});
  await admin.end({ timeout: 5 });
}

for (const r of results) process.stdout.write(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id} — ${r.detail}\n`);
process.exitCode = results.every((r) => r.pass) ? 0 : 1;
