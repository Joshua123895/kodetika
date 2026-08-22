// The rules of the teacher's meeting logbook, kept apart from the Supabase
// calls (src/lib/classroom.js) so they can be tested by running them. See
// supabase/002_meetings.sql for the table.

// The three states a meeting can stand in, in the order the chip walks
// through them. "unpaid" is the default and covers both halves of waiting:
// the meeting was just logged, or it happened and the money has not. A
// cancelled meeting stays in the book so the numbering does not lie.
export const PAYMENT_STEPS = ["unpaid", "paid", "cancelled"];

export const PAYMENT_LABELS = {
  unpaid: "Not paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

/** The status after one click on the chip: not paid -> paid -> cancelled -> round again. */
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

// The columns the table can be sorted on, each reduced to something
// comparable. Payment sorts by where it stands in the conversation, not
// alphabetically, so "unpaid" gathers at one end instead of the middle.
const SORT_VALUE = {
  num: (m) => m.num,
  met_on: (m) => m.met_on || "",
  note: (m) => (m.note || "").toLowerCase(),
  payment: (m) => PAYMENT_STEPS.indexOf(m.payment),
};

/**
 * The book ordered by one column. `dir` is "asc" or "desc"; an unknown key
 * falls back to newest-first rather than throwing mid-render. Ties break on
 * the meeting number so the order is stable whatever the column.
 */
export function sortBook(meetings, key, dir = "desc") {
  const value = SORT_VALUE[key];
  if (!value) return sortMeetings(meetings);
  const sign = dir === "asc" ? 1 : -1;
  return [...(meetings || [])].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va < vb) return -sign;
    if (va > vb) return sign;
    return b.num - a.num;
  });
}

/**
 * A meeting link as a usable href. Teachers paste addresses without the
 * scheme ("meet.google.com/abc"), and a bare anchor treats that as a path on
 * this site; prefixing https makes it leave the app like they meant it to.
 */
export function linkHref(link) {
  const trimmed = (link || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * A meeting's date as the table shows it: the day name and dd-mm-yyyy, so
 * "Saturday, 22-08-2026". Parsed as local midnight on purpose: `new Date(iso)`
 * on a bare date string is UTC midnight, which west of Greenwich reads back as
 * the day before. `locale` is an argument so tests are not at the mercy of the
 * machine running them.
 */
export function formatMetDate(iso, locale = undefined) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return String(iso);
  const weekday = date.toLocaleDateString(locale, { weekday: "long" });
  return `${weekday}, ${d}-${m}-${y}`;
}

/** A copy of `list` with the item at `from` moved to sit at `to`. */
export function moveItem(list, from, to) {
  const out = [...(list || [])];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

/** The book in date order, ties broken by the number it already carries. */
export function byDate(list) {
  return [...(list || [])].sort(
    (a, b) => String(a.met_on || "").localeCompare(String(b.met_on || "")) || a.num - b.num
  );
}

/**
 * What numbers `ordered` should carry, given it is the intended first-to-last
 * sequence. Numbering restarts from the lowest number already in the book, so
 * a teacher whose records begin at 12 keeps 12, 13, 14 rather than being reset
 * to 1 for the crime of dragging a row.
 *
 * Returns only the rows whose number actually changes: an unchanged row is an
 * update nobody needs to make.
 */
export function renumberPlan(ordered) {
  const list = ordered || [];
  if (!list.length) return [];
  const base = Math.min(...list.map((m) => m.num));
  return list
    .map((m, i) => ({ id: m.id, num: base + i, was: m.num }))
    .filter((p) => p.num !== p.was);
}

/** Is this book already numbered 1-per-row from its own base, in this order? */
export function isSequential(ordered) {
  return renumberPlan(ordered).length === 0;
}

/** "3 paid, 2 not paid, 1 cancelled", skipping empty groups; "" for an empty book. */
export function paymentSummary(meetings) {
  const counts = { unpaid: 0, paid: 0, cancelled: 0 };
  for (const m of meetings || []) {
    if (m.payment in counts) counts[m.payment] += 1;
  }
  const parts = [];
  if (counts.paid) parts.push(`${counts.paid} paid`);
  if (counts.unpaid) parts.push(`${counts.unpaid} not paid`);
  if (counts.cancelled) parts.push(`${counts.cancelled} cancelled`);
  return parts.join(", ");
}
