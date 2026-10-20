-- =====================================================================================================================
-- Images, profile photos, Stories, the admin approval queue and the training set — I5 (media and Stories).
--
-- SRS: FR-FEED-002 · FR-FEED-008 · FR-PROFILE-001 · NFR-MEDIA-001 · BR-076 · BR-077 · VAL-041 · VAL-042 · AC-021 · AC-102..105 · ERR-014/039/040/041 ·
--      image policy of Afik 20.10.2026 (decisions-in-force.md §2) · platform rules 1, 6, 8, 12, 13, 14, 15, 16, 18, 20 (.claude/knowledge/data-model.md).
--
-- media_assets            one row per uploaded image (post, profile photo or Story). Metadata and the state of the server's image check
--                         only; the image bytes are not here. status: pending (checked in the background; only the uploader sees it) ->
--                         passed (shown to the audience) | queued (blocked or the model was unsure: waits for an Admin or a Moderator with
--                         CONTENT_MODERATE) -> approved (shown) | rejected | suspected (a child may be in danger: hidden up to 90 days, never
--                         kept for training). owner_id is never readable by a client: an anonymous post's image must not name its author.
-- profile_photos          the current photo of a Regular or Professional account (replaced in place; the old image is deleted).
-- stories                 FR-FEED-008: one image, optional short text, audience, 24 hours. Created in the same transaction as its image, so
--                         the image and the Story expire together. At most 10 in 24 hours (VAL-042, ERR-040).
-- media_training_samples  the blocked images and the staff decision, kept to improve safety (decisions-in-force.md §2): never an image marked
--                         "a child is in it", never a suspected abuse. Admin only; expires.
--
-- Who writes the check result: the job role app_jobs (rule 6), through the policies below; an uploader can never set a status. Who decides a
-- queued image: CONTENT_MODERATE (the Admin always). Each decision and each training sample is appended to the Audit Log by audit_trigger()
-- (replaced here with two more branches; the function stays the one approved writer, rule 18).
--
-- No new SECURITY DEFINER function: tests.approved_security_definer() is unchanged. Every new function is SECURITY INVOKER, search_path ''.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261021100000_media_stories.down.sql (refuses while any of the four tables holds a row).
-- =====================================================================================================================

-- 1. media_assets.
create table nestly.media_assets (
  id           uuid        not null default gen_random_uuid(),
  owner_id     uuid        not null default auth.uid(),
  owner_status text        not null default 'active',
  kind         text        not null,
  status       text        not null default 'pending',
  mime         text        not null,
  width        integer     not null,
  height       integer     not null,
  byte_size    integer     not null,
  post_id      uuid,
  position     smallint,
  is_child     boolean     not null default false,
  queue_reason text,
  scores       jsonb,
  check_attempts smallint  not null default 0,
  checked_at   timestamptz,
  decided_by   uuid,
  decided_at   timestamptz,
  purge_after  timestamptz,
  created_at   timestamptz not null default now(),
  constraint media_assets_pkey primary key (id),
  constraint media_assets_id_status_key unique (id, status),
  constraint media_assets_kind_check check (kind in ('post', 'profile', 'story')),
  constraint media_assets_status_check check (status in ('pending', 'passed', 'queued', 'approved', 'rejected', 'suspected')),
  constraint media_assets_mime_check check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint media_assets_width_check check (width between 1 and 2048),
  constraint media_assets_height_check check (height between 1 and 2048),
  constraint media_assets_byte_size_check check (byte_size between 1 and 15728640),
  constraint media_assets_position_check check (position is null or position between 0 and 3),
  constraint media_assets_post_kind_check check (post_id is null or kind = 'post'),
  constraint media_assets_post_position_check check ((post_id is null) = (position is null)),
  constraint media_assets_queue_reason_check check (queue_reason is null or queue_reason in ('blocked', 'unsure', 'error')),
  constraint media_assets_queued_reason_check check (status <> 'queued' or queue_reason is not null),
  constraint media_assets_child_check check (not is_child or queue_reason is not null),
  constraint media_assets_decided_check check (
    (decided_by is null) = (decided_at is null)
    and ((status in ('approved', 'rejected', 'suspected')) = (decided_by is not null))),
  constraint media_assets_suspected_check check (
    (status = 'suspected') = (purge_after is not null) and (status <> 'suspected' or is_child)),
  constraint media_assets_attempts_check check (check_attempts between 0 and 20),
  constraint media_assets_owner_id_owner_status_fkey foreign key (owner_id, owner_status)
    references nestly.users (id, status) on update cascade on delete cascade,
  constraint media_assets_post_id_fkey foreign key (post_id) references nestly.posts (id) on delete cascade,
  constraint media_assets_decided_by_fkey foreign key (decided_by) references nestly.users (id) on delete restrict
);

