// Cleanup CLI of the `preview-e2e` workflow (.work/preview-e2e/schema.md, DR-E1 option 1).
//
//   node tools/preview-e2e-cleanup-cli.ts
//
// Modes (parseMode): on workflow_run, the per-run cleanup below. On workflow_dispatch, CLEANUP_MODE = dry-run (the preflight,
// then the count of pattern users and their age range; nothing deleted) - Afik 17.10.2026, "Preview cleanup" (c). The manual
// `backlog` mode was removed (audit B1).
//
// Reads PREVIEW_DB_ADMIN_URL (postgres@nestly-preview through the session pooler), TARGET_RUN_ID and TARGET_RUN_ATTEMPT (the
// run being cleaned up: workflow_run's id and attempt) from the environment. The URL is checked before anything connects.
// The credential bypasses RLS: it is read in this one step of the preview-e2e-cleanup workflow (main's code, run on
// workflow_run), plus the trusted-main staff setup step approved by Afik 23.10. It never prints the URL, an email, an id or a
// password; it prints counts and milliseconds. Exit 0 only when every user is gone and none of this run remains.

import { appendFileSync } from 'node:fs';
import postgres from 'postgres';
import {
  DELETE_CONCURRENCY,
  MAX_SWEEP_PER_RUN,
  SWEEP_AGE_HOURS,
  TEST_EMAIL_PATTERN,
  checkCleanupUrl,
  errorCode,
  formatTimings,
  parseMode,
  runBacklog,
  runCleanup,
  runEmailPrefix,
  type BacklogClient,
  type BacklogReport,
  type Candidate,
  type CleanupClient,
  type CleanupReport,
  type DeleteCounts,
  type PatternUser,
} from './preview-e2e-cleanup.ts';

function line(text: string): void {
  process.stdout.write(`${text}\n`);
}

function stop(reason: string): never {
  process.stdout.write(`::error::preview-e2e-cleanup: ${reason}\n`);
  process.exit(1);
}

/**
 * Real client: up to DELETE_CONCURRENCY connections, so that many users' transactions run at once (runCleanup); each user is still one
 * transaction on one connection, its statements pipelined (performance plan E). Statements are the ones in schema.md, leaf first.
 */
