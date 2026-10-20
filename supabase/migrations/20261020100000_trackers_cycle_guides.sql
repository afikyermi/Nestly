-- =====================================================================================================================
-- Trackers, cycle and status guides -- I6 (home and tracking), migration only.
--
-- SRS: FR-TRACK-001/002 · FR-HOME-003/004 · FR-ADMIN-012 (storage only) · BR-053 · BR-070 · AC-007 · AC-023 · AC-095 ·
--      Afik 18.10.2026 (OP-008): time, child, one main value, optional note; cycle = start date + average length; owner-only.
--
-- tracker_events   one logged event of a child tracker (breastfeeding, bottle, sleep, diaper, medicine, growth, vaccine, bath).
--                  Health data about a minor: the owner reads, writes, edits and deletes it; nobody else, no role, no view (layer 9).
-- cycle_entries    one cycle start with the user's average cycle length. The ovulation window is computed by the application
--                  from the latest entry; it is never stored. Health data about the owner: owner only.
-- status_guides    system content: a guide per journey stage (planning, pregnancy by week, parenting by child age). Every user
--                  reads PUBLISHED guides only (AC-095). There is no write path for a runtime role yet; the admin management
--                  (FR-ADMIN-012) adds its own policies with the admin permission model. The seed rows are drafts awaiting
--                  Afik's approval (BR-070): a draft is never readable by a runtime role; publishing needs a source check date.
--
-- No SECURITY DEFINER: tests.approved_security_definer() is unchanged. No new function. Parent-delete: a child's events go with
-- the child (hard delete, like the child itself); an account's rows go with its profile.
-- The seed is inserted by the migration role with FORCE lifted for that one statement and put back at once (data-model
-- "Backfills"); rule 8 holds at every commit.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261020100000_trackers_cycle_guides.down.sql (drops the three tables; destroys the data in them).
-- =====================================================================================================================

-- 1. tracker_events
create table nestly.tracker_events (
  id          uuid          not null default gen_random_uuid(),
  user_id     uuid          not null default auth.uid(),
  child_id    uuid          not null,
  kind        text          not null,
  occurred_at timestamptz   not null,
  ended_at    timestamptz,
  amount_ml   smallint,
  choice      text,
  name        text,
  dosage      text,
  weight_kg   numeric(5,2),
  height_cm   numeric(4,1),
  head_cm     numeric(4,1),
  note        text,
  created_at  timestamptz   not null default now(),
  constraint tracker_events_pkey primary key (id),
  constraint tracker_events_user_id_fkey foreign key (user_id)
    references nestly.regular_profiles (user_id) on delete cascade,
  constraint tracker_events_child_id_fkey foreign key (child_id)
    references nestly.children (id) on delete cascade,
  constraint tracker_events_kind_check check (kind in
    ('breastfeeding', 'bottle', 'sleep', 'diaper', 'medicine', 'growth', 'vaccine', 'bath')),
  constraint tracker_events_note_check check (note is null or char_length(btrim(note)) between 1 and 500),
  constraint tracker_events_name_check check (name is null or char_length(btrim(name)) between 1 and 80),
  constraint tracker_events_dosage_check check (dosage is null or char_length(btrim(dosage)) between 1 and 60),
  constraint tracker_events_occurred_at_check check (occurred_at >= timestamptz '2000-01-01 00:00:00+00'),
  -- The fields of each kind (FR-TRACK-001, FR-TRACK-002); every other value column is NULL. AC-023: an end is never before its start.
  constraint tracker_events_fields_check check (case kind
    when 'breastfeeding' then coalesce(ended_at >= occurred_at and choice in ('left', 'right'), false)
      and amount_ml is null and name is null and dosage is null and weight_kg is null and height_cm is null and head_cm is null
    when 'sleep' then coalesce(ended_at >= occurred_at, false)
      and amount_ml is null and choice is null and name is null and dosage is null and weight_kg is null and height_cm is null and head_cm is null
    when 'bottle' then coalesce(amount_ml between 1 and 1000, false)
      and ended_at is null and choice is null and name is null and dosage is null and weight_kg is null and height_cm is null and head_cm is null
    when 'diaper' then coalesce(choice in ('wet', 'dirty'), false)
      and ended_at is null and amount_ml is null and name is null and dosage is null and weight_kg is null and height_cm is null and head_cm is null
    when 'medicine' then name is not null and dosage is not null
      and ended_at is null and amount_ml is null and choice is null and weight_kg is null and height_cm is null and head_cm is null
    when 'growth' then (weight_kg is not null or height_cm is not null or head_cm is not null)
      and (weight_kg is null or weight_kg between 0.3 and 300) and (height_cm is null or height_cm between 20 and 250)
      and (head_cm is null or head_cm between 15 and 80)
      and ended_at is null and amount_ml is null and choice is null and name is null and dosage is null
    when 'vaccine' then name is not null
      and ended_at is null and amount_ml is null and choice is null and dosage is null and weight_kg is null and height_cm is null and head_cm is null
    when 'bath' then ended_at is null and amount_ml is null and choice is null and name is null and dosage is null
      and weight_kg is null and height_cm is null and head_cm is null
    else false end)
);

