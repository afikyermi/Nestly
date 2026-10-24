import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STAFF_STEPS, checkStaffContext, makeStaffUsers, maskStaffUsers, staffFailureLine } from './preview-e2e-staff.ts';
import { readStaffUser } from '../e2e-preview/support/staff-user.ts';
import { TEST_EMAIL_REGEX } from '../e2e-preview/support/test-user.ts';

const context = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'afikyermi/Nestly', GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '2' };

test('[BR-083 Preview] staff setup refuses other repositories, branches, events and malformed runs', () => {
  assert.doesNotThrow(() => checkStaffContext(context));
  for (const over of [{ GITHUB_ACTIONS:'false' }, { GITHUB_REPOSITORY:'fork/Nestly' }, { GITHUB_REF:'refs/heads/build/i13-code' },
    { GITHUB_EVENT_NAME:'pull_request' }, { GITHUB_RUN_ID:'123%' }, { GITHUB_RUN_ATTEMPT:'1_' }]) {
    assert.throws(() => checkStaffContext({ ...context, ...over }));
  }
});

test('[BR-083 Preview] viewport actors are separate, reserved-pattern, and refused by another run/project', () => {
  const users = makeStaffUsers('12345','2');
  assert.deepEqual(Object.keys(users), ['mobile-375','desktop-1280']);
  assert.notEqual(users['mobile-375'].email, users['desktop-1280'].email);
  for (const user of Object.values(users)) assert.match(user.email, TEST_EMAIL_REGEX);
  const dir = mkdtempSync(join(tmpdir(), 'nestly-staff-test-'));
  try {
    const file = join(dir,'actors.json');
    writeFileSync(file,JSON.stringify(users), { mode:0o600 });
    assert.deepEqual(readStaffUser(file,'mobile-375','12345','2'), users['mobile-375']);
    assert.throws(() => readStaffUser(file,'mobile-375','12346','2'));
    assert.throws(() => readStaffUser(file,'desktop-1280','12345','1'));
    assert.throws(() => readStaffUser(file,'unknown','12345','2'));
    writeFileSync(file,JSON.stringify({ ...users, 'mobile-375':{ ...users['mobile-375'], email:'real@example.com' } }));
    assert.throws(() => readStaffUser(file,'mobile-375','12345','2'));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('[BR-083 Preview] setup creates only a minimal Moderator; credentials are private, exclusive and not logged', () => {
  const cli = readFileSync(new URL('./preview-e2e-staff-cli.ts',import.meta.url),'utf8');
  assert.match(cli, /checkStaffContext\(process.env\)/);
  assert.match(cli, /checkCleanupUrl\(url\)/);
  assert.match(cli, /decidePreflight/);
  assert.match(cli, /values \(\$\{id\}, 'moderator', 'active'\)/);
  assert.match(cli, /values \(\$\{id\}, 'CONTENT_MODERATE', \$\{id\}\)/);
  assert.doesNotMatch(cli, /insert into nestly\.staff_roles|AUDIT_LOG_VIEW|MARKETPLACE_MODERATE|BILLING_FINANCE_MANAGE/);
  assert.match(cli, /mode: 0o600, flag: 'wx'/);
  assert.match(cli, /maskStaffUsers\(users,/);
  assert.doesNotMatch(cli, /console\.|stdout\.write\([^)]*(user\.|password|url)|stderr\.write\([^)]*(user\.|password|url)/);
});

test('[BR-083 Preview] every staff password/recovery answer is masked; control-command injection is escaped', () => {
  const users = makeStaffUsers('12345','2');
  const commands = [];
  maskStaffUsers(users, (command) => commands.push(command));
  assert.deepEqual(commands, Object.values(users).flatMap((u) => [u.password,u.answers.pet,u.answers.nickname].map((s) => `::add-mask::${s}\n`)));
  const injected = [];
  maskStaffUsers({ one:{email:'unused',password:'x%\n::warning::bad\r',answers:{pet:'safe',nickname:'safe'}} }, (c) => injected.push(c));
  assert.equal(injected[0],'::add-mask::x%25%0A::warning::bad%0D\n');
});

test('[BR-083 Preview] Audit removal is scoped after the locked pattern user, within the existing transaction', () => {
  const cli = readFileSync(new URL('./preview-e2e-cleanup-cli.ts',import.meta.url),'utf8');
  const lock = cli.indexOf('and email ~ ${TEST_EMAIL_PATTERN} for update');
  const disable = cli.indexOf('alter table nestly.audit_log disable trigger audit_log_append_only');
  const remove = cli.indexOf('delete from nestly.audit_log where actor_id = ${id}');
  const enable = cli.indexOf('alter table nestly.audit_log enable trigger audit_log_append_only');
  assert.ok(cli.indexOf('return sql.begin') < lock && lock < disable && disable < remove && remove < enable);
  assert.match(cli, /guard\?\.tgenabled !== 'O'/);
  assert.doesNotMatch(cli, /disable trigger all|disable trigger audit_log_no_truncate|session_replication_role/i);
});

test('[BR-083 Preview] failure context: field values and every staff password/recovery answer are redacted', async () => {
  const { redactFailureContext, staffSecrets, FIELD_REDACTED, SECRET_REDACTED } = await import('./preview-e2e-failure-context.ts');
  const users = makeStaffUsers('12345', '2');
  const secrets = staffSecrets(JSON.stringify(users));
  const all = Object.values(users).flatMap((u) => [u.password, u.answers.pet, u.answers.nickname]);
  assert.deepEqual([...secrets].sort(), [...new Set(all)].sort());
  const one = Object.values(users)[0];
  const text = [
    `- heading "Error: expected ${one.password}" [level=1]`,
    `  - textbox "סיסמה": ${one.password}`,
    `  - combobox "שאלה" [expanded]: anything`,
    `call log: fill("${JSON.stringify(one.answers.pet).slice(1, -1)}") and ${one.answers.nickname}`,
    '- button "התחברות"',
  ].join('\n');
  const out = redactFailureContext(text, secrets);
  for (const secret of all) assert.ok(!out.includes(secret), 'a staff secret survived');
  assert.ok(out.includes(`textbox "סיסמה": ${FIELD_REDACTED}`));
  assert.match(out, /combobox "שאלה" \[expanded\]: \[value redacted\]/);
  assert.ok(out.includes(SECRET_REDACTED));
  assert.match(out, /- button "התחברות"/);
  assert.deepEqual(staffSecrets(null), []);
  assert.deepEqual(staffSecrets('not json'), []);
});

test('[BR-083 Preview] staff setup never turns row_security off: the definer Audit triggers raise 42501 under it', () => {
  const cli = readFileSync(new URL('./preview-e2e-staff-cli.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(cli, /row_security\s*=\s*off/);
  assert.match(cli, /decidePreflight/); // postgres must hold BYPASSRLS, so its inserts are never filtered with row_security on
  const cleanup = readFileSync(new URL('./preview-e2e-cleanup-cli.ts', import.meta.url), 'utf8');
  const on = cleanup.indexOf('set local row_security = on');
  const del = cleanup.indexOf('delete from nestly.moderator_permissions where user_id = ${id}');
  const off = cleanup.indexOf('set local row_security = off', on);
  assert.ok(cleanup.indexOf('set local row_security = off') < on && on < del && del < off, 'row_security on only around the keys delete');
  assert.equal(cleanup.split('set local row_security = on').length, 2);
});

test('[BR-083 Preview] a setup failure names its step and code only, never a value', () => {
  const cli = readFileSync(new URL('./preview-e2e-staff-cli.ts', import.meta.url), 'utf8');
  for (const step of STAFF_STEPS) assert.ok(cli.includes(`step = '${step}'`) || step === 'context', `step ${step} is marked`);
  assert.match(cli, /stderr\.write\(staffFailureLine\(step, error\)\)/);
  const pgError = Object.assign(new Error('permission denied for postgres.secret@host user nestly-e2e-1-1-x@example.com'), { code: '42501' });
  assert.equal(staffFailureLine('permission', pgError), 'preview staff: setup failed at step "permission" (code 42501)\n');
  assert.equal(staffFailureLine('context', new Error('staff setup requires the main Preview workflow')),
    'preview staff: setup failed at step "context" (code unknown)\n');
  assert.equal(staffFailureLine('auth user', { code: 'bad code; drop' }), 'preview staff: setup failed at step "auth user" (code unknown)\n');
});
