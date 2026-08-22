-- The register shows each student's photo, so a teacher scanning thirty rows
-- recognises faces rather than reading thirty names.
--
-- APPLIED 2026-08-24 to project nbawxlbofnicurqzgiyi. Idempotent: safe to re-run.
--
-- Dropped and recreated rather than `create or replace`: Postgres only lets a
-- replace ADD columns at the end, and avatar_url belongs beside the name.
--
-- One column added, deliberately narrow. The view is security definer, so it
-- CAN read all of auth.users.raw_user_meta_data — which is exactly why it must
-- name the single key it wants. The rest of that object is the student's
-- (sign-in provider, phone, whatever a future feature puts there) and is no
-- more the teacher's business than saved_code was.

drop view if exists public.class_progress;

create view public.class_progress
with (security_invoker = false) as
  select
    m.class_id,
    m.student_id,
    m.display_name,
    m.joined_at,
    -- Google fills `picture`, our own uploader fills `avatar_url`; profile.js
    -- reads them in that same order of preference.
    coalesce(
      u.raw_user_meta_data ->> 'avatar_url',
      u.raw_user_meta_data ->> 'picture'
    ) as avatar_url,
    p.data     as progress,
    p.practice as practice,
    p.updated_at
  from public.class_members m
  join public.classes c on c.id = m.class_id
  left join public.progress p on p.user_id = m.student_id
  left join auth.users u on u.id = m.student_id
  where c.teacher_id = auth.uid();

-- Supabase's default privileges hand anon select on anything created in public,
-- and a role grant survives a revoke from PUBLIC, so both are needed. See 001.
revoke all on public.class_progress from public;
revoke all on public.class_progress from anon;
grant select on public.class_progress to authenticated;

-- ---------------------------------------------------------------------------
-- Rollback: recreate the view exactly as 001 left it.
-- ---------------------------------------------------------------------------
-- drop view if exists public.class_progress;
-- create view public.class_progress with (security_invoker = false) as
--   select m.class_id, m.student_id, m.display_name, m.joined_at,
--          p.data as progress, p.practice as practice, p.updated_at
--   from public.class_members m
--   join public.classes c on c.id = m.class_id
--   left join public.progress p on p.user_id = m.student_id
--   where c.teacher_id = auth.uid();
-- revoke all on public.class_progress from public;
-- revoke all on public.class_progress from anon;
-- grant select on public.class_progress to authenticated;
