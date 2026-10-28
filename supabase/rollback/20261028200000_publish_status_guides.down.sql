-- =====================================================================================================================
-- Down script for supabase/migrations/20261028200000_publish_status_guides.sql: deletes the 14 guides it published, by title.
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it removes published content from every home: Afik only.
-- Safe:     nothing references a guide (no foreign key); the 9 seeded drafts are not touched. Audit entries about these guides, if an Admin
--           edited one, stay: the log is append-only.
-- Restores: the guides as before the migration; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the publish status guides down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.status_guides no force row level security;

delete from nestly.status_guides
where title in (
  'חומצה פולית: כדאי להתחיל עוד לפני ההריון',
  'ביקור טרום הריון: מה כדאי לבדוק מראש',
  'לוח הבדיקות בהריון במבט אחד',
  'השליש הראשון: מה קורה ומה עוזר',
  'השליש השני: הבטן גדלה והתנועות מתחילות',
  'השליש השלישי: לקראת הלידה',
  'שינה בטוחה לתינוקות',
  'מזון משלים: הטעימות הראשונות',
  'המפגשים בטיפת חלב והחיסונים',
  'מניעת הרעלות בבית',
  'צחצוח שיניים לפי גיל',
  'מושב בטיחות ובוסטר ברכב',
  'שעה של תנועה בכל יום',
  'חיסונים בבית הספר'
);

alter table nestly.status_guides force row level security;

delete from supabase_migrations.schema_migrations where version = '20261028200000';

commit;