create index media_assets_owner_idx on nestly.media_assets (owner_id, kind, created_at desc);
create index media_assets_post_idx on nestly.media_assets (post_id, position) where post_id is not null;
create index media_assets_work_idx on nestly.media_assets (status, created_at) where status in ('pending', 'queued');
create index media_assets_decided_by_idx on nestly.media_assets (decided_by) where decided_by is not null;

-- 2. profile_photos: the current photo. media_status is a copy of the image's status kept by the composite FK (the F2.4a pattern), so the
--    policy can ask "has the image passed" without reading media_assets (media_assets' policy reads this table; a cycle is not allowed).
create table nestly.profile_photos (
  user_id      uuid        not null default auth.uid(),
  user_status  text        not null default 'active',
  media_id     uuid        not null,
  media_status text        not null default 'pending',
  updated_at   timestamptz not null default now(),
  constraint profile_photos_pkey primary key (user_id),
  constraint profile_photos_media_id_key unique (media_id),
  constraint profile_photos_user_id_user_status_fkey foreign key (user_id, user_status)
    references nestly.users (id, status) on update cascade on delete cascade,
  constraint profile_photos_media_fkey foreign key (media_id, media_status)
    references nestly.media_assets (id, status) on update cascade on delete cascade
);

-- 3. stories.
create table nestly.stories (
  id           uuid        not null default gen_random_uuid(),
  author_id    uuid        not null default auth.uid(),
  author_status text       not null default 'active',
  media_id     uuid        not null,
  media_status text        not null default 'pending',
  caption      text,
  audience     text        not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '24 hours',
  constraint stories_pkey primary key (id),
  constraint stories_media_id_key unique (media_id),
  constraint stories_audience_check check (audience in ('everyone', 'friends')),
  constraint stories_caption_check check (caption is null or (btrim(caption) <> '' and char_length(caption) <= 200)),
  constraint stories_author_id_fkey foreign key (author_id) references nestly.regular_profiles (user_id) on delete cascade,
  constraint stories_author_status_fkey foreign key (author_id, author_status)
    references nestly.users (id, status) on update cascade on delete cascade,
  constraint stories_media_fkey foreign key (media_id, media_status)
    references nestly.media_assets (id, status) on update cascade on delete cascade
);

create index stories_author_idx on nestly.stories (author_id, created_at desc);
create index stories_feed_idx on nestly.stories (created_at desc);

-- 4. media_training_samples. No user column: a sample outlives its uploader's account on purpose and carries nothing that names them.
create table nestly.media_training_samples (
  id              uuid        not null default gen_random_uuid(),
  source_media_id uuid        not null,
  label           text        not null,
  queue_reason    text,
  image           bytea       not null,
  mime            text        not null,
  decided_by      uuid        not null default auth.uid(),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '12 months',
  constraint media_training_samples_pkey primary key (id),
  constraint media_training_samples_source_key unique (source_media_id),
  constraint media_training_samples_label_check check (label in ('blocked', 'allowed')),
  constraint media_training_samples_reason_check check (queue_reason is null or queue_reason in ('blocked', 'unsure', 'error')),
  constraint media_training_samples_mime_check check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint media_training_samples_image_check check (octet_length(image) between 1 and 15728640),
  constraint media_training_samples_decided_by_fkey foreign key (decided_by) references nestly.users (id) on delete restrict
);

create index media_training_samples_expires_idx on nestly.media_training_samples (expires_at);
create index media_training_samples_decided_by_idx on nestly.media_training_samples (decided_by);

-- 5. Triggers. SECURITY INVOKER; auth.uid() is the caller.

-- media_assets: who may change which column. The column grants allow post_id, position, status and is_child to authenticated; this decides by whom.
create function nestly.media_assets_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mine boolean;
begin
  if current_user = 'app_jobs' then
    -- the background check: only a pending image moves, to passed or queued (BR-076); never to a decision of staff
    if old.status <> 'pending' and new.status is distinct from old.status then
      raise exception 'media: only a pending image is moved by the check' using errcode = 'NS023';
    end if;
    if new.status not in ('pending', 'passed', 'queued') then
      raise exception 'media: the check cannot decide' using errcode = 'NS023';
    end if;
    if new.status is distinct from old.status then
      new.checked_at := pg_catalog.now();
    end if;
    return new;
  end if;
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.status is distinct from old.status or new.is_child is distinct from old.is_child then
    -- a staff decision on a queued image
    if not (select nestly.has_permission('CONTENT_MODERATE')) then
      raise exception 'media: a decision needs CONTENT_MODERATE' using errcode = '42501';
    end if;
    if old.status <> 'queued' or new.status not in ('approved', 'rejected', 'suspected') then
      raise exception 'media: only a queued image is decided, as approved, rejected or suspected' using errcode = 'NS023';
    end if;
    if new.status = 'suspected' and not new.is_child then
      raise exception 'media: a suspected image is marked as having a child' using errcode = 'NS023';
    end if;
    if new.post_id is distinct from old.post_id or new.position is distinct from old.position then
      raise exception 'media: a decision changes nothing else' using errcode = 'NS023';
    end if;
    new.decided_by := (select auth.uid());
    new.decided_at := pg_catalog.now();
    new.purge_after := case when new.status = 'suspected' then pg_catalog.now() + interval '90 days' end;
    return new;
  end if;
  -- the uploader attaches a post image to the uploader's own post, once (FR-FEED-002, VAL-041: up to 4)
  if old.post_id is not null or new.post_id is null or old.kind <> 'post' or old.status in ('rejected', 'suspected') then
    raise exception 'media: this image cannot be attached' using errcode = 'NS022';
  end if;
  select exists (select 1 from nestly.posts p where p.id = new.post_id and p.author_id = (select auth.uid()))
      or exists (select 1 from nestly.post_authors pa where pa.post_id = new.post_id and pa.author_id = (select auth.uid()))
    into v_mine;
  if not v_mine then
    raise exception 'media: the post is not yours' using errcode = 'NS022';
  end if;
  if (select pg_catalog.count(*) from nestly.media_assets m where m.post_id = new.post_id) >= 4 then
    raise exception 'media: a post carries at most 4 images' using errcode = 'NS022';
  end if;
  return new;
end
$$;

revoke execute on function nestly.media_assets_update_guard() from public;

create trigger media_assets_update_guard
  before update on nestly.media_assets
  for each row execute function nestly.media_assets_update_guard();

-- profile_photos: the image is the caller's own, of kind profile; its status is copied; a replaced image is deleted at once (BR-077).
create function nestly.profile_photos_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m record;
begin
  select a.status, a.kind into m from nestly.media_assets a where a.id = new.media_id;
  if not found or m.kind <> 'profile' or m.status in ('rejected', 'suspected') then
    raise exception 'profile photo: this image cannot be a profile photo' using errcode = 'NS022';
  end if;
  new.media_status := m.status;
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

create function nestly.profile_photos_replaced()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from nestly.media_assets where id = old.media_id;
  return null;
end
$$;

revoke execute on function nestly.profile_photos_prepare() from public;
revoke execute on function nestly.profile_photos_replaced() from public;

create trigger profile_photos_prepare
  before insert or update of media_id on nestly.profile_photos
  for each row execute function nestly.profile_photos_prepare();

create trigger profile_photos_replaced
  after update of media_id on nestly.profile_photos
  for each row when (old.media_id is distinct from new.media_id)
  execute function nestly.profile_photos_replaced();

-- stories: the image belongs to the caller, is a Story image uploaded in this very transaction (so both expire together), and the author has
-- fewer than 10 Stories in the last 24 hours (VAL-042). The author's profile row is locked first, so two requests cannot both pass the count.
create function nestly.stories_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m record;
begin
  perform 1 from nestly.regular_profiles rp where rp.user_id = (select auth.uid()) for no key update;
  if (select pg_catalog.count(*) from nestly.stories s
       where s.author_id = (select auth.uid()) and s.created_at > pg_catalog.now() - interval '24 hours') >= 10 then
    raise exception 'stories: at most 10 in 24 hours' using errcode = 'NS021';
  end if;
  select a.status, a.kind, a.created_at into m from nestly.media_assets a where a.id = new.media_id;
  if not found or m.kind <> 'story' or m.status in ('rejected', 'suspected') or m.created_at <> pg_catalog.now() then
    raise exception 'stories: this image cannot be a Story' using errcode = 'NS022';
  end if;
  new.media_status := m.status;
  new.created_at := pg_catalog.now();
  new.expires_at := pg_catalog.now() + interval '24 hours';
  return new;
end
$$;

revoke execute on function nestly.stories_prepare() from public;

create trigger stories_prepare
  before insert on nestly.stories
  for each row execute function nestly.stories_prepare();

-- 6. RLS. Every client policy TO authenticated and gated by is_active_account(); the app_jobs ones are the background check and the purge.
alter table nestly.media_assets enable row level security, force row level security;
alter table nestly.profile_photos enable row level security, force row level security;
alter table nestly.stories enable row level security, force row level security;
alter table nestly.media_training_samples enable row level security, force row level security;

-- media_assets: the uploader reads their own (a Story image only for its 24 hours).
create policy media_assets_select_owner on nestly.media_assets
  for select to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid())
    and (kind <> 'story' or created_at > now() - interval '24 hours'));

