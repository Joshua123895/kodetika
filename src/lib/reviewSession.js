// A review session: the due queue frozen at the moment you started, so the
// page can tell you what happened to each level as you work through it.
//
// The freeze is the whole design. dueLevels() is live, which is right for the
// home-page card but wrong for a session: promote a level and it silently
// leaves the list, fail one and it stays, and either way the page under you
// reshuffles. Snapshotting turns "the queue" into "today's session", with a
// beginning, an end, and a summary that can say what you achieved.
//
// Pure except for sessionStorage, which is the correct home for something that
// should survive navigating into a level and back but should NOT follow you to
// tomorrow or to another device.

import { loadPractice, isRetired, dueLevels, dayKey } from "./practice";
import { locateLevel } from "./journey";

const SESSION_KEY = "kodetika_reviewSession";

/**
 * Today's session: reused if one was already started today, frozen from the
 * live due queue otherwise. `tracks` is passed in (not imported) for the same
 * reason journey.js does it: the rules stay testable against a fixture.
 *
 * Returns null when there was nothing due to review, which the page renders as
 * "all clear" rather than an empty session.
 */
export function getSession(tracks, progress, { now = Date.now(), limit = 20 } = {}) {
  const today = dayKey(now);

  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (stored && stored.date === today && Array.isArray(stored.items) && stored.items.length) {
      return stored;
    }
  } catch {
    // A corrupt blob just means a fresh session.
  }

  const due = dueLevels(progress, { now, limit });
  if (due.length === 0) return null;

  const items = due
    .map((d) => {
      const found = locateLevel(tracks, d.trackSlug, d.levelId);
      if (!found) return null; // a level that no longer exists in the YAML
      return {
        trackSlug: d.trackSlug,
        levelId: d.levelId,
        name: found.levelName,
        trackName: found.trackName,
        path: found.path,
        // The box at session start is what "promoted" is measured against.
        startBox: d.box,
      };
    })
    .filter(Boolean);
  if (items.length === 0) return null;

  const session = { date: today, items };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Blocked storage degrades to a session that resets on navigation.
  }
  return session;
}

/** Throws today's session away, so tomorrow (or a retry) starts fresh. */
export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear is fine.
  }
}

/**
 * What has happened to one session item since the session started.
 *
 *   pending   not attempted yet (entry unchanged since the snapshot)
 *   retired   promoted clean out of the last box; it will stop coming back
 *   promoted  moved up a box; the next sighting is further away
 *   fellback  attempted and missed, parked back at the start
 *
 * Measured against the CURRENT review entry, so it stays correct however many
 * times the level was attempted during the session.
 */
export function itemStatus(item, review = {}, progress = {}) {
  const entry = review?.[item.trackSlug]?.[String(item.levelId)];

  // No entry is the seeded case: a low-starred level with no review history.
  // Acing it stores nothing on purpose (recordLevelResult keeps no record of a
  // clean pass with no history), so the review map alone cannot tell "aced" and
  // "untouched" apart. The progress map can: seeding only ever picks levels
  // below three stars, so three stars now means it was aced this session and
  // will never be due again, which is what retired means.
  if (!entry) {
    const stars = progress?.[item.trackSlug]?.[String(item.levelId)] || 0;
    return stars >= 3 ? "retired" : "pending";
  }
  if (isRetired(entry)) return "retired";
  if (entry.box > item.startBox) return "promoted";
  if (entry.box === 0 && item.startBox === 0) {
    // Same box could be untouched or could be a fail that re-parked it at 0.
    // `last` moving is what tells them apart, and the snapshot deliberately
    // does not carry `last`: an item attempted during the session has an entry
    // stamped after the session began.
    return entry.last && entry.last >= sessionStartGuess(item) ? "fellback" : "pending";
  }
  if (entry.box < item.startBox) return "fellback";
  return "pending";
}

// The session stores a date, not a timestamp; anything stamped today counts as
// "during the session". Good enough on purpose: sessions are daily.
function sessionStartGuess() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The whole session with a status per item, plus the summary counts. */
export function sessionReport(session, progress = {}, review = loadPractice().review || {}) {
  const items = session.items.map((item) => ({ ...item, status: itemStatus(item, review, progress) }));
  const count = (s) => items.filter((i) => i.status === s).length;
  const pending = count("pending");
  return {
    items,
    promoted: count("promoted") + count("retired"),
    retired: count("retired"),
    fellback: count("fellback"),
    pending,
    done: items.length - pending,
    total: items.length,
    finished: pending === 0,
  };
}
