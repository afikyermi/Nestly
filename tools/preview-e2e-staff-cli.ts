// Trusted-main, CI-only Preview fixture. Fixed logs only, plus Actions secret-mask control commands.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import postgres from 'postgres';
import { checkCleanupUrl, decidePreflight, errorCode } from './preview-e2e-cleanup.ts';
import { checkStaffContext, makeStaffUsers, maskStaffUsers } from './preview-e2e-staff.ts';

async function main(): Promise<void> {
  checkStaffContext(process.env);
  const url = process.env['PREVIEW_DB_ADMIN_URL'];
  const checked = checkCleanupUrl(url);
  if (!checked.ok || url === undefined) throw new Error('Preview database guard refused setup');
  const file = process.env['PREVIEW_E2E_STAFF_FILE'];
  const runnerTemp = process.env['RUNNER_TEMP'];
  if (file === undefined || !isAbsolute(file) || runnerTemp === undefined ||
      resolve(file) !== resolve(join(runnerTemp, 'preview-e2e-staff.json'))) throw new Error('private runner-temp staff file path missing');
  const users = makeStaffUsers(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? '');
  const sql = postgres(url, { max: 1, ssl: 'require', onnotice: () => undefined, connect_timeout: 20, idle_timeout: 5 });
  try {
    const [facts] = await sql<{ db_user: string; bypassrls: boolean; can_delete: boolean; tables: string[] }[]>`
      select current_user::text as db_user,
        (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls,
        has_table_privilege('auth.users', 'DELETE') as can_delete,
        (select array_agg(c.relname::text order by c.relname::text) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='nestly' and c.relkind in ('r','p')) as tables`;
    if (facts === undefined || !decidePreflight({ dbUser: facts.db_user, bypassRls: facts.bypassrls,
      canDeleteAuthUsers: facts.can_delete, nestlyTables: facts.tables }).ok) throw new Error('staff preflight refused setup');
    // One transaction: either both independent viewport actors exist or neither does.
    await sql.begin(async (tx) => {
      await tx`set local row_security = off`;
      await tx`set local statement_timeout = '30s'`;
      for (const user of Object.values(users)) {
        const id = randomUUID();
        await tx`insert into auth.users
          (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
           email_change_token_current, phone_change, phone_change_token, reauthentication_token,
           email_change_confirm_status, is_sso_user, is_anonymous)
          values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${user.email},
           extensions.crypt(${user.password}, extensions.gen_salt('bf')), now(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '',
           '', '', '', '', 0, false, false)`;
        await tx`insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
          values (${randomUUID()}, ${id}, ${id}, ${sql.json({ sub: id, email: user.email, email_verified: true, phone_verified: false })}, 'email', now(), now())`;
        await tx`insert into nestly.users (id, account_type, status) values (${id}, 'moderator', 'active')`;
        await tx`insert into nestly.moderator_permissions (user_id, permission_key, granted_by)
          values (${id}, 'CONTENT_MODERATE', ${id})`;
      }
    });
    writeFileSync(file, JSON.stringify(users), { mode: 0o600, flag: 'wx' });
    maskStaffUsers(users, (command) => { process.stdout.write(command); });
    process.stdout.write('preview staff: 2 temporary Moderators prepared\n');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

try { await main(); } catch (error) {
  process.stderr.write(`preview staff: setup failed (code ${errorCode(error)})\n`);
  process.exitCode = 1;
}