-- Everyone else reads an image only after it passed (or was approved), and only through the thing it belongs to: a post they can read, a
-- profile photo, a Story they can read. The owner is not a readable column, so an anonymous post's image names no one.
create policy media_assets_select_viewer on nestly.media_assets
  for select to authenticated
  using ((select nestly.is_active_account()) and owner_status = 'active' and status in ('passed', 'approved') and (
    (kind = 'post' and exists (select 1 from nestly.posts p where p.id = media_assets.post_id))
    or (kind = 'profile' and exists (select 1 from nestly.profile_photos pp where pp.media_id = media_assets.id))
    or (kind = 'story' and created_at > now() - interval '24 hours'
        and exists (select 1 from nestly.stories s where s.media_id = media_assets.id))));

-- The approval queue (CONTENT_MODERATE; the Admin always): queued images and the decided ones.
create policy media_assets_select_staff on nestly.media_assets
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and status in ('queued', 'approved', 'rejected', 'suspected')
    and (kind <> 'story' or created_at > now() - interval '24 hours'));

create policy media_assets_insert_owner on nestly.media_assets
  for insert to authenticated
  with check ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and owner_status = 'active'
    and status = 'pending' and post_id is null and not is_child
    and (select nestly.caller_account_type()) in ('regular', 'professional'));

