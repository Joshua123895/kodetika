// The rules of the teacher's meeting logbook, kept apart from the Supabase
// calls (src/lib/classroom.js) so they can be tested by running them. See
// supabase/002_meetings.sql for the table.

// The three places a payment conversation can stand, in the order the chip
// walks through them. "unpaid" reads as "Not asked" because that is the
// question the teacher is tracking: have I brought it up yet?
export const PAYMENT_STEPS = ["unpaid", "asked", "paid"];

export const PAYMENT_LABELS = {
  unpaid: "Not asked",
  asked: "Asked",
  paid: "Paid",
};

/** The status after one click on the chip: not asked -> asked -> paid -> round again. */
export function cyclePayment(current) {
  const at = PAYMENT_STEPS.indexOf(current);
  return PAYMENT_STEPS[(at + 1) % PAYMENT_STEPS.length];
}

/**
 * The number the next logged meeting should offer.
 *
 * Explicitly max + 1 rather than count + 1: the teacher's history predates the
 * app, so the first row they log may be meeting 12, and the next offer must
 * then be 13. An empty book offers 1, which the teacher is free to overtype.
 */
export function nextMeetingNumber(meetings) {
  if (!meetings || meetings.length === 0) return 1;
  return Math.max(...meetings.map((m) => m.num)) + 1;
}

/** Meetings newest-first, which is the order a logbook is read in. */
export function sortMeetings(meetings) {
  return [...(meetings || [])].sort((a, b) => b.num - a.num);
}

/** "3 paid, 1 asked, 2 not asked", skipping empty groups; "" for an empty book. */
export function paymentSummary(meetings) {
  const counts = { unpaid: 0, asked: 0, paid: 0 };
  for (const m of meetings || []) {
    if (m.payment in counts) counts[m.payment] += 1;
  }
  const parts = [];
  if (counts.paid) parts.push(`${counts.paid} paid`);
  if (counts.asked) parts.push(`${counts.asked} asked`);
  if (counts.unpaid) parts.push(`${counts.unpaid} not asked`);
  return parts.join(", ");
}
