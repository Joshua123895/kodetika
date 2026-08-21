-- The logbook hangs off the student, not the class: a teacher's meetings,
-- numbering and payment standing are per student, and two students in the same
-- class can be on meeting 12 and meeting 3 at once.
--
-- APPLIED 2026-08-23 to project nbawxlbofnicurqzgiyi. Idempotent: safe to re-run.
--
-- References auth.users rather than class_members on purpose: the book is the
-- teacher's record, and a student leaving the class should not burn it. Rows
-- only die with the class (002's cascade) or the account itself.

alter table public.meetings
  add column if not exists student_id uuid references auth.users (id) on delete cascade;

-- The table shipped hours before this change and carried only test rows;
-- anything without a student predates the per-student model.
delete from public.meetings where student_id is null;

alter table public.meetings alter column student_id set not null;

alter table public.meetings drop constraint if exists meetings_class_id_num_key;
alter table public.meetings drop constraint if exists meetings_class_student_num_key;
alter table public.meetings
  add constraint meetings_class_student_num_key unique (class_id, student_id, num);

create index if not exists meetings_student_idx on public.meetings (class_id, student_id);

-- The teacher-only policy from 002 already covers the new column: it gates on
-- the class, and every student in the book is in one of the teacher's classes.

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- alter table public.meetings drop constraint if exists meetings_class_student_num_key;
-- alter table public.meetings drop column if exists student_id;
-- alter table public.meetings add constraint meetings_class_id_num_key unique (class_id, num);
