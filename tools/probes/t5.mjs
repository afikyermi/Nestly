#!/usr/bin/env node
// WORKPLAN 7.3, test T5 — nestly-preview only. Applies one throwaway migration with the Supabase CLI, through the
// pooler in session mode (5432), as the throwaway owner role probe_owner — the path decided in 7.3 (option 1, R1).
// The CI leg (GitHub Actions reaching the pooler) is verified with the first real migration.
//
// probe_owner gets a random password inside this process, used for the run and removed afterwards; it is never
// printed. Everything the test creates is dropped at the end.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';
import { PREVIEW_REF, readUrl, checkTarget, scrubber } from '../db-preview.mjs';

const CLI = 'supabase@2.120.0';
const VERSION = '20261011000000';

const raw = readUrl();
const adminUrl = checkTarget(raw);
const pw = crypto.randomBytes(24).toString('base64url');
const scrubAdmin = scrubber(raw, adminUrl);
const scrub = (s) => scrubAdmin(String(s)).split(pw).join('***');
const admin = postgres(raw, { ssl: 'require', prepare: false, max: 1, onnotice: () => {} });

const results = [];
const record = (id, pass, detail) => results.push({ id, pass, detail: scrub(detail) });

const migration = `
create schema probe_t5;
create table probe_t5.items (
  id uuid primary key default gen_random_uuid(),
  -- No FK to auth.users: postgres holds REFERENCES there without grant option, so an owner role cannot get it
  -- (T5 finding, 2026-10-11). That one step falls back to postgres (decision 3).
  owner uuid not null,
  note text
);
alter table probe_t5.items enable row level security;
alter table probe_t5.items force row level security;
create policy items_owner on probe_t5.items for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
`;

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nestly-t5-'));
try {
  await admin.unsafe(`alter role probe_owner password '${pw}'`);
  // The pooler caches role credentials; give it time to see the new password.
  await new Promise((r) => setTimeout(r, 20000));

  fs.mkdirSync(path.join(work, 'supabase', 'migrations'), { recursive: true });
  fs.writeFileSync(path.join(work, 'supabase', 'config.toml'), `project_id = "probe-t5"\n`);
  fs.writeFileSync(path.join(work, 'supabase', 'migrations', `${VERSION}_probe_t5.sql`), migration);

  const u = new URL(raw);
  u.username = `probe_owner.${PREVIEW_REF}`;
  u.password = pw;
  u.port = '5432';
  u.searchParams.set('sslmode', 'require');

  const run = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--yes', CLI, 'db', 'push', '--db-url', u.toString(), '--workdir', work, '--include-all'],
    { input: 'y\n', encoding: 'utf8', timeout: 300000, shell: process.platform === 'win32' },
  );
  const out = `${run.stdout || ''}\n${run.stderr || ''}`.trim().split('\n').slice(-12).join(' | ');
  record('T5 supabase db push as probe_owner :5432', run.status === 0, `exit ${run.status}: ${out}`);

  const [t] = await admin`
    select c.relrowsecurity as rls, c.relforcerowsecurity as forced, pg_get_userbyid(c.relowner) as owner
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'probe_t5' and c.relname = 'items'`;
  record('T5 table owned by probe_owner, RLS enabled and forced', Boolean(t && t.rls && t.forced && t.owner === 'probe_owner'),
    t ? `owner=${t.owner} rls=${t.rls} forced=${t.forced}` : 'table not found');
  const [p] = await admin`select count(*)::int as n from pg_policies where schemaname = 'probe_t5' and policyname = 'items_owner'`;
  record('T5 policy with auth.uid() created', p.n === 1, `policies=${p.n}`);
  const hist = await admin`
    select version from supabase_migrations.schema_migrations where version = ${VERSION}`.catch(() => []);
  record('T5 CLI history table recorded the migration', hist.length === 1, `rows=${hist.length}`);
} catch (e) {
  record('T5 unexpected error', false, e && e.message ? e.message : String(e));
} finally {
  // postgres must be a member of the owner to drop what the owner created (found 2026-10-11: drops failed silently).
  await admin.unsafe('grant probe_owner to postgres with inherit true, set false').catch(() => {});
  await admin.unsafe('drop schema if exists probe_t5 cascade').catch((e) => record('T5 cleanup', false, e.message));
  await admin.unsafe('drop schema if exists supabase_migrations cascade').catch((e) => record('T5 cleanup', false, e.message));
  await admin.unsafe('revoke probe_owner from postgres').catch(() => {});
  await admin.unsafe('alter role probe_owner password null').catch(() => {});
  await admin.end({ timeout: 5 });
  fs.rmSync(work, { recursive: true, force: true });
}

for (const r of results) process.stdout.write(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id} — ${r.detail}\n`);
process.exitCode = results.every((r) => r.pass) ? 0 : 1;
