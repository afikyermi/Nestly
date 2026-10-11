#!/usr/bin/env node
// WORKPLAN 7.3, probes P1–P4 from .work/infra-7.3/owner-role.md — nestly-preview only, throwaway objects.
//
// P1 what an owner role inherits from `authenticated` · P2 postgres adds the auth.users FK to an owner's table ·
// P3 `TO authenticated` policies bind the owner role · P4 a SECURITY DEFINER function owned by the owner returns
// the caller's auth.uid(). Bonus: deleting the Auth user cascades through the anchor.
// Probe passwords are random, never printed, removed at the end; everything created is dropped.

import crypto from 'node:crypto';
import postgres from 'postgres';
import { PREVIEW_REF, readUrl, checkTarget, scrubber } from '../db-preview.mjs';

const raw = readUrl();
const adminUrl = checkTarget(raw);
const pwOwner = crypto.randomBytes(24).toString('base64url');
const pwServer = crypto.randomBytes(24).toString('base64url');
const scrubAdmin = scrubber(raw, adminUrl);
const scrub = (s) => [pwOwner, pwServer].reduce((t, x) => t.split(x).join('***'), scrubAdmin(String(s)));
const opts = { ssl: 'require', prepare: false, max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} };
const admin = postgres(raw, opts);
const as = (role, port, pw) => {
  const u = new URL(raw);
  u.username = `${role}.${PREVIEW_REF}`;
  u.password = pw;
  u.port = String(port);
  return postgres(u.toString(), opts);
};

// The pooler caches role credentials, so a fresh password can be refused for a while: retry the first query.
async function ready(client, label) {
  for (let i = 0; i < 12; i++) {
    try {
      await client`select 1`;
      return;
    } catch (e) {
      if (!/password authentication failed/.test(e.message) || i === 11) throw new Error(`${label}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}

const results = [];
const record = (id, pass, detail) => results.push({ id, pass, detail: scrub(detail) });
const info = [];

let owner;
let server;
let userId = null;
try {
  await admin.unsafe('grant authenticated to probe_owner with inherit true, set false');
  await admin.unsafe(`alter role probe_owner password '${pwOwner}'`);
  await admin.unsafe(`alter role probe_server password '${pwServer}'`);
  await new Promise((r) => setTimeout(r, 20000)); // the pooler caches role credentials

  // ---- P1 ----
  const [p1] = await admin`
    select has_table_privilege('probe_owner', 'auth.users', 'select') as users_select,
      (select count(*)::int from pg_class where relowner = 'authenticated'::regrole) +
      (select count(*)::int from pg_proc where proowner = 'authenticated'::regrole) +
      (select count(*)::int from pg_namespace where nspowner = 'authenticated'::regrole) as owned_by_authenticated`;
  record('P1 owner cannot select auth.users', p1.users_select === false, `has_table_privilege=${p1.users_select}`);
  record('P1 nothing owned by authenticated', p1.owned_by_authenticated === 0, `objects=${p1.owned_by_authenticated}`);
  const privs = await admin`
    select table_schema, count(*)::int as tables, string_agg(distinct privilege_type, ',' order by privilege_type) as privs
    from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema not in ('auth', 'pg_catalog', 'information_schema')
    group by table_schema order by table_schema`;
  info.push(`P1 authenticated's table privileges outside auth: ${privs.length ? privs.map((r) => `${r.table_schema}(${r.tables} tables: ${r.privs})`).join('; ') : 'none'}`);

  // ---- P2 ----
  owner = as('probe_owner', 5432, pwOwner);
  await ready(owner, 'probe_owner');
  const g = await admin.unsafe('grant probe_owner to postgres with inherit true, set false').then(() => null, (e) => e.message);
  record('P2 grant probe_owner to postgres', g === null, g || 'accepted');
  await owner.unsafe(`
    create schema probe_p;
    create table probe_p.anchor (id uuid primary key);
    create table probe_p.items (
      id uuid primary key default gen_random_uuid(),
      owner uuid not null references probe_p.anchor(id) on delete cascade,
      note text);
    alter table probe_p.items enable row level security;
    alter table probe_p.items force row level security;
    create policy items_owner on probe_p.items for select to authenticated using (owner = auth.uid());
    grant usage on schema probe_p to authenticated;
    grant select on probe_p.items to authenticated;
    create function probe_p.whoami() returns uuid language sql stable security definer set search_path = ''
      as 'select auth.uid()';
    revoke execute on function probe_p.whoami() from public;
    grant execute on function probe_p.whoami() to authenticated;`).simple();
  const fk = await admin
    .unsafe('alter table probe_p.anchor add constraint anchor_auth_user_fk foreign key (id) references auth.users(id) on delete cascade')
    .then(() => null, (e) => e.message);
  record('P2 postgres adds the FK to auth.users', fk === null, fk || 'created');
  const [own] = await admin`select pg_get_userbyid(relowner) as owner from pg_class where oid = 'probe_p.anchor'::regclass`;
  record('P2 anchor still owned by probe_owner', own.owner === 'probe_owner', `owner=${own.owner}`);
  const ddl = await owner.unsafe('alter table probe_p.anchor add column created_at timestamptz default now()').then(() => null, (e) => e.message);
  record('P2 owner DDL after the FK', ddl === null, ddl || 'alter table worked');

  // ---- P3 ----
  const [u] = await admin`
    insert into auth.users (id, instance_id, aud, role, email)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'probe-p3@example.invalid')
    returning id`;
  userId = u.id;
  await admin`insert into probe_p.anchor (id) values (${userId})`;
  await admin`insert into probe_p.items (owner, note) values (${userId}, 'p3')`;
  const none = await owner`select count(*)::int as n from probe_p.items`;
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
  const mine = await owner.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    return tx`select count(*)::int as n from probe_p.items`;
  });
  record('P3 owner with no claims sees 0 rows', none[0].n === 0, `rows=${none[0].n}`);
  record('P3 owner with claims sees the row', mine[0].n === 1, `rows=${mine[0].n}`);

  // ---- P4 ----
  server = as('probe_server', 6543, pwServer);
  await ready(server, 'probe_server');
  const who = await server.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    const [r] = await tx`select probe_p.whoami() as uid`;
    return r.uid;
  });
  record('P4 definer function returns the caller', who === userId, `matches=${who === userId}`);

  // ---- bonus: deleting the Auth user cascades through the anchor ----
  await admin`delete from auth.users where id = ${userId}`;
  const [left] = await admin`select (select count(*)::int from probe_p.anchor) + (select count(*)::int from probe_p.items) as n`;
  record('cascade: deleting the Auth user empties anchor and items', left.n === 0, `rows left=${left.n}`);
  if (left.n === 0) userId = null;
} catch (e) {
  record('unexpected error', false, e && e.message ? e.message : String(e));
} finally {
  if (owner) await owner.end({ timeout: 5 });
  if (server) await server.end({ timeout: 5 });
  await admin.unsafe('drop schema if exists probe_p cascade').catch(() => {});
  if (userId) await admin`delete from auth.users where id = ${userId}`.catch(() => {});
  await admin.unsafe('revoke probe_owner from postgres').catch(() => {});
  await admin.unsafe('revoke authenticated from probe_owner').catch(() => {});
  await admin.unsafe('alter role probe_owner password null').catch(() => {});
  await admin.unsafe('alter role probe_server password null').catch(() => {});
  await admin.end({ timeout: 5 });
}

for (const r of results) process.stdout.write(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id} — ${r.detail}\n`);
for (const i of info) process.stdout.write(`INFO  ${i}\n`);
process.exitCode = results.every((r) => r.pass) ? 0 : 1;