function createClient(url: string): { client: CleanupClient & BacklogClient; close: () => Promise<void> } {
  const sql = postgres(url, { max: DELETE_CONCURRENCY, ssl: 'require', onnotice: () => undefined, connect_timeout: 20, idle_timeout: 5 });
  const client: CleanupClient & BacklogClient = {
    async preflight() {
      const rows = await sql<{ db_user: string; bypassrls: boolean | null; can_delete: boolean | null; tables: string[] }[]>`
        select current_user::text as db_user,
               (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls,
               has_table_privilege('auth.users', 'DELETE') as can_delete,
               (select coalesce(array_agg(c.relname::text order by c.relname::text), '{}')
                  from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'nestly' and c.relkind in ('r', 'p')) as tables`;
      const row = rows[0];
      if (!row) throw new Error('no preflight row');
      return { dbUser: row.db_user, bypassRls: row.bypassrls, canDeleteAuthUsers: row.can_delete, nestlyTables: row.tables };
    },
    async findCandidates(runId, runAttempt) {
      const prefix = runEmailPrefix(runId, runAttempt);
      const own = await sql<{ id: string }[]>`
        select id::text as id
          from auth.users
         where email ~ ${TEST_EMAIL_PATTERN} and email like ${prefix}
         order by created_at asc, id asc`;
      const swept = await sql<{ id: string }[]>`
        select id::text as id
          from auth.users
         where email ~ ${TEST_EMAIL_PATTERN}
           and not (email like ${prefix})
           and created_at < now() - make_interval(hours => ${SWEEP_AGE_HOURS})
         order by created_at asc, id asc
         limit ${MAX_SWEEP_PER_RUN}`;
      const candidates: Candidate[] = [
        ...own.map((r) => ({ id: r.id, own: true })),
        ...swept.map((r) => ({ id: r.id, own: false })),
      ];
      return { candidates };
    },
    async deleteUser(id, onAuditLock): Promise<DeleteCounts> {
      return sql.begin(async (tx) => {
        // Round trip 1: the settings, the row lock on the pattern user, and whether it has Audit entries (with the guard's state).
        // postgres.js pipelines queries on the transaction's connection: it sends them without waiting, the server runs them in order.
        const [, , , locked, audit, guards] = await Promise.all([
          tx`set local row_security = off`,
          tx`set local lock_timeout = '5s'`,
          tx`set local statement_timeout = '30s'`,
          tx`select id from auth.users where id = ${id} and email ~ ${TEST_EMAIL_PATTERN} for update`,
          tx`select 1 from nestly.audit_log where actor_id = ${id} limit 1`,
          tx<{ tgenabled: string }[]>`select tgenabled from pg_trigger
            where tgrelid = 'nestly.audit_log'::regclass and tgname = 'audit_log_append_only'`,
        ]);
        const counts: DeleteCounts = {};
        if (locked.length === 0) return counts; // already gone, or no longer matches: nothing to do
        const hasAudit = audit.length > 0;
        const [guard] = guards;
        if (hasAudit && guard?.tgenabled !== 'O') throw new Error('Audit append-only guard is not enabled');
        // Round trip 2: every delete below, pipelined, in this order (a step without a table is a setting). The first error makes the
        // rest fail in the aborted transaction, and sql.begin rolls it all back. Only a connection's first user waits on each statement
        // (postgres.js prepares a statement once per connection, and pipelines only prepared ones).
        const steps: [string | null, postgres.PendingQuery<postgres.Row[]>][] = [
          ['recovery_throttles', tx`delete from nestly.recovery_throttles t using nestly.recovery_answers a
                    where a.user_id = ${id} and t.subject_kind = 'handle' and t.subject_hash = a.email_handle`],
          ['recovery_events', tx`delete from nestly.recovery_events where user_id = ${id}`],
          ['legal_consents', tx`delete from nestly.legal_consents where user_id = ${id}`],
          ['recovery_answers', tx`delete from nestly.recovery_answers where user_id = ${id}`],
          ['tracker_events', tx`delete from nestly.tracker_events where user_id = ${id}`],
          ['cycle_entries', tx`delete from nestly.cycle_entries where user_id = ${id}`],
          ['children', tx`delete from nestly.children where user_id = ${id}`],
          ['journey_contexts', tx`delete from nestly.journey_contexts where user_id = ${id}`],
          // Notifications and their preferences reference only users (ON DELETE CASCADE); search counts likewise. Nothing references them.
          ['notifications', tx`delete from nestly.notifications where recipient_id = ${id} or actor_id = ${id}`],
          ['notification_preferences', tx`delete from nestly.notification_preferences where user_id = ${id}`],
          ['friend_content_notification_preferences', tx`delete from nestly.friend_content_notification_preferences where user_id = ${id} or friend_id = ${id}`],
          // F3.0b (schema-b.md "Cleanup tool"). P(U) = U's posts (named, or anonymous through post_authors); C(U) = comments by U, on P(U),
          // or replying to U's. Reports first: no open report survives into a cascade, so reports_open_target_check never fires.
          // I8: a staff member's views of reported messages first (others' views go with the reports below, by cascade).
          ['reported_message_views', tx`delete from nestly.reported_message_views where viewer_id = ${id}`],
          // I10: a staff member's views of reported Private Group content likewise (others' views go with the reports below, by cascade).
          ['private_group_content_views', tx`delete from nestly.private_group_content_views where viewer_id = ${id}`],
          // I14 completion B: a staff member's openings of reported comments and of profiles (others' go with the report or the profile's account by
          // cascade), and the enforcement history that names the user as author or decider (it names a report: SET NULL; users: RESTRICT).
          ['reported_comment_views', tx`delete from nestly.reported_comment_views where viewer_id = ${id}`],
          ['profile_staff_views', tx`delete from nestly.profile_staff_views where viewer_id = ${id} or target_id = ${id}`],
          ['enforcement_records', tx`delete from nestly.enforcement_records where user_id = ${id} or decided_by = ${id}`],
          ['reports', tx`delete from nestly.reports
                    where reporter_id = ${id} or reported_user_id = ${id} or handled_by = ${id}
                       or message_id in (select id from nestly.messages
                                          where conversation_id in (select id from nestly.conversations where user_a = ${id} or user_b = ${id}))
                       or post_id in (select id from nestly.posts
                                       where author_id = ${id} or id in (select post_id from nestly.post_authors where author_id = ${id}))
                       or comment_id in (select id from nestly.comments
                                          where author_id = ${id}
                                             or post_id in (select id from nestly.posts
                                                             where author_id = ${id} or id in (select post_id from nestly.post_authors where author_id = ${id}))
                                             or parent_id in (select id from nestly.comments where author_id = ${id}))
                       or post_id in (select id from nestly.posts
                                       where group_id in (select group_id from nestly.group_members where user_id = ${id} and role = 'owner'))
                       or comment_id in (select id from nestly.comments
                                          where group_id in (select group_id from nestly.group_members where user_id = ${id} and role = 'owner'))
                       or listing_id in (select id from nestly.marketplace_listings where owner_id = ${id})`],
          // I14 completion: report_escalations and report_openings go with these reports by cascade. A temporary staff Moderator's rows on
          // reports it did not file (handled_by above; opened_by, escalated_by: users RESTRICT) go here, or its user delete fails 23503.
          ['report_openings', tx`delete from nestly.report_openings where opened_by = ${id}`],
          ['report_escalations', tx`delete from nestly.report_escalations where escalated_by = ${id}`],
          ['group_staff_views', tx`delete from nestly.group_staff_views where viewer_id = ${id}`],
          // reports.thread_post_id of another user's report on this user's post goes SET NULL with the post.
          ['reactions', tx`delete from nestly.reactions where id in (select reaction_id from nestly.reaction_owners where user_id = ${id})`],
          // F3.0a: a user's hides, then their comments (replies go with them), then every post they wrote; the cascade takes others'
          // hides, likes and separation rows, and others' shares of a deleted post keep their row (SET NULL).
          // I5: the user's Stories and profile photo, then every image they uploaded (reviews and training candidates go by cascade; staff
          // decisions on others' images keep their row: decided_by is SET NULL). media_training_samples and media_training_events name no user and are never written here.
          // The files in storage are not deleted here: the daily job removes files that have no row.
          // Monetization (I13): the user's own paid events and every event on the user's promotions, then the promotions (before the posts and
          // listings they name), then the user's simulated payments (a promotion references its payment). promotion_plans is configuration.
          ['promotion_events', tx`delete from nestly.promotion_events
                    where viewer_id = ${id} or promotion_id in (select id from nestly.promotions where owner_id = ${id})`],
          // §11.4: the monthly summaries of the user's promotions (the retention job writes them; a summary of a deleted promotion keeps
          // its row without it, SET NULL — deleted here so a test user leaves nothing behind). promotion_settings is configuration.
          ['promotion_monthly_summaries', tx`delete from nestly.promotion_monthly_summaries where promotion_id in (select id from nestly.promotions where owner_id = ${id})`],
          ['promotions', tx`delete from nestly.promotions where owner_id = ${id}`],
          ['promotion_payments', tx`delete from nestly.promotion_payments where payer_id = ${id}`],
          // Usage events (I13 follow-up): the user's views of Professionals and the views of the user's professional profile, then the
          // user's own usage counters.
          ['professional_views', tx`delete from nestly.professional_views where viewer_id = ${id} or professional_id = ${id}`],
          ['usage_events', tx`delete from nestly.usage_events where user_id = ${id}`],
          ['stories', tx`delete from nestly.stories where author_id = ${id}`],
          ['profile_photos', tx`delete from nestly.profile_photos where user_id = ${id}`],
          ['media_assets', tx`delete from nestly.media_assets where owner_id = ${id}`],
          // Marketplace (I12): the user's listings (their reports went above; others' conversations about one keep their row, listing_id SET
          // NULL). sponsored_products are written by the Admin only (a test user is never staff): never touched.
          ['marketplace_listings', tx`delete from nestly.marketplace_listings where owner_id = ${id}`],
          ['post_hides', tx`delete from nestly.post_hides where user_id = ${id}`],
          ['comments', tx`delete from nestly.comments
                    where author_id = ${id}
                       or (author_id is null and post_id in (select post_id from nestly.post_authors where author_id = ${id}))`],
          ['posts', tx`delete from nestly.posts
                    where author_id = ${id} or id in (select post_id from nestly.post_authors where author_id = ${id})`],
          // Groups (I10): the Groups the user owns go with everything in them (members and their copies, requests, invitations, blocks, modes,
          // recommendations, and every post, comment and like in them, by cascade; their reports were deleted above). Then the user's own rows
          // in other Groups; staff answers on others' requests and blocks keep their row (decided_by, banned_by and created_by are SET NULL).
          ['groups', tx`delete from nestly.groups where id in (select group_id from nestly.group_members where user_id = ${id} and role = 'owner')`],
          ['group_suggestions', tx`delete from nestly.group_suggestions where sender_id = ${id} or recipient_id = ${id}`],
          ['group_invitations', tx`delete from nestly.group_invitations where inviter_id = ${id} or invitee_id = ${id}`],
          ['group_join_requests', tx`delete from nestly.group_join_requests where user_id = ${id}`],
          // I10 completion C: the Group enforcement history naming the user (as the member or as the manager who acted; others' records of a
          // deleted manager keep their row by SET NULL, but a test user's are deleted here). group_highlights names no user: it goes with its
          // post or Group by cascade.
          ['group_member_enforcements', tx`delete from nestly.group_member_enforcements where user_id = ${id} or actor_id = ${id}`],
          ['group_bans', tx`delete from nestly.group_bans where user_id = ${id}`],
          ['group_notification_preferences', tx`delete from nestly.group_notification_preferences where user_id = ${id}`],
          ['group_access', tx`delete from nestly.group_access where user_id = ${id}`],
          ['group_members', tx`delete from nestly.group_members where user_id = ${id}`],
          // Professionals (I11): reviews by or of the user, Follows either way, the user's articles and Offer Help (a conversation that came
          // from one goes with it, by cascade; requests of others on the user's posts lost their post above, SET NULL, and stay theirs).
          ['professional_reviews', tx`delete from nestly.professional_reviews where reviewer_id = ${id} or professional_id = ${id}`],
          ['professional_follows', tx`delete from nestly.professional_follows where follower_id = ${id} or professional_id = ${id}`],
          ['professional_articles', tx`delete from nestly.professional_articles where author_id = ${id}`],
          ['outreach_requests', tx`delete from nestly.outreach_requests where professional_id = ${id}`],
          // Chat and Support (I8): the user's read markers, Support requests (their threads and others' markers go with them), the
          // conversations either way (messages and markers go with them), then requests and Chat Blocks either way.
          ['chat_reads', tx`delete from nestly.chat_reads where user_id = ${id}`],
          ['support_messages', tx`delete from nestly.support_messages where support_request_id in (select id from nestly.support_requests where user_id = ${id})`],
          ['support_requests', tx`delete from nestly.support_requests where user_id = ${id}`],
          ['messages', tx`delete from nestly.messages
                    where conversation_id in (select id from nestly.conversations where user_a = ${id} or user_b = ${id})`],
          ['conversations', tx`delete from nestly.conversations where user_a = ${id} or user_b = ${id}`],
          ['chat_requests', tx`delete from nestly.chat_requests where requester_id = ${id} or target_id = ${id}`],
          ['chat_blocks', tx`delete from nestly.chat_blocks where blocker_id = ${id} or blocked_id = ${id}`],
          // Blocking (FR-REL-002): rows either way; they reference only users.
          ['user_blocks', tx`delete from nestly.user_blocks where blocker_id = ${id} or blocked_id = ${id}`],
          ['friendships', tx`delete from nestly.friendships where requester_id = ${id} or addressee_id = ${id}`],
          ['regular_names', tx`delete from nestly.regular_names where user_id = ${id}`],
          ['regular_profiles', tx`delete from nestly.regular_profiles where user_id = ${id}`],
          ['professional_profiles', tx`delete from nestly.professional_profiles where user_id = ${id}`],
          ['profile_open_counts', tx`delete from nestly.profile_open_counts where user_id = ${id}`],
          ['search_intents', tx`delete from nestly.search_intents where user_id = ${id}`],
          ['people_search_counts', tx`delete from nestly.people_search_counts where user_id = ${id}`],
          // AC-192: the instant of the user's last child-birthday check (cascades with the user; deleted here like the other per-user rows).
          ['birthday_checks', tx`delete from nestly.birthday_checks where user_id = ${id}`],
          // Afik DR-L (17.10.2026): a test user's Security events may be deleted here only; the FK stays RESTRICT for every other path.
          // security_limits is configuration with no user: never touched (deleting it would fail every later profile_view closed).
          ['user_enforcements', tx`delete from nestly.user_enforcements where user_id = ${id} or actor_id = ${id}`],
          // A temporary staff Moderator's keys: their delete fires the SECURITY DEFINER Audit trigger (owner app_owner, FORCE RLS), which
          // raises 42501 under row_security = off; on for this one statement (postgres bypasses RLS; the caller has no staff role, no entry).
          [null, tx`set local row_security = on`],
          ['moderator_permissions', tx`delete from nestly.moderator_permissions where user_id = ${id}`],
          [null, tx`set local row_security = off`],
          ['staff_roles', tx`delete from nestly.staff_roles where user_id = ${id}`],
          ['security_events', tx`delete from nestly.security_events where user_id = ${id}`],
          // I9: the account deletion record names the account by id only (no FK); a test user that requested a deletion leaves rows.
          ['account_deletion_events', tx`delete from nestly.account_deletion_events where account_id = ${id}`],
          ['identity_link_checks', tx`delete from nestly.identity_link_checks where user_id = ${id}`],
        ];
        // Afik 23.10: only this locked pattern user's own Audit entries, Preview only (URL + preflight above). ALTER takes a table lock
        // (SHARE ROW EXCLUSIVE, held to COMMIT; no concurrent session observes a disabled trigger), so it comes last: just before the
        // users delete that its RESTRICT key needs, then COMMIT. The server's clock around it measures the lock wait.
        const clockAt: number[] = [];
        if (hasAudit) {
          clockAt.push(steps.length);
          steps.push([null, tx`select (extract(epoch from clock_timestamp()) * 1000)::float8 as ms`]);
          steps.push([null, tx`alter table nestly.audit_log disable trigger audit_log_append_only`]);
          clockAt.push(steps.length);
          steps.push([null, tx`select (extract(epoch from clock_timestamp()) * 1000)::float8 as ms`]);
          steps.push(['audit_log', tx`delete from nestly.audit_log where actor_id = ${id}`]);
          steps.push([null, tx`alter table nestly.audit_log enable trigger audit_log_append_only`]);
        }
        steps.push(['users', tx`delete from nestly.users where id = ${id}`]);
        steps.push(['auth.users', tx`delete from auth.users where id = ${id} and email ~ ${TEST_EMAIL_PATTERN}`]);
        const results = await Promise.all(steps.map(([, query]) => query));
        steps.forEach(([table], i) => {
          if (table !== null) counts[table] = results[i]?.count ?? 0;
        });
        const [before, after] = clockAt.map((i) => Number(results[i]?.[0]?.['ms']));
        if (before !== undefined && after !== undefined && Number.isFinite(before) && Number.isFinite(after)) onAuditLock?.(after - before);
        if (counts['auth.users'] !== 1) throw new Error('auth.users delete was not exactly one row'); // rolls the transaction back
        return counts;
      });
    },
    async listPatternUsers(): Promise<PatternUser[]> {
      const rows = await sql<{ id: string; email: string; age_seconds: number | null }[]>`
        select id::text as id, email::text as email, extract(epoch from (now() - created_at))::float8 as age_seconds
          from auth.users
         where email ~ ${TEST_EMAIL_PATTERN}
         order by created_at asc, id asc`;
      return rows.map((r) => ({ id: r.id, email: r.email, ageSeconds: r.age_seconds }));
    },
    async countRunLeftovers(runId, runAttempt) {
      const prefix = runEmailPrefix(runId, runAttempt);
      const rows = await sql<{ n: number }[]>`
        select count(*)::int as n from auth.users where email ~ ${TEST_EMAIL_PATTERN} and email like ${prefix}`;
      return rows[0]?.n ?? 0;
    },
  };
  return { client, close: () => sql.end({ timeout: 5 }) };
}

