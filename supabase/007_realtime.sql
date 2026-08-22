-- Live classroom: the three class tables publish their changes so a register
-- or a student's page updates without a reload when the other side edits.
--
-- APPLIED 2026-08-23 to project nbawxlbofnicurqzgiyi. Idempotent: safe to re-run.
--
-- postgres_changes respects RLS per subscriber, so a student still only hears
-- about their own rows and a teacher about their own classes; nothing new is
-- exposed, only pushed. replica identity full makes a DELETE carry the whole
-- old row, which is what lets a `class_id=eq.…` filter match deletes too.

alter table public.classes       replica identity full;
alter table public.class_members replica identity full;
alter table public.meetings      replica identity full;

do $$
declare
  t text;
begin
  foreach t in array array['classes', 'class_members', 'meetings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- alter publication supabase_realtime drop table public.classes, public.class_members, public.meetings;
-- alter table public.classes       replica identity default;
-- alter table public.class_members replica identity default;
-- alter table public.meetings      replica identity default;
