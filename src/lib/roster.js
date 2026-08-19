// Turns a row of the `class_progress` view into the line a teacher reads.
//
// Pure, and built on journey.js rather than beside it: a student's own profile
// page and a teacher's view of that student are the same arithmetic over the
// same blob, and two implementations would drift until they disagreed about how
// many levels somebody had done.

import { trackSummaries, overallTotals, softSpots } from "./journey";

const DAY_MS = 86400000;

/** A week without a submission is the point where a teacher wants to know. */
export const IDLE_DAYS = 7;

/** Retries on one level before it is worth flagging rather than just noting. */
export const STUCK_RETRIES = 3;

/**
 * One student.
 *
 * `member` is a row from the view: display_name, progress, practice,
 * updated_at. A student who has joined but never submitted anything has null
 * for progress and practice, which is the common case on day one and must not
 * throw.
 */
export function rosterRow(tracks, member, { now = Date.now() } = {}) {
  const progress = member.progress || {};
  const practice = member.practice || {};

  const summaries = trackSummaries(tracks, progress);
  const totals = overallTotals(summaries);

  // Where they are actually working: most levels done, ties to the most stars.
  const furthest =
    summaries
      .filter((s) => s.started)
      .sort((a, b) => b.done - a.done || b.stars - a.stars)[0] || null;

  const stuck = softSpots(tracks, practice.review || {}, { limit: 2 });

  const lastMs = member.updated_at ? Date.parse(member.updated_at) : NaN;
  const idleDays = Number.isNaN(lastMs) ? null : Math.floor((now - lastMs) / DAY_MS);

  return {
    studentId: member.student_id,
    name: member.display_name,
    levels: totals.levels,
    stars: totals.stars,
    mastery: totals.mastery,
    streak: practice.day?.streak || 0,
    furthest,
    stuck,
    idleDays,
    // Two different kinds of trouble, deliberately one flag: a student stuck on
    // one level and a student who stopped coming both need the same nudge, and
    // a teacher scanning thirty rows wants one column to sort on.
    needsHelp:
      stuck.some((s) => s.fails >= STUCK_RETRIES) ||
      (idleDays !== null && idleDays >= IDLE_DAYS),
  };
}

/**
 * The whole register, in the order a teacher wants to read it.
 *
 * Anyone needing help first: the point of the page is to find them without
 * reading every row. Names break ties so the list is stable between loads
 * rather than reshuffling on every fetch.
 */
export function rosterRows(tracks, members = [], opts = {}) {
  return members
    .map((m) => rosterRow(tracks, m, opts))
    .sort(
      (a, b) =>
        Number(b.needsHelp) - Number(a.needsHelp) ||
        (a.name || "").localeCompare(b.name || "")
    );
}

/** Headline counts for the class, so the teacher sees the shape before the detail. */
export function classSummary(rows) {
  return {
    students: rows.length,
    needHelp: rows.filter((r) => r.needsHelp).length,
    activeToday: rows.filter((r) => r.idleDays === 0).length,
    neverStarted: rows.filter((r) => r.levels === 0).length,
    medianLevels: median(rows.map((r) => r.levels)),
  };
}

// Median rather than mean: one student who has done 300 levels would drag an
// average far above where the class actually is.
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
