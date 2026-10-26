-- =====================================================================================================================
-- I14 completion B follow-up: the report text cap in the database moves from 1,000 to 500 code points — migration only.
--
-- Why. Afik 21.10.2026 (decisions-in-force §11.9; VAL-048): every report everywhere takes a free text of up to 500 characters. The
--      server and the web hold 500 since the I14-B code reached main (REPORT_DETAILS_MAX, packages/shared); the database kept the older
--      1,000 so main would not break in between (20261024000000_help_offers_reviews.sql, "Not here"). This is that follow-up.
--
-- Existing rows. Reports written before the code held 500 may carry 501-1,000 characters, on nestly-preview and nestly-prod alike. No
--      user data is changed or deleted. A plain 500 CHECK would fail to validate on such a row, and a NOT VALID one would still be checked
--      on every UPDATE of that row — so a Moderator closing or resolving an old report with a long text would get 23514. Instead the new
--      CHECK keeps the old bound only for rows created before 2026-10-26 00:00 UTC (when main already held 500 on every path) and holds
--      500 for everything after. created_at is never granted to a client (default now()), so a new row cannot claim the old bound. The
--      CHECK is fully validated: every existing row already met <= 1,000 (the constraint it replaces).
--
-- Changes: reports_details_length_check replaced (same name: the server maps it by name); its comment and the reports.details comment.
-- No table, policy, grant, function or data. Applied by the Supabase CLI as app_owner, in one transaction with its history row.
-- Down script: supabase/rollback/20261026200000_reports_details_500.down.sql (restores the 1,000 CHECK and both comments verbatim).
-- =====================================================================================================================

alter table nestly.reports drop constraint reports_details_length_check;

alter table nestly.reports
  add constraint reports_details_length_check check (
    char_length(details) <= 500
    or (created_at < timestamptz '2026-10-26 00:00:00+00' and char_length(details) <= 1000)
  );

comment on constraint reports_details_length_check on nestly.reports is
  'VAL-048 (Afik 21.10.2026, §11.9): details is at most 500 characters (code points); NULL passes. A report created before 2026-10-26 00:00 UTC keeps the older 1,000 bound, so no existing row is changed and closing an old report still works. The server''s Zod refuses first.';

comment on column nestly.reports.details is
  'Optional text; required for other. Not blank (reports_details_check); cap 500 code points, 1,000 for a report created before 2026-10-26 (reports_details_length_check, VAL-048).';