-- 2. cycle_entries
create table nestly.cycle_entries (
  id                uuid        not null default gen_random_uuid(),
  user_id           uuid        not null default auth.uid(),
  start_date        date        not null,
  cycle_length_days smallint    not null,
  created_at        timestamptz not null default now(),
  constraint cycle_entries_pkey primary key (id),
  constraint cycle_entries_user_id_fkey foreign key (user_id)
    references nestly.regular_profiles (user_id) on delete cascade,
  constraint cycle_entries_start_date_check check (start_date >= date '2000-01-01'),
  constraint cycle_entries_cycle_length_days_check check (cycle_length_days between 15 and 60),
  constraint cycle_entries_user_id_start_date_key unique (user_id, start_date)
);

-- 3. status_guides
create table nestly.status_guides (
  id                uuid        not null default gen_random_uuid(),
  stage_kind        text        not null,
  range_from        smallint,
  range_to          smallint,
  title             text        not null,
  body              text        not null,
  source            text        not null,
  source_checked_on date,
  status            text        not null default 'draft',
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  constraint status_guides_pkey primary key (id),
  constraint status_guides_stage_kind_check check (stage_kind in ('planning', 'pregnancy', 'parenting')),
  constraint status_guides_status_check check (status in ('draft', 'published', 'hidden')),
  constraint status_guides_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint status_guides_body_check check (char_length(btrim(body)) between 1 and 4000),
  constraint status_guides_source_check check (char_length(btrim(source)) between 1 and 300),
  -- planning has no range; pregnancy is in weeks 1..42; parenting is the child's age in months 0..216 (18 years).
  constraint status_guides_range_check check (coalesce(case stage_kind
    when 'planning' then range_from is null and range_to is null
    when 'pregnancy' then range_from between 1 and 42 and range_to between range_from and 42
    else range_from between 0 and 216 and range_to between range_from and 216 end, false)),
  -- BR-070: a guide is published only with its source checked on a date.
  constraint status_guides_published_check check (status <> 'published' or (source_checked_on is not null and published_at is not null))
);

-- 4. Indexes: each serves a query.
create index tracker_events_user_kind_time_idx on nestly.tracker_events (user_id, kind, occurred_at desc);  -- the page's history and period
create index tracker_events_child_id_idx on nestly.tracker_events (child_id);                                -- the cascade from a child
create index cycle_entries_user_start_idx on nestly.cycle_entries (user_id, start_date desc);              -- history, latest entry
create index status_guides_published_idx on nestly.status_guides (stage_kind, range_from) where status = 'published'; -- the home's lookup

-- 5. RLS on, and forced (platform rule 8).
alter table nestly.tracker_events enable row level security;
alter table nestly.tracker_events force  row level security;
alter table nestly.cycle_entries  enable row level security;
alter table nestly.cycle_entries  force  row level security;
alter table nestly.status_guides  enable row level security;
alter table nestly.status_guides  force  row level security;

