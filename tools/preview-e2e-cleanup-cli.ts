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
// password; it prints counts. Exit 0 only when every user is gone and none of this run remains.

import { appendFileSync } from 'node:fs';
import postgres from 'postgres';
import {
  DELETE_CONCURRENCY,
  MAX_SWEEP_PER_RUN,
  SWEEP_AGE_HOURS,
  TEST_EMAIL_PATTERN,
  checkCleanupUrl,
  errorCode,
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
 * transaction on one connection. Statements are the ones in schema.md, leaf first.
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
    async deleteUser(id): Promise<DeleteCounts> {
      return sql.begin(async (tx) => {
        await tx`set local row_security = off`;
        await tx`set local lock_timeout = '5s'`;
        await tx`set local statement_timeout = '30s'`;
        const locked = await tx`select id from auth.users where id = ${id} and email ~ ${TEST_EMAIL_PATTERN} for update`;
        const counts: DeleteCounts = {};
        if (locked.length === 0) return counts; // already gone, or no longer matches: nothing to do
        // Afik 23.10: only this locked pattern user's own Audit entries, Preview only (URL + preflight above).
        // ALTER takes a table lock; no concurrent session observes a disabled trigger. Failure rolls all DDL/deletes back.
        const audit = await tx`select 1 from nestly.audit_log where actor_id = ${id} limit 1`;
        if (audit.length > 0) {
          const [guard] = await tx<{ tgenabled: string }[]>`select tgenabled from pg_trigger
            where tgrelid = 'nestly.audit_log'::regclass and tgname = 'audit_log_append_only'`;
          if (guard?.tgenabled !== 'O') throw new Error('Audit append-only guard is not enabled');
          await tx`alter table nestly.audit_log disable trigger audit_log_append_only`;
          counts['audit_log'] = (await tx`delete from nestly.audit_log where actor_id = ${id}`).count;
          await tx`alter table nestly.audit_log enable trigger audit_log_append_only`;
        }
        counts['recovery_throttles'] = (
          await tx`delete from nestly.recovery_throttles t using nestly.recovery_answers a
                    where a.user_id = ${id} and t.subject_kind = 'handle' and t.subject_hash = a.email_handle`
        ).count;
        counts['recovery_events'] = (await tx`delete from nestly.recovery_events where user_id = ${id}`).count;
        counts['legal_consents'] = (await tx`delete from nestly.legal_consents where user_id = ${id}`).count;
        counts['recovery_answers'] = (await tx`delete from nestly.recovery_answers where user_id = ${id}`).count;
        counts['tracker_events'] = (await tx`delete from nestly.tracker_events where user_id = ${id}`).count;
        counts['cycle_entries'] = (await tx`delete from nestly.cycle_entries where user_id = ${id}`).count;
        counts['children'] = (await tx`delete from nestly.children where user_id = ${id}`).count;
        counts['journey_contexts'] = (await tx`delete from nestly.journey_contexts where user_id = ${id}`).count;
        // Notifications and their preferences reference only users (ON DELETE CASCADE); search counts likewise. Nothing references them.
        counts['notifications'] = (
          await tx`delete from nestly.notifications where recipient_id = ${id} or actor_id = ${id}`
        ).count;
        counts['notification_preferences'] = (await tx`delete from nestly.notification_preferences where user_id = ${id}`).count;
        counts['friend_content_notification_preferences'] = (
          await tx`delete from nestly.friend_content_notification_preferences where user_id = ${id} or friend_id = ${id}`
        ).count;
        // F3.0b (schema-b.md "Cleanup tool"). P(U) = U's posts (named, or anonymous through post_authors); C(U) = comments by U, on P(U),
        // or replying to U's. Reports first: no open report survives into a cascade, so reports_open_target_check never fires.
        // I8: a staff member's views of reported messages first (others' views go with the reports below, by cascade).
        counts['reported_message_views'] = (await tx`delete from nestly.reported_message_views where viewer_id = ${id}`).count;
        // I10: a staff member's views of reported Private Group content likewise (others' views go with the reports below, by cascade).
        counts['private_group_content_views'] = (await tx`delete from nestly.private_group_content_views where viewer_id = ${id}`).count;
        // I14 completion B: a staff member's openings of reported comments and of profiles (others' go with the report or the profile's account by
        // cascade), and the enforcement history that names the user as author or decider (it names a report: SET NULL; users: RESTRICT).
        counts['reported_comment_views'] = (await tx`delete from nestly.reported_comment_views where viewer_id = ${id}`).count;
        counts['profile_staff_views'] = (await tx`delete from nestly.profile_staff_views where viewer_id = ${id} or target_id = ${id}`).count;
        counts['enforcement_records'] = (await tx`delete from nestly.enforcement_records where user_id = ${id} or decided_by = ${id}`).count;
        counts['reports'] = (
          await tx`delete from nestly.reports
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
                       or listing_id in (select id from nestly.marketplace_listings where owner_id = ${id})`
        ).count;
        // I14 completion: report_escalations and report_openings go with these reports by cascade. A temporary staff Moderator's rows on
        // reports it did not file (handled_by above; opened_by, escalated_by: users RESTRICT) go here, or its user delete fails 23503.
        counts['report_openings'] = (await tx`delete from nestly.report_openings where opened_by = ${id}`).count;
        counts['report_escalations'] = (await tx`delete from nestly.report_escalations where escalated_by = ${id}`).count;
        counts['group_staff_views'] = (await tx`delete from nestly.group_staff_views where viewer_id = ${id}`).count;
        // reports.thread_post_id of another user's report on this user's post goes SET NULL with the post.
        counts['reactions'] = (
          await tx`delete from nestly.reactions where id in (select reaction_id from nestly.reaction_owners where user_id = ${id})`
        ).count;
        // F3.0a: a user's hides, then their comments (replies go with them), then every post they wrote; the cascade takes others'
        // hides, likes and separation rows, and others' shares of a deleted post keep their row (SET NULL).
        // I5: the user's Stories and profile photo, then every image they uploaded (reviews and training candidates go by cascade; staff
        // decisions on others' images keep their row: decided_by is SET NULL). media_training_samples and media_training_events name no user and are never written here.
        // The files in storage are not deleted here: the daily job removes files that have no row.
        // Monetization (I13): the user's own paid events and every event on the user's promotions, then the promotions (before the posts and
        // listings they name), then the user's simulated payments (a promotion references its payment). promotion_plans is configuration.
        counts['promotion_events'] = (
          await tx`delete from nestly.promotion_events
                    where viewer_id = ${id} or promotion_id in (select id from nestly.promotions where owner_id = ${id})`
        ).count;
        // §11.4: the monthly summaries of the user's promotions (the retention job writes them; a summary of a deleted promotion keeps
        // its row without it, SET NULL — deleted here so a test user leaves nothing behind). promotion_settings is configuration.
        counts['promotion_monthly_summaries'] = (
          await tx`delete from nestly.promotion_monthly_summaries where promotion_id in (select id from nestly.promotions where owner_id = ${id})`
        ).count;
        counts['promotions'] = (await tx`delete from nestly.promotions where owner_id = ${id}`).count;
        counts['promotion_payments'] = (await tx`delete from nestly.promotion_payments where payer_id = ${id}`).count;
        // Usage events (I13 follow-up): the user's views of Professionals and the views of the user's professional profile, then the
        // user's own usage counters.
        counts['professional_views'] = (
          await tx`delete from nestly.professional_views where viewer_id = ${id} or professional_id = ${id}`
        ).count;
        counts['usage_events'] = (await tx`delete from nestly.usage_events where user_id = ${id}`).count;
        counts['stories'] = (await tx`delete from nestly.stories where author_id = ${id}`).count;
        counts['profile_photos'] = (await tx`delete from nestly.profile_photos where user_id = ${id}`).count;
        counts['media_assets'] = (await tx`delete from nestly.media_assets where owner_id = ${id}`).count;
        // Marketplace (I12): the user's listings (their reports went above; others' conversations about one keep their row, listing_id SET
        // NULL). sponsored_products are written by the Admin only (a test user is never staff): never touched.
        counts['marketplace_listings'] = (await tx`delete from nestly.marketplace_listings where owner_id = ${id}`).count;
        counts['post_hides'] = (await tx`delete from nestly.post_hides where user_id = ${id}`).count;
        counts['comments'] = (
          await tx`delete from nestly.comments
                    where author_id = ${id}
                       or (author_id is null and post_id in (select post_id from nestly.post_authors where author_id = ${id}))`
        ).count;
        counts['posts'] = (
          await tx`delete from nestly.posts
                    where author_id = ${id} or id in (select post_id from nestly.post_authors where author_id = ${id})`
        ).count;
        // Groups (I10): the Groups the user owns go with everything in them (members and their copies, requests, invitations, blocks, modes,
        // recommendations, and every post, comment and like in them, by cascade; their reports were deleted above). Then the user's own rows
        // in other Groups; staff answers on others' requests and blocks keep their row (decided_by, banned_by and created_by are SET NULL).
        counts['groups'] = (
          await tx`delete from nestly.groups where id in (select group_id from nestly.group_members where user_id = ${id} and role = 'owner')`
        ).count;
        counts['group_suggestions'] = (
          await tx`delete from nestly.group_suggestions where sender_id = ${id} or recipient_id = ${id}`
        ).count;
        counts['group_invitations'] = (await tx`delete from nestly.group_invitations where inviter_id = ${id} or invitee_id = ${id}`).count;
        counts['group_join_requests'] = (await tx`delete from nestly.group_join_requests where user_id = ${id}`).count;
        // I10 completion C: the Group enforcement history naming the user (as the member or as the manager who acted; others' records of a
        // deleted manager keep their row by SET NULL, but a test user's are deleted here). group_highlights names no user: it goes with its
        // post or Group by cascade.
        counts['group_member_enforcements'] = (
          await tx`delete from nestly.group_member_enforcements where user_id = ${id} or actor_id = ${id}`
        ).count;
        counts['group_bans'] = (await tx`delete from nestly.group_bans where user_id = ${id}`).count;
        counts['group_notification_preferences'] = (await tx`delete from nestly.group_notification_preferences where user_id = ${id}`).count;
        counts['group_access'] = (await tx`delete from nestly.group_access where user_id = ${id}`).count;
        counts['group_members'] = (await tx`delete from nestly.group_members where user_id = ${id}`).count;
        // Professionals (I11): reviews by or of the user, Follows either way, the user's articles and Offer Help (a conversation that came
        // from one goes with it, by cascade; requests of others on the user's posts lost their post above, SET NULL, and stay theirs).
        counts['professional_reviews'] = (
          await tx`delete from nestly.professional_reviews where reviewer_id = ${id} or professional_id = ${id}`
        ).count;
        counts['professional_follows'] = (
          await tx`delete from nestly.professional_follows where follower_id = ${id} or professional_id = ${id}`
        ).count;
        counts['professional_articles'] = (await tx`delete from nestly.professional_articles where author_id = ${id}`).count;
        counts['outreach_requests'] = (await tx`delete from nestly.outreach_requests where professional_id = ${id}`).count;
        // Chat and Support (I8): the user's read markers, Support requests (their threads and others' markers go with them), the
        // conversations either way (messages and markers go with them), then requests and Chat Blocks either way.
        counts['chat_reads'] = (await tx`delete from nestly.chat_reads where user_id = ${id}`).count;
        counts['support_messages'] = (
          await tx`delete from nestly.support_messages where support_request_id in (select id from nestly.support_requests where user_id = ${id})`
        ).count;
        counts['support_requests'] = (await tx`delete from nestly.support_requests where user_id = ${id}`).count;
        counts['messages'] = (
          await tx`delete from nestly.messages
                    where conversation_id in (select id from nestly.conversations where user_a = ${id} or user_b = ${id})`
        ).count;
        counts['conversations'] = (await tx`delete from nestly.conversations where user_a = ${id} or user_b = ${id}`).count;
        counts['chat_requests'] = (await tx`delete from nestly.chat_requests where requester_id = ${id} or target_id = ${id}`).count;
        counts['chat_blocks'] = (await tx`delete from nestly.chat_blocks where blocker_id = ${id} or blocked_id = ${id}`).count;
        // Blocking (FR-REL-002): rows either way; they reference only users.
        counts['user_blocks'] = (await tx`delete from nestly.user_blocks where blocker_id = ${id} or blocked_id = ${id}`).count;
        counts['friendships'] = (
          await tx`delete from nestly.friendships where requester_id = ${id} or addressee_id = ${id}`
        ).count;
        counts['regular_names'] = (await tx`delete from nestly.regular_names where user_id = ${id}`).count;
        counts['regular_profiles'] = (await tx`delete from nestly.regular_profiles where user_id = ${id}`).count;
        counts['professional_profiles'] = (await tx`delete from nestly.professional_profiles where user_id = ${id}`).count;
        counts['profile_open_counts'] = (await tx`delete from nestly.profile_open_counts where user_id = ${id}`).count;
        counts['search_intents'] = (await tx`delete from nestly.search_intents where user_id = ${id}`).count;
        counts['people_search_counts'] = (await tx`delete from nestly.people_search_counts where user_id = ${id}`).count;
        // Afik DR-L (17.10.2026): a test user's Security events may be deleted here only; the FK stays RESTRICT for every other path.
        // security_limits is configuration with no user: never touched (deleting it would fail every later profile_view closed).
        counts['user_enforcements'] = (await tx`delete from nestly.user_enforcements where user_id = ${id} or actor_id = ${id}`).count;
        // A temporary staff Moderator's keys: their delete fires the SECURITY DEFINER Audit trigger (owner app_owner, FORCE RLS), which
        // raises 42501 under row_security = off; on for this one statement (postgres bypasses RLS; the caller has no staff role, no entry).
        await tx`set local row_security = on`;
        counts['moderator_permissions'] = (await tx`delete from nestly.moderator_permissions where user_id = ${id}`).count;
        await tx`set local row_security = off`;
        counts['staff_roles'] = (await tx`delete from nestly.staff_roles where user_id = ${id}`).count;
        counts['security_events'] = (await tx`delete from nestly.security_events where user_id = ${id}`).count;
        counts['identity_link_checks'] = (await tx`delete from nestly.identity_link_checks where user_id = ${id}`).count;
        counts['users'] = (await tx`delete from nestly.users where id = ${id}`).count;
        const authDeleted = (await tx`delete from auth.users where id = ${id} and email ~ ${TEST_EMAIL_PATTERN}`).count;
        if (authDeleted !== 1) throw new Error('auth.users delete was not exactly one row'); // rolls the transaction back
        counts['auth.users'] = authDeleted;
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
    if (!report.ok) stop(report.reason ?? 'cleanup failed');
  } catch (error) {
    stop(`unexpected failure (code ${errorCode(error)})`);
  } finally {
    await close().catch(() => undefined);
  }
  line('preview-e2e-cleanup: OK');
}

await main();
