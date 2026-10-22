-- Down script of 20261023900000_promotion_settings_reason.sql: every active account reads the reason and the time of a promotion settings
-- version again (as 20261023600000 granted them). No data changes.
grant select (reason, created_at) on table nestly.promotion_settings to authenticated;

comment on column nestly.promotion_settings.reason is 'Why the version was added (1 to 500 characters); the Audit entry''s reason.';
comment on column nestly.promotion_settings.created_at is 'When it was added (the database clock).';

-- The CLI's history row, so a later push applies the migration again.
delete from supabase_migrations.schema_migrations where version = '20261023900000';