-- 6. Policies -- all TO authenticated. Owner only, active account only (platform rules 12, 14, 15). A Regular account only.
create policy tracker_events_select_own on nestly.tracker_events
  for select to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));
create policy tracker_events_insert_own on nestly.tracker_events
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account())
    and (select nestly.caller_account_type()) = 'regular'
    and exists (select 1 from nestly.children c where c.id = tracker_events.child_id));
create policy tracker_events_update_own on nestly.tracker_events
  for update to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()))
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));
create policy tracker_events_delete_own on nestly.tracker_events
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));

create policy cycle_entries_select_own on nestly.cycle_entries
  for select to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));
create policy cycle_entries_insert_own on nestly.cycle_entries
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account())
    and (select nestly.caller_account_type()) = 'regular');
create policy cycle_entries_update_own on nestly.cycle_entries
  for update to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()))
  with check (user_id = (select auth.uid()) and (select nestly.is_active_account()));
create policy cycle_entries_delete_own on nestly.cycle_entries
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select nestly.is_active_account()));

create policy status_guides_select_published on nestly.status_guides
  for select to authenticated
  using (status = 'published' and (select nestly.is_active_account()));

-- 7. Grants -- authenticated only. INSERT and UPDATE per column: id, user_id, child_id on update, kind on update and the
--    clocks always keep what the database or the insert set (platform rules 12, 13). Nothing to anon.
grant select, delete on table nestly.tracker_events, nestly.cycle_entries to authenticated;
grant select on table nestly.status_guides to authenticated;

grant insert (child_id, kind, occurred_at, ended_at, amount_ml, choice, name, dosage, weight_kg, height_cm, head_cm, note)
  on table nestly.tracker_events to authenticated;
grant update (occurred_at, ended_at, amount_ml, choice, name, dosage, weight_kg, height_cm, head_cm, note)
  on table nestly.tracker_events to authenticated;
grant insert (start_date, cycle_length_days) on table nestly.cycle_entries to authenticated;
grant update (start_date, cycle_length_days) on table nestly.cycle_entries to authenticated;

-- 8. Comments.
comment on table nestly.tracker_events is
  'SRS TrackerEvent (§13, FR-TRACK-001/002, OP-008): one logged event of a child tracker. Health data about a minor; readable and writable by its owner only, never shared. Deleted with the child or the profile.';
comment on column nestly.tracker_events.id is 'Generated by the database (platform rule 13).';
comment on column nestly.tracker_events.user_id is 'The owning Regular account. Set by the database (auth.uid()), never by the client (platform rule 12).';
comment on column nestly.tracker_events.child_id is 'The owner''s child the event is about. Fixed at insert; the policy requires a child the caller can read, i.e. their own.';
comment on column nestly.tracker_events.kind is 'breastfeeding, bottle, sleep, diaper, medicine, growth, vaccine or bath (FR-HOME-003, OP-007). Fixed at insert.';
comment on column nestly.tracker_events.occurred_at is 'When the event happened; for breastfeeding and sleep, its start.';
comment on column nestly.tracker_events.ended_at is 'Breastfeeding and sleep only: the end, never before the start (AC-023).';
comment on column nestly.tracker_events.amount_ml is 'Bottle only: the amount in ml, 1 to 1000.';
comment on column nestly.tracker_events.choice is 'Breastfeeding: left or right. Diaper: wet or dirty.';
comment on column nestly.tracker_events.name is 'Medicine: the medicine''s name. Vaccine: the vaccine''s name.';
comment on column nestly.tracker_events.dosage is 'Medicine only: the dose as the user writes it.';
comment on column nestly.tracker_events.weight_kg is 'Growth only: weight in kg.';
comment on column nestly.tracker_events.height_cm is 'Growth only: height in cm.';
comment on column nestly.tracker_events.head_cm is 'Growth only: head circumference in cm.';
comment on column nestly.tracker_events.note is 'The free note, optional, up to 500 characters.';
comment on column nestly.tracker_events.created_at is 'When the row was written (database clock).';
comment on constraint tracker_events_fields_check on nestly.tracker_events is
  'The fields each kind needs and no others (FR-TRACK-001); AC-023 for the end of a breastfeeding or a sleep.';