-- The uploader attaches an image to their post (media_assets_update_guard checks the post, the limit and the columns).
create policy media_assets_update_owner on nestly.media_assets
  for update to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid()) and post_id is null and kind = 'post')
  with check (owner_id = (select auth.uid()) and post_id is not null);

-- Staff decide a queued image.
create policy media_assets_update_staff on nestly.media_assets
  for update to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE')) and status = 'queued'
    and (kind <> 'story' or created_at > now() - interval '24 hours'))
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and status in ('approved', 'rejected', 'suspected'));

create policy media_assets_delete_owner on nestly.media_assets
  for delete to authenticated
  using ((select nestly.is_active_account()) and owner_id = (select auth.uid()));

-- The background check and the purge (rule 6): the job role has no auth.uid().
create policy media_assets_select_jobs on nestly.media_assets
  for select to app_jobs
  using (status in ('pending', 'suspected', 'rejected', 'queued') or kind = 'story' or post_id is null);

create policy media_assets_update_jobs on nestly.media_assets
  for update to app_jobs
  using (status = 'pending')
  with check (status in ('pending', 'passed', 'queued'));

create policy media_assets_delete_jobs on nestly.media_assets
  for delete to app_jobs
  using ((kind = 'story' and created_at <= now() - interval '24 hours')
    or (status = 'suspected' and purge_after <= now())
    or (status = 'rejected' and decided_at <= now() - interval '30 days')
    or (kind = 'post' and post_id is null and created_at <= now() - interval '24 hours')
    or (kind = 'profile' and not exists (select 1 from nestly.profile_photos pp where pp.media_id = media_assets.id)
        and created_at <= now() - interval '24 hours'));

-- profile_photos: the owner reads and sets their own; anyone active reads a passed one (the Basic Public Profile is always visible, §1.4).
create policy profile_photos_select_viewer on nestly.profile_photos
  for select to authenticated
  using ((select nestly.is_active_account()) and user_status = 'active'
    and (user_id = (select auth.uid()) or media_status in ('passed', 'approved')));

create policy profile_photos_insert_owner on nestly.profile_photos
  for insert to authenticated
  with check ((select nestly.is_active_account()) and user_id = (select auth.uid()) and user_status = 'active'
    and (select nestly.caller_account_type()) in ('regular', 'professional'));

create policy profile_photos_update_owner on nestly.profile_photos
  for update to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- stories: visible for 24 hours; to the author at once, to others after the image passed, by audience.
create policy stories_select_viewer on nestly.stories
  for select to authenticated
  using ((select nestly.is_active_account()) and author_status = 'active' and expires_at > now() and (
    author_id = (select auth.uid())
    or (media_status in ('passed', 'approved') and (
      audience = 'everyone'
      or exists (
        select 1 from nestly.friendships f
        where f.status = 'accepted' and (
          (f.requester_id = (select auth.uid()) and f.addressee_id = stories.author_id)
          or (f.addressee_id = (select auth.uid()) and f.requester_id = stories.author_id)))))));

create policy stories_insert_author on nestly.stories
  for insert to authenticated
  with check ((select nestly.is_active_account()) and author_id = (select auth.uid()) and author_status = 'active'
    and (select nestly.caller_account_type()) = 'regular');

-- The purge reads the expired Stories (the images go with media_assets_delete_jobs; the Story goes with its image).
create policy stories_select_jobs on nestly.stories
  for select to app_jobs
  using (expires_at <= now());

