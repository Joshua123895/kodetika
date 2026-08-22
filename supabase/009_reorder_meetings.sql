-- Reordering a student's book: drag a row, and the numbers follow.
--
-- APPLIED 2026-08-24 to project nbawxlbofnicurqzgiyi. Idempotent: safe to re-run.
--
-- Renumbering cannot be done row by row from the client. Swapping #13 and #14
-- means one of the two updates must briefly write a number the other still
-- holds, and `unique (class_id, student_id, num)` rejects it the moment it is
-- written. So the constraint becomes DEFERRABLE — still checked, but at the
-- end of the transaction rather than per row — and the whole renumber happens
-- inside one function that defers it.
--
-- INITIALLY IMMEDIATE, so every other write in the app keeps failing fast and
-- loudly the way it does today; only this function asks for the deferral.

alter table public.meetings drop constraint if exists meetings_class_student_num_key;
alter table public.meetings
  add constraint meetings_class_student_num_key
  unique (class_id, student_id, num) deferrable initially immediate;

-- security INVOKER (the default): the caller's own RLS decides what they may
-- renumber, so this adds no reach beyond 002's teacher-only policy. It must
-- not become security definer without re-checking is_teacher_of by hand.
create or replace function public.reorder_meetings(p_ids uuid[])
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n     integer := coalesce(array_length(p_ids, 1), 0);
  cid   uuid;
  sid   uuid;
  base  integer;
  found integer;
  i     integer;
begin
  if n = 0 then
    return;
  end if;

  -- Every id must exist and belong to ONE student's book. Without this a
  -- caller could interleave two students' meetings and renumber across them.
  select class_id, student_id into cid, sid
  from public.meetings where id = p_ids[1];

  if cid is null then
    raise exception 'no such meeting';
  end if;

  select count(*), min(num) into found, base
  from public.meetings
  where id = any(p_ids) and class_id = cid and student_id = sid;

  if found <> n then
    raise exception 'the list must be one student''s whole book';
  end if;

  -- Held until commit, so the intermediate collisions never surface.
  set constraints public.meetings_class_student_num_key deferred;

  for i in 1 .. n loop
    update public.meetings set num = base + i - 1 where id = p_ids[i];
  end loop;
end;
$$;

revoke all on function public.reorder_meetings(uuid[]) from public;
grant execute on function public.reorder_meetings(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- drop function if exists public.reorder_meetings(uuid[]);
-- alter table public.meetings drop constraint if exists meetings_class_student_num_key;
-- alter table public.meetings add constraint meetings_class_student_num_key
--   unique (class_id, student_id, num);