comment on table nestly.cycle_entries is
  'SRS cycle tracking (§13, FR-TRACK-001, OP-008): the start date of a cycle and the user''s average cycle length. The ovulation window is computed from the latest entry, never stored. Health data about the owner; owner only.';
comment on column nestly.cycle_entries.id is 'Generated by the database (platform rule 13).';
comment on column nestly.cycle_entries.user_id is 'The owning Regular account. Set by the database (auth.uid()), never by the client (platform rule 12).';
comment on column nestly.cycle_entries.start_date is 'The first day of the cycle. One entry per date per user.';
comment on column nestly.cycle_entries.cycle_length_days is 'The user''s average cycle length in days, 15 to 60.';
comment on column nestly.cycle_entries.created_at is 'When the row was written (database clock).';

comment on table nestly.status_guides is
  'SRS status guide (FR-HOME-004, FR-ADMIN-012, BR-070): system content per journey stage. Users read published guides only (AC-095); a draft awaits Afik''s approval.';
comment on column nestly.status_guides.id is 'Generated by the database (platform rule 13).';
comment on column nestly.status_guides.stage_kind is 'planning, pregnancy or parenting.';
comment on column nestly.status_guides.range_from is 'Pregnancy: first week (1..42). Parenting: youngest child age in months (0..216). NULL for planning.';
comment on column nestly.status_guides.range_to is 'The last week or month the guide covers (inclusive). NULL for planning.';
comment on column nestly.status_guides.title is 'The guide''s headline, up to 120 characters.';
comment on column nestly.status_guides.body is 'The guide text, rewritten in the product''s words (BR-070), up to 4000 characters. The medical-advice disclaimer is shown by the product, not stored here.';
comment on column nestly.status_guides.source is 'The recognized sources the text rests on (BR-070).';
comment on column nestly.status_guides.source_checked_on is 'The date the sources were checked; required to publish (BR-070).';
comment on column nestly.status_guides.status is 'draft (awaiting approval), published or hidden. Only published is readable by users (AC-095).';
comment on column nestly.status_guides.published_at is 'When the guide was published; required while published.';
comment on column nestly.status_guides.created_at is 'When the row was written (database clock).';
comment on policy tracker_events_select_own on nestly.tracker_events is 'An active account reads its own events only (layer 9).';
comment on policy tracker_events_insert_own on nestly.tracker_events is 'An active Regular account writes its own events, for a child it can read.';
comment on policy tracker_events_update_own on nestly.tracker_events is 'An active account edits its own events; the granted columns exclude kind and child.';
comment on policy tracker_events_delete_own on nestly.tracker_events is 'An active account deletes its own events (hard delete).';
comment on policy cycle_entries_select_own on nestly.cycle_entries is 'An active account reads its own cycle entries only (layer 9).';
comment on policy cycle_entries_insert_own on nestly.cycle_entries is 'An active Regular account writes its own cycle entries.';
comment on policy cycle_entries_update_own on nestly.cycle_entries is 'An active account edits its own cycle entries.';
comment on policy cycle_entries_delete_own on nestly.cycle_entries is 'An active account deletes its own cycle entries (hard delete).';
comment on policy status_guides_select_published on nestly.status_guides is 'An active account reads published guides only (AC-095); drafts and hidden guides are invisible to every runtime role.';

-- 9. Seed: draft guides awaiting Afik's approval (BR-070). Not readable by any runtime role until published with a source date.
alter table nestly.status_guides no force row level security;

