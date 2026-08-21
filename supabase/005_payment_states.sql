-- The payment column's states, reshaped to match how the teacher actually
-- thinks about a meeting: 'unpaid' (the default: just logged, or held but not
-- settled yet), 'paid', and 'cancelled' (the meeting did not happen). The old
-- 'asked' middle step is gone; rows that carried it fold back into 'unpaid'.
--
-- APPLIED 2026-08-23 to project nbawxlbofnicurqzgiyi. Idempotent: safe to re-run.

alter table public.meetings drop constraint if exists meetings_payment_check;
update public.meetings set payment = 'unpaid' where payment = 'asked';
alter table public.meetings
  add constraint meetings_payment_check check (payment in ('unpaid', 'paid', 'cancelled'));

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- alter table public.meetings drop constraint if exists meetings_payment_check;
-- update public.meetings set payment = 'unpaid' where payment = 'cancelled';
-- alter table public.meetings
--   add constraint meetings_payment_check check (payment in ('unpaid', 'asked', 'paid'));