-- media_training_samples: the Admin only (ALGORITHM_AI_CONFIG is an Admin-only key). Staff with CONTENT_MODERATE add the sample of the image
-- they decided, never one marked "a child is in it" and never a suspected one (decisions-in-force.md §2).
create policy media_training_samples_select_admin on nestly.media_training_samples
  for select to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('ALGORITHM_AI_CONFIG')));

create policy media_training_samples_insert_staff on nestly.media_training_samples
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select nestly.has_permission('CONTENT_MODERATE'))
    and decided_by = (select auth.uid())
    and exists (
      select 1 from nestly.media_assets m
      where m.id = media_training_samples.source_media_id and not m.is_child and m.status in ('approved', 'rejected')
        and m.decided_by = (select auth.uid())
        and (m.status = 'rejected') = (media_training_samples.label = 'blocked')
        and m.mime = media_training_samples.mime));

create policy media_training_samples_delete_admin on nestly.media_training_samples
  for delete to authenticated
  using ((select nestly.is_active_account()) and (select nestly.has_permission('ALGORITHM_AI_CONFIG')));

create policy media_training_samples_select_jobs on nestly.media_training_samples
  for select to app_jobs
  using (expires_at <= now());

create policy media_training_samples_delete_jobs on nestly.media_training_samples
  for delete to app_jobs
  using (expires_at <= now());

-- 7. Grants. Per column: identifiers, owners, clocks, scores and counters are never granted to a client.
revoke all on table nestly.media_assets, nestly.profile_photos, nestly.stories, nestly.media_training_samples from public, anon;

grant select (id, kind, status, mime, width, height, byte_size, post_id, position, is_child, queue_reason, created_at, decided_at)
  on table nestly.media_assets to authenticated;
grant insert (kind, mime, width, height, byte_size) on table nestly.media_assets to authenticated;
grant update (post_id, position, status, is_child) on table nestly.media_assets to authenticated;
grant delete on table nestly.media_assets to authenticated;

grant select (user_id, media_id, media_status, updated_at) on table nestly.profile_photos to authenticated;
grant insert (media_id) on table nestly.profile_photos to authenticated;
grant update (media_id) on table nestly.profile_photos to authenticated;

grant select (id, author_id, media_id, media_status, caption, audience, created_at, expires_at) on table nestly.stories to authenticated;
grant insert (media_id, caption, audience) on table nestly.stories to authenticated;

grant select (id, source_media_id, label, queue_reason, mime, decided_by, created_at, expires_at) on table nestly.media_training_samples to authenticated;
grant insert (source_media_id, label, queue_reason, image, mime) on table nestly.media_training_samples to authenticated;
grant delete on table nestly.media_training_samples to authenticated;

grant select, delete on table nestly.media_assets to app_jobs;
grant update (status, scores, check_attempts, checked_at, queue_reason) on table nestly.media_assets to app_jobs;
grant select on table nestly.stories to app_jobs;
grant select, delete on table nestly.media_training_samples to app_jobs;