insert into nestly.status_guides (stage_kind, range_from, range_to, title, body, source) values
  ('planning', null, null, 'מתכננים הריון: איך מתחילים',
   'לפני שמנסים להרות כדאי להיפגש עם רופא או רופאה, לבדוק אילו בדיקות וחיסונים מומלצים ולברר אם יש תרופות שכדאי לעדכן. מקובל להמליץ על נטילת חומצה פולית לפני ההריון ובתחילתו, על תזונה מאוזנת, על פעילות גופנית סדירה ועל הימנעות מעישון ומאלכוהול. חלון הביוץ שמוצג באפליקציה הוא הערכה בלבד ואינו תחליף לבדיקה רפואית.',
   'משרד הבריאות; NHS; ACOG'),
  ('pregnancy', 1, 13, 'השליש הראשון: מה כדאי לדעת',
   'בתחילת ההריון כדאי לקבוע מעקב הריון, להמשיך בנטילת חומצה פולית לפי הנחיית הצוות הרפואי ולהימנע מעישון ומאלכוהול. בחילות ועייפות שכיחות בשלב הזה. דימום או כאבים חזקים הם סיבה לפנות לצוות הרפואי.',
   'משרד הבריאות; ACOG; NHS'),
  ('pregnancy', 14, 27, 'השליש השני: הזמן לנשום',
   'בשליש השני רבות מהנשים מרגישות טוב יותר. בדרך כלל זה הזמן לסקירת מערכות ולבדיקת העמסת סוכר, לפי הנחיית הצוות הרפואי. כדאי להמשיך בפעילות גופנית מתונה, בתזונה מאוזנת ובשתייה מספקת.',
   'משרד הבריאות; ACOG; NHS'),
  ('pregnancy', 28, 42, 'השליש השלישי: מתכוננים ללידה',
   'בשליש האחרון כדאי להכין תיק ללידה, לברר איך מגיעים לבית החולים ולהתייעץ עם הצוות על תוכנית הלידה. את הסימנים שמחייבים הגעה לבדיקה ואת הנחיות ספירת תנועות העובר כדאי לקבל מהצוות הרפואי שמלווה אתכם.',
   'משרד הבריאות; ACOG; NHS'),
  ('parenting', 0, 3, 'החודשים הראשונים עם התינוק',
   'תינוקות בגיל הזה אוכלים בתדירות גבוהה וישנים בהפסקות קצרות. מומלץ להשכיב לשינה על הגב, על מזרן יציב וללא כריות וצעצועים במיטה. כדאי לקבוע ביקורים בטיפת חלב ולעקוב אחרי לוח החיסונים. חום גבוה בתינוק צעיר מחייב פנייה מיידית לרופא או לרופאה.',
   'משרד הבריאות (טיפת חלב); AAP; WHO'),
  ('parenting', 4, 11, 'מחצית השנה הראשונה והלאה',
   'בסביבות גיל חצי שנה מתחילים להכניס מזונות משלימים בהדרגה, לצד חלב אם או תמ"ל. כדאי להציע כמויות קטנות ולשים לב לסימני בשלות. תינוקות בגיל הזה מתהפכים וזוחלים, ולכן חשוב לבדוק שהבית בטוח.',
   'משרד הבריאות (טיפת חלב); AAP; WHO'),
  ('parenting', 12, 23, 'שנה ומעבר: הליכה ושפה',
   'בגיל הזה ילדים מתחילים ללכת ולדבר. שגרת שינה קבועה, קריאה משותפת ומשחק חופשי תומכים בהתפתחות. כדאי להמשיך בביקורים בטיפת חלב ובחיסונים לפי הלוח.',
   'משרד הבריאות (טיפת חלב); AAP; CDC'),
  ('parenting', 24, 35, 'גיל שנתיים: גבולות ושגרה',
   'בגיל שנתיים הילדים בודקים גבולות ומביעים רצונות חזקים. שגרה צפויה, בחירות פשוטות והכנה מראש למעברים מקלות על ההתמודדות. כדאי להגביל את זמן המסכים ולשמור על זמן משחק פעיל בכל יום.',
   'משרד הבריאות; AAP; NHS'),
  ('parenting', 36, 71, 'גיל הגן: שינה, משחק ומסכים',
   'ילדי גן זקוקים לשעות שינה מספקות, לפעילות גופנית יומיומית ולזמן משחק עם ילדים אחרים. כדאי להגביל מסכים, לבחור תכנים מתאימים לגיל ולצפות בהם יחד.',
   'משרד הבריאות; AAP; CDC');

alter table nestly.status_guides force row level security;
