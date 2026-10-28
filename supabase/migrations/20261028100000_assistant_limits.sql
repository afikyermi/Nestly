-- =====================================================================================================================
-- The Nestly assistant's message limits — migration only.
--
-- Why. The assistant (Afik 28.10.2026) answers a Regular or Professional account through an outside AI service. Its use is limited per
-- account: at most 20 messages in an hour and 60 in a day (24 hours). Function instances share no memory, so the count lives in Postgres
-- (conventions, "Server": rate limits). The conversation itself is never stored: no message text, no answer, no topic — only the instants
-- of the account's recent sends.
--
-- Changes: 1. nestly.assistant_message_counts (new table): one row per account, the instants of its accepted assistant messages inside
--             the longest window (24 hours; the server prunes older instants at each write, so the array holds at most the daily limit).
--             RLS forced. authenticated: SELECT, INSERT (default user_id = auth.uid()) and UPDATE (sent_at) of its own row only, and only
--             for an active Regular or Professional account (staff and other accounts have no assistant). No DELETE: the row cascades with
--             the account (nestly.users), so the account-deletion purge removes it with the users row.
--             The thresholds are server configuration, not stored here. The server reads, decides and writes in one identity transaction,
--             under the row lock of an insert ... on conflict do update.
--
-- No data. Applied by the Supabase CLI as app_owner, in one transaction with its history row.
-- Down script: supabase/rollback/20261028100000_assistant_limits.down.sql (drops the table).
-- =====================================================================================================================

create table nestly.assistant_message_counts (
  user_id uuid          not null default auth.uid()
    constraint assistant_message_counts_pkey primary key
    constraint assistant_message_counts_user_id_fkey references nestly.users (id) on delete cascade,
  sent_at timestamptz[] not null default '{}'
    constraint assistant_message_counts_sent_at_check check (pg_catalog.cardinality(sent_at) <= 1000)
);

alter table nestly.assistant_message_counts enable row level security, force row level security;

revoke all on table nestly.assistant_message_counts from public, anon, authenticated;
grant select on nestly.assistant_message_counts to authenticated;
grant insert (user_id) on nestly.assistant_message_counts to authenticated;
grant update (sent_at) on nestly.assistant_message_counts to authenticated;

create policy assistant_message_counts_select_own on nestly.assistant_message_counts
  for select to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account())
         and (select nestly.caller_account_type()) in ('regular', 'professional'));

create policy assistant_message_counts_insert_own on nestly.assistant_message_counts
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account())
              and (select nestly.caller_account_type()) in ('regular', 'professional'));

create policy assistant_message_counts_update_own on nestly.assistant_message_counts
  for update to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account())
         and (select nestly.caller_account_type()) in ('regular', 'professional'))
  with check (user_id = (select auth.uid()));

comment on table nestly.assistant_message_counts is
  'The Nestly assistant''s per-account message limits (Afik 28.10.2026): the instants of the account''s accepted assistant messages in the last 24 hours. Never a message text, an answer or a topic: the conversation is not stored. The owner (an active Regular or Professional account) reads, inserts and updates its own row; the server decides the limit from server configuration. Cascades with the account.';
comment on column nestly.assistant_message_counts.user_id is 'The account; auth.uid() by default.';
comment on column nestly.assistant_message_counts.sent_at is 'The instants of accepted messages inside the last 24 hours, pruned by the server at each write.';
comment on policy assistant_message_counts_select_own on nestly.assistant_message_counts is 'Own row; an active Regular or Professional account.';
comment on policy assistant_message_counts_insert_own on nestly.assistant_message_counts is 'Own row; an active Regular or Professional account.';
comment on policy assistant_message_counts_update_own on nestly.assistant_message_counts is 'Own row; an active Regular or Professional account.';