/** The cleanup job's own step summary: counts only. */
function writeSummary(report: CleanupReport): void {
  const file = process.env['GITHUB_STEP_SUMMARY'];
  if (file === undefined || file === '') return;
  const text = [
    `preview-e2e-cleanup: ${report.ok ? 'OK' : 'FAILED'}`,
    `- deleted ${report.deletedOwn} user(s) of the run and ${report.deletedSwept} leftover(s)`,
    `- ${report.failedUsers} failed; the run's remaining: ${report.leftovers ?? 'unknown'}`,
    `- ${report.deferredSwept} leftover(s) left for the next runs (time budget)`,
    ...formatTimings(report.timings).totals.map((t) => `- ${t}`),
    ...(report.ok ? [] : [`- ${report.reason ?? 'cleanup failed'}`]),
    '',
  ].join('\n');
  appendFileSync(file, text);
}

/** The manual dry-run's step summary and log: counts and ages only. */
function reportBacklog(report: BacklogReport): void {
  const s = report.summary;
  const range = s === null || s.oldestHours === null ? 'none' : `${s.newestHours} h to ${s.oldestHours} h old`;
  const lines = [
    `preview-e2e-cleanup ${report.mode}: ${report.ok ? 'OK' : 'FAILED'}`,
    `- pattern users: ${s?.patternTotal ?? 'unknown'}; older than ${SWEEP_AGE_HOURS} h: ${s?.eligible ?? 'unknown'}; ages: ${range}`,
    '- nothing deleted',
    ...(report.ok ? [] : [`- ${report.reason ?? 'cleanup failed'}`]),
  ];
  for (const l of lines) line(l);
  const file = process.env['GITHUB_STEP_SUMMARY'];
  if (file !== undefined && file !== '') appendFileSync(file, `${lines.join('\n')}\n`);
}

