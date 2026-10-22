-- Down script of 20261023700000_guide_source_date_optional.sql: restores the CHECK that a published guide has a source check date.
-- Refuses while a published guide has none (the old CHECK would fail; nothing is changed by hand).
do $$
begin
  if exists (select 1 from nestly.status_guides where status = 'published' and source_checked_on is null) then
    raise exception 'down 20261023700000: a published guide has no source check date; add one or hide it first';
  end if;
end
$$;

alter table nestly.status_guides drop constraint status_guides_published_at_check;

alter table nestly.status_guides
  add constraint status_guides_published_check check (status <> 'published' or (source_checked_on is not null and published_at is not null));

comment on policy status_guides_update_admin on nestly.status_guides is 'The Admin edits, publishes and hides a guide (FR-ADMIN-012); the CHECKs still require a source check date to publish.';

-- The CLI's history row, so a later push applies the migration again.
delete from supabase_migrations.schema_migrations where version = '20261023700000';