-- 8. The Audit Log: audit_trigger() (rule 18) gains the branches for an image decision and for the training set. Everything else is
--    the text of 20261020300000_safety_admin_core.sql, unchanged.
create or replace function nestly.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := (select nestly.caller_staff_role());
  v_reason text := nullif(pg_catalog.btrim(pg_catalog.current_setting('nestly.audit_reason', true)), '');
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_action text;
  v_kind text;
  v_target uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if v_role is null then
    -- the owner role (fixtures, bootstrap) has no identity; a runtime caller whose staff role or session does not hold leaves no record, so it does nothing
    if auth.uid() is not null then
      raise exception 'audit_trigger: an unauditable action is refused' using errcode = '42501';
    end if;
    return null;
  end if;
  if tg_op <> 'INSERT' then v_old := pg_catalog.to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := pg_catalog.to_jsonb(new); end if;
  if tg_table_name = 'moderator_permissions' then
    v_key := 'MODERATOR_MANAGE';
    v_action := case tg_op when 'INSERT' then 'permission_granted' else 'permission_revoked' end;
    v_kind := 'user';
    v_target := (coalesce(v_new, v_old) ->> 'user_id')::uuid;
    v_before := case when tg_op = 'DELETE' then pg_catalog.jsonb_build_object('permission', v_old ->> 'permission_key') end;
    v_after := case when tg_op = 'INSERT' then pg_catalog.jsonb_build_object('permission', v_new ->> 'permission_key') end;
  elsif tg_table_name = 'report_reasons' then
    v_key := 'COMMUNITY_CONFIG';
    v_action := 'report_reason_changed';
    v_kind := 'report_reason';
    v_before := case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object('key', v_old ->> 'key', 'label', v_old ->> 'label',
      'priority', v_old -> 'priority', 'sortOrder', v_old -> 'sort_order', 'isActive', v_old -> 'is_active') end;
    v_after := pg_catalog.jsonb_build_object('key', v_new ->> 'key', 'label', v_new ->> 'label', 'priority', v_new -> 'priority',
      'sortOrder', v_new -> 'sort_order', 'isActive', v_new -> 'is_active');
  elsif tg_table_name = 'reports' then
    v_key := 'REPORTS_VIEW';
    v_action := 'report_handled';
    v_kind := 'report';
    v_target := (v_new ->> 'id')::uuid;
    v_reason := nullif(v_new ->> 'handler_note', '');
    v_after := pg_catalog.jsonb_build_object('resolution', v_new ->> 'resolution', 'targetKind', v_new ->> 'target_kind', 'reason', v_new ->> 'reason');
  elsif tg_table_name in ('posts', 'comments') then
    v_key := 'CONTENT_MODERATE';
    v_action := case v_new ->> 'status' when 'hidden' then 'content_hidden' when 'removed' then 'content_removed' else 'content_restored' end;
    v_kind := case tg_table_name when 'posts' then 'post' else 'comment' end;
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status');
  elsif tg_table_name = 'user_enforcements' then
    v_key := case v_new ->> 'kind' when 'warning' then 'USER_WARN' when 'suspension' then 'USER_SUSPEND' when 'reinstate' then 'USER_SUSPEND' else 'USER_BAN' end;
    v_action := case v_new ->> 'kind' when 'warning' then 'user_warn' when 'suspension' then 'user_suspend' when 'reinstate' then 'user_reinstate'
      when 'ban' then 'user_ban' else 'user_unban' end;
    v_kind := 'user';
    v_target := (v_new ->> 'user_id')::uuid;
    v_reason := v_new ->> 'reason';
    v_before := pg_catalog.jsonb_build_object('status', v_new ->> 'status_before');
    v_after := pg_catalog.jsonb_build_object('kind', v_new ->> 'kind', 'durationHours', v_new -> 'duration_hours', 'suspendedUntil', v_new -> 'suspended_until',
      'suggestedKind', v_new ->> 'suggested_kind', 'suggestedHours', v_new -> 'suggested_hours', 'stepSkipped', v_new -> 'is_step_skipped',
      'childSafety', v_new -> 'is_child_safety', 'reportId', v_new -> 'report_id');
  elsif tg_table_name = 'media_assets' then
    v_key := 'CONTENT_MODERATE';
    v_action := 'media_' || (v_new ->> 'status');
    v_kind := 'media';
    v_target := (v_new ->> 'id')::uuid;
    v_before := pg_catalog.jsonb_build_object('status', v_old ->> 'status');
    v_after := pg_catalog.jsonb_build_object('status', v_new ->> 'status', 'isChild', v_new -> 'is_child', 'queueReason', v_new ->> 'queue_reason');
  elsif tg_table_name = 'media_training_samples' then
    v_key := case tg_op when 'INSERT' then 'CONTENT_MODERATE' else 'ALGORITHM_AI_CONFIG' end;
    v_action := case tg_op when 'INSERT' then 'training_sample_added' else 'training_sample_deleted' end;
    v_kind := 'training_sample';
    v_target := (coalesce(v_new, v_old) ->> 'id')::uuid;
    v_after := case when tg_op = 'INSERT' then pg_catalog.jsonb_build_object('label', v_new ->> 'label', 'sourceMedia', v_new ->> 'source_media_id') end;
    v_before := case when tg_op = 'DELETE' then pg_catalog.jsonb_build_object('label', v_old ->> 'label') end;
  else
    raise exception 'audit_trigger: not attached to %', tg_table_name;
  end if;
  insert into nestly.audit_log (actor_role, permission_key, action, target_kind, target_id, reason, before_state, after_state)
  values (v_role, v_key, v_action, v_kind, v_target, v_reason, v_before, v_after);
  return null;
end
$$;

revoke execute on function nestly.audit_trigger() from public;

create trigger media_assets_decision_audit
  after update of status on nestly.media_assets
  for each row
  when (old.status = 'queued' and new.status in ('approved', 'rejected', 'suspected'))
  execute function nestly.audit_trigger();

create trigger media_training_samples_audit
  after insert or delete on nestly.media_training_samples
  for each row execute function nestly.audit_trigger();