async function main(): Promise<void> {
  const mode = parseMode(process.env['GITHUB_EVENT_NAME'], process.env['CLEANUP_MODE']);
  if (!mode.ok) stop(`${mode.reason}; nothing connected`);
  const url = process.env['PREVIEW_DB_ADMIN_URL'];
  const check = checkCleanupUrl(url);
  if (!check.ok || url === undefined) stop(`${check.ok ? 'URL missing' : check.reason}; nothing connected`);
  if (mode.mode !== 'run') {
    const { client, close } = createClient(url);
    try {
      const report = await runBacklog({ client, mode: mode.mode });
      reportBacklog(report);
      if (!report.ok) stop(report.reason ?? 'cleanup failed');
    } catch (error) {
      stop(`unexpected failure (code ${errorCode(error)})`);
    } finally {
      await close().catch(() => undefined);
    }
    return;
  }
  const runId = process.env['TARGET_RUN_ID'] ?? '';
  const runAttempt = process.env['TARGET_RUN_ATTEMPT'] ?? '';

  const { client, close } = createClient(url);
  try {
    const report = await runCleanup({ client, runId, runAttempt, log: line });
    writeSummary(report);
    line(`preview-e2e-cleanup: deleted ${report.deletedOwn} of this run and ${report.deletedSwept} leftover(s); ${report.failedUsers} failed; leftovers of this run: ${report.leftovers ?? 'unknown'}; ${report.deferredSwept} leftover(s) left for the next runs`);
    const rows = Object.entries(report.tableCounts).map(([table, n]) => `${table}=${n}`).join(' ');
    if (rows !== '') line(`preview-e2e-cleanup: rows removed: ${rows}`);
    const timings = formatTimings(report.timings);
    for (const t of [...timings.perUser, ...timings.totals]) line(`preview-e2e-cleanup: ${t}`);
    if (!report.ok) stop(report.reason ?? 'cleanup failed');
  } catch (error) {
    stop(`unexpected failure (code ${errorCode(error)})`);
  } finally {
    await close().catch(() => undefined);
  }
  line('preview-e2e-cleanup: OK');
}

await main();