-- 9. Comments.
comment on table nestly.media_assets is
  'FR-FEED-002, FR-FEED-008, FR-PROFILE-001, NFR-MEDIA-001, BR-076: one uploaded image (post, profile photo or Story): its metadata and the state of the server''s check. pending -> passed | queued; queued -> approved | rejected | suspected by CONTENT_MODERATE. Until passed or approved only the uploader reads it. The bytes are not in this table.';
comment on column nestly.media_assets.id is 'The image.';
comment on column nestly.media_assets.owner_id is 'The uploader (default auth.uid()). Never granted to a client: an anonymous post''s image must not name its author.';
comment on column nestly.media_assets.owner_status is 'Copy of the uploader''s users.status (composite FK, ON UPDATE CASCADE): a suspended uploader''s images are hidden. Never granted.';
comment on column nestly.media_assets.kind is 'post, profile or story.';
comment on column nestly.media_assets.status is 'pending (waiting for the server check) · passed · queued (blocked or unsure: waits for staff) · approved · rejected · suspected (a child may be in danger: hidden up to 90 days, BR-077).';
comment on column nestly.media_assets.mime is 'The stored format; the server re-encodes every upload (no EXIF or GPS, M4).';
comment on column nestly.media_assets.width is 'Pixels, at most 2,048 (VAL-041, AC-104).';
comment on column nestly.media_assets.height is 'Pixels, at most 2,048.';
comment on column nestly.media_assets.byte_size is 'Size of the stored image, at most 15 MB.';
comment on column nestly.media_assets.post_id is 'The post this image belongs to, set once by the uploader; NULL for a profile photo, a Story image and an image not yet attached. The image goes with the post.';
comment on column nestly.media_assets.position is 'Order inside the post, 0 to 3 (at most 4 images, VAL-041); set with post_id.';
comment on column nestly.media_assets.is_child is 'Marked by staff when queued: "a child is in the image". Such an image never enters the training set, even if approved.';
comment on column nestly.media_assets.queue_reason is 'Why it was queued: blocked (the model found a covered-up part exposed), unsure (a lower score) or error (the check failed repeatedly). NULL if never queued.';
comment on column nestly.media_assets.scores is 'The model''s highest score per target label. Never granted to a client.';
comment on column nestly.media_assets.check_attempts is 'How many times the check failed; after the limit the image goes to the queue (fail closed). Never granted to a client.';
comment on column nestly.media_assets.checked_at is 'When the check moved the image.';
comment on column nestly.media_assets.decided_by is 'The staff member who approved, rejected or suspected it (set by the guard).';
comment on column nestly.media_assets.decided_at is 'When.';
comment on column nestly.media_assets.purge_after is 'A suspected image: 90 days after the decision, then it is deleted (BR-077).';
comment on column nestly.media_assets.created_at is 'Upload time; a Story image expires 24 hours after it.';
comment on table nestly.profile_photos is 'FR-PROFILE-001: the current photo of an account; replacing it deletes the previous image at once (BR-077). Anyone active reads it once the image passed.';
comment on column nestly.profile_photos.user_id is 'The account (default auth.uid()).';
comment on column nestly.profile_photos.user_status is 'Copy of users.status (composite FK). Never granted.';
comment on column nestly.profile_photos.media_id is 'The current image (kind profile).';
comment on column nestly.profile_photos.media_status is 'Copy of the image''s status (composite FK, ON UPDATE CASCADE): the policy''s "has it passed". Set by the trigger.';
comment on column nestly.profile_photos.updated_at is 'When the photo was set.';
comment on table nestly.stories is 'FR-FEED-008: a Story, one image and an optional short text for 24 hours; at most 10 per author in 24 hours (stories_prepare, VAL-042, ERR-040). Created in the same transaction as its image; the image and the Story are deleted together.';
comment on column nestly.stories.id is 'The Story.';
comment on column nestly.stories.author_id is 'The author (Regular only; default auth.uid()).';
comment on column nestly.stories.author_status is 'Copy of users.status (composite FK). Never granted.';
comment on column nestly.stories.media_id is 'The Story''s image (kind story); the Story goes with it.';
comment on column nestly.stories.media_status is 'Copy of the image''s status (composite FK, ON UPDATE CASCADE): others see the Story only after the image passed.';
comment on column nestly.stories.caption is 'Optional text, 1 to 200 characters.';
comment on column nestly.stories.audience is 'everyone or friends.';
comment on column nestly.stories.created_at is 'Set by the trigger to the transaction time (equal to the image''s).';
comment on column nestly.stories.expires_at is 'created_at + 24 hours (set by the trigger); the policy hides the Story from then on.';
comment on table nestly.media_training_samples is 'decisions-in-force.md §2: a blocked or queued image with the staff decision, kept to improve safety only. Never an image marked with a child, never a suspected one. Admin reads; expires after 12 months (purge by the job role).';
comment on column nestly.media_training_samples.id is 'The sample.';
comment on column nestly.media_training_samples.source_media_id is 'The image it was copied from (no foreign key: the sample outlives it).';
comment on column nestly.media_training_samples.label is 'blocked (rejected) or allowed (approved).';
comment on column nestly.media_training_samples.queue_reason is 'Why the image was queued.';
comment on column nestly.media_training_samples.image is 'The image bytes.';
comment on column nestly.media_training_samples.mime is 'Format of image.';
comment on column nestly.media_training_samples.decided_by is 'The staff member who decided (default auth.uid()).';
comment on column nestly.media_training_samples.created_at is 'When it was added.';
comment on column nestly.media_training_samples.expires_at is 'Deleted after this time (12 months).';
comment on function nestly.media_assets_update_guard() is 'SECURITY INVOKER. Who may change which column of media_assets: the check job moves pending images; staff decide queued ones; the uploader attaches to their own post (at most 4).';
comment on function nestly.profile_photos_prepare() is 'SECURITY INVOKER. The image must be the caller''s own profile image; copies its status.';
comment on function nestly.profile_photos_replaced() is 'SECURITY INVOKER. A replaced profile photo''s image is deleted at once (BR-077).';
comment on function nestly.stories_prepare() is 'SECURITY INVOKER. At most 10 Stories in 24 hours (NS021); the image is the caller''s Story image uploaded in this transaction (NS022); sets the clock.';
comment on policy media_assets_select_owner on nestly.media_assets is 'The uploader reads their own images (a Story image for 24 hours).';
comment on policy media_assets_select_viewer on nestly.media_assets is 'Others read an image only after it passed or was approved, through a post, profile photo or Story they can read.';
comment on policy media_assets_select_staff on nestly.media_assets is 'CONTENT_MODERATE reads the queue and the decided images (never the uploader: owner_id is not granted).';
comment on policy media_assets_insert_owner on nestly.media_assets is 'A Regular or Professional uploads, always as pending.';
comment on policy media_assets_update_owner on nestly.media_assets is 'The uploader attaches an unattached post image to their post; the guard checks the rest.';
comment on policy media_assets_update_staff on nestly.media_assets is 'CONTENT_MODERATE decides a queued image.';
comment on policy media_assets_delete_owner on nestly.media_assets is 'The uploader deletes their own image (a replaced profile photo, a removed Story).';
comment on policy media_assets_select_jobs on nestly.media_assets is 'The job role reads what it checks and purges (rule 6).';
comment on policy media_assets_update_jobs on nestly.media_assets is 'The job role records the check result on a pending image.';
comment on policy media_assets_delete_jobs on nestly.media_assets is 'The purge: expired Stories, suspected images after 90 days, rejected after 30 days, unattached uploads after 24 hours.';
comment on policy profile_photos_select_viewer on nestly.profile_photos is 'The owner always; others once the image passed.';
comment on policy profile_photos_insert_owner on nestly.profile_photos is 'A Regular or Professional sets their own photo.';
comment on policy profile_photos_update_owner on nestly.profile_photos is 'Replaces the own photo.';
comment on policy stories_select_viewer on nestly.stories is 'Unexpired Stories: the author at once, others after the image passed, by audience (everyone or accepted Friends).';
comment on policy stories_insert_author on nestly.stories is 'A Regular publishes as themselves.';
comment on policy stories_select_jobs on nestly.stories is 'The purge reads expired Stories.';
comment on policy media_training_samples_select_admin on nestly.media_training_samples is 'The Admin only.';
comment on policy media_training_samples_insert_staff on nestly.media_training_samples is 'Staff add the sample of the image they decided: never one marked with a child, never a suspected one.';
comment on policy media_training_samples_delete_admin on nestly.media_training_samples is 'The Admin deletes a sample (audited).';
comment on policy media_training_samples_select_jobs on nestly.media_training_samples is 'The expiry job reads expired samples.';
comment on policy media_training_samples_delete_jobs on nestly.media_training_samples is 'The expiry job deletes expired samples.';
comment on index nestly.media_assets_owner_idx is 'The uploader''s images by kind.';
comment on index nestly.media_assets_post_idx is 'The images of a post in order.';
comment on index nestly.media_assets_work_idx is 'The check job and the approval queue.';
comment on index nestly.media_assets_decided_by_idx is 'The RESTRICT check on a users delete.';
comment on index nestly.stories_author_idx is 'The 10-in-24-hours count and an author''s Stories.';
comment on index nestly.stories_feed_idx is 'The Stories tray, newest first.';
comment on index nestly.media_training_samples_expires_idx is 'The expiry job.';
comment on index nestly.media_training_samples_decided_by_idx is 'The RESTRICT check on a users delete.';
