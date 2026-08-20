// Daily streak and spaced review. Kept in localStorage for instant/offline
// access and, when logged in, mirrored to the Supabase `practice` column so it
// follows you across devices — the same shape as arcade scores, deliberately.
//
// It lives in its own key rather than inside the progress object for the reason
// arcadeScores.js already documents: progress is strictly
// { trackSlug: { levelId: stars } }, getCompletedCount() counts its keys and
// getTotalStars() sums its values, so a richer object under a track slug would
// corrupt both, and mergeProgress() does Math.max on a *number*.
//
// Pure ESM with no DOM and no React, so the rules below can be tested by running
// them rather than by rendering something. Every function that cares about time
// takes `now`, which is what makes the day-boundary cases ordinary function
// calls instead of clock mocking.

import { adoptLegacyKey } from "./legacyStorage";

const PRACTICE_KEY = "kodetika_practice";
adoptLegacyKey(PRACTICE_KEY, "step-into-code_practice");

/**
 * Points are integers so nothing ever drifts: a level is 2, an Arcade credit is
 * 1. The UI divides by two and draws a ½ when the total is odd, so a student
 * sees "1½ of 3" rather than 1.5.
 */
export const LEVEL_POINTS = 2;
export const ARCADE_POINTS = 1;
export const DEFAULT_GOAL = 6; // three levels

/** How many correct answers in one Arcade game earn that game's daily credit. */
export const ARCADE_CORRECT_FOR_CREDIT = 5;

/** Leitner spacing in days. Reaching the end of this list retires a level. */
export const SPACING_DAYS = [1, 3, 7, 30];

const DAY_MS = 86400000;

/** Streaks worth making a noise about. */
export const MILESTONES = [7, 30, 100, 365];

const empty = () => ({
  day: { date: null, points: 0, streak: 0, best: 0 },
  review: {},
  arcade: { date: null, counts: {}, credited: {} },
  // trackSlug -> ISO date the certificate was awarded. Awarded, not completed:
  // for tracks finished before certificates existed the true completion date
  // was never recorded, so the stamp is honest about being an issue date.
  certs: {},
});

let cloudSaver = null; // (all) => Promise, registered by ProgressContext
let debounceTimer = null;

export function loadPractice() {
  try {
    const raw = JSON.parse(localStorage.getItem(PRACTICE_KEY));
    if (!raw || typeof raw !== "object") return empty();
    // Spread over the defaults so a blob written by an older build is still
    // whole here rather than throwing on a missing section.
    return { ...empty(), ...raw, day: { ...empty().day, ...(raw.day || {}) } };
  } catch {
    return empty();
  }
}

function write(data) {
  try {
    localStorage.setItem(PRACTICE_KEY, JSON.stringify(data));
  } catch {
    // Full or blocked storage must not take a level submission down with it.
  }
  scheduleCloudPush();
}

export function writeAllPractice(data) {
  try {
    localStorage.setItem(PRACTICE_KEY, JSON.stringify(data));
  } catch {
    // As above. The merge result simply does not survive the tab.
  }
}

function scheduleCloudPush() {
  if (!cloudSaver) return;
  clearTimeout(debounceTimer);
  const fn = cloudSaver;
  debounceTimer = setTimeout(() => fn(loadPractice()), 1500);
}

// ProgressContext calls this with a pusher when logged in, or null on logout.
export function registerPracticeCloudSaver(fn) {
  cloudSaver = fn;
}

// ---- days -------------------------------------------------------------------

/**
 * Local `YYYY-MM-DD`.
 *
 * Local rather than UTC on purpose: a student studying at 9pm in Jakarta is
 * already past midnight UTC, and a UTC day would break their streak every
 * single evening. The cost is that crossing a timezone can gain or lose a day,
 * which is the usual tradeoff and much the smaller of the two.
 */
export function dayKey(now = Date.now()) {
  const d = new Date(now);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * The day before `now`, by calendar rather than by subtracting 24 hours, so
 * month ends and daylight-saving shifts land on the right date.
 */
export function previousDayKey(now = Date.now()) {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return dayKey(d.getTime());
}

/** Today's figures, rolled forward if the stored day is stale. */
export function getDay(now = Date.now()) {
  const { day } = loadPractice();
  const today = dayKey(now);
  if (day.date === today) return { ...day };
  // A stale record means nothing has been done today yet. The streak itself is
  // only broken once a whole day has been missed, so it survives until then.
  const alive = day.date === previousDayKey(now);
  return { date: today, points: 0, streak: alive ? day.streak : 0, best: day.best || 0 };
}

/**
 * Records activity worth `points` and returns what, if anything, is worth
 * celebrating.
 *
 * The streak advances on activity, not on hitting the goal: missing the target
 * does not break anything, missing a whole day does.
 */
export function recordActivity({ points, goal = DEFAULT_GOAL, now = Date.now() } = {}) {
  const data = loadPractice();
  const day = data.day || empty().day;
  const today = dayKey(now);

  const before = day.date === today ? day.points || 0 : 0;
  let streak = day.streak || 0;
  let streakGrew = false;

  if (day.date === today) {
    // Already counted today; the streak does not move again.
  } else if (day.date === previousDayKey(now)) {
    streak += 1;
    streakGrew = true;
  } else {
    streak = 1;
    streakGrew = true;
  }

  const after = before + points;
  const best = Math.max(day.best || 0, streak);
  data.day = { date: today, points: after, streak, best };
  write(data);

  return {
    streak,
    best,
    // Both ends, because the toast animates the bar from one to the other and
    // the movement is the part worth showing.
    previousPoints: before,
    points: after,
    goal,
    // Only on the transition, so a fourth level on a three-level day is quiet.
    goalMet: before < goal && after >= goal,
    milestone: streakGrew && MILESTONES.includes(streak) ? streak : null,
  };
}

// ---- arcade -----------------------------------------------------------------

/**
 * One correct answer in an Arcade game. Grants that game's daily credit on the
 * fifth, and returns the activity result when it does so the caller can react.
 *
 * Bug Hunt and Guess the Output are endless — one puzzle at a time, with no
 * round to end — so there is no natural session to award. Capping it at one
 * credit per game per day is what stops the goal being farmed in thirty
 * seconds, while still letting a busy day count for something.
 */
export function recordArcadeCorrect(game, { goal = DEFAULT_GOAL, now = Date.now() } = {}) {
  const data = loadPractice();
  const today = dayKey(now);
  const arcade = data.arcade && data.arcade.date === today
    ? data.arcade
    : { date: today, counts: {}, credited: {} };

  if (arcade.credited[game]) return null; // already paid out for this game today

  arcade.counts[game] = (arcade.counts[game] || 0) + 1;
  const earned = arcade.counts[game] >= ARCADE_CORRECT_FOR_CREDIT;
  if (earned) arcade.credited[game] = true;

  data.arcade = arcade;
  write(data);

  return earned ? recordActivity({ points: ARCADE_POINTS, goal, now }) : null;
}

// ---- certificates -------------------------------------------------------------

/**
 * Stamps the certificate for a finished track, once.
 *
 * Idempotent on purpose: completeLevel calls this every time the completed
 * count equals the track total, and re-finishing a level after the track is
 * done must not move the award date. Returns the date on record either way.
 */
export function recordCertificate(trackSlug, now = Date.now()) {
  const data = loadPractice();
  const certs = data.certs || {};
  if (certs[trackSlug]) return { date: certs[trackSlug], fresh: false };
  const date = new Date(now).toISOString();
  data.certs = { ...certs, [trackSlug]: date };
  write(data);
  return { date, fresh: true };
}

/** The award date for one track, or null when it has not been earned. */
export function certificateDate(trackSlug) {
  return (loadPractice().certs || {})[trackSlug] || null;
}

// ---- review -----------------------------------------------------------------

/** True once a level has climbed past the last box. */
export function isRetired(entry) {
  return Boolean(entry) && entry.box >= SPACING_DAYS.length;
}

/**
 * Records the outcome of solving a level, review or not.
 *
 * Three cases, and the asymmetry is the point:
 *  - aced with no history: nothing to review, so nothing is stored.
 *  - aced with history: promote it a box and push the next sighting further out.
 *  - anything less than aced: park it at box 0, due immediately, and count the
 *    struggle.
 *
 * Due-immediately rather than due-tomorrow keeps this consistent with how
 * levels solved *before* this feature existed are treated (see dueLevels).
 */
export function recordLevelResult(trackSlug, levelId, stars, now = Date.now()) {
  const data = loadPractice();
  const review = data.review || {};
  const forTrack = { ...(review[trackSlug] || {}) };
  const key = String(levelId);
  const entry = forTrack[key];

  if (stars >= 3 && !entry) return { retired: false, tracked: false };

  if (stars >= 3) {
    const box = entry.box + 1;
    forTrack[key] = {
      box,
      due: isRetired({ box }) ? Infinity : now + SPACING_DAYS[box] * DAY_MS,
      fails: entry.fails || 0,
      last: now,
    };
  } else {
    forTrack[key] = {
      box: 0,
      due: now,
      fails: (entry?.fails || 0) + 1,
      last: now,
    };
  }

  // Infinity does not survive JSON, so a retired level stores null and is
  // recognised by its box rather than by its due date.
  if (forTrack[key].due === Infinity) forTrack[key].due = null;

  data.review = { ...review, [trackSlug]: forTrack };
  write(data);
  return { retired: isRetired(forTrack[key]), tracked: true };
}

/**
 * Levels ready to be seen again, soonest first.
 *
 * Reads from two places, which is what makes this useful on the day it ships
 * rather than a fortnight later: an explicit review entry when one exists, and
 * otherwise any level that was completed below three stars. That second rule
 * covers everything solved before this feature existed, without having to write
 * a migration blob over someone's whole history.
 */
export function dueLevels(progress = {}, { now = Date.now(), limit = 20 } = {}) {
  const { review } = loadPractice();
  const out = [];

  for (const [slug, levels] of Object.entries(progress)) {
    for (const [levelId, stars] of Object.entries(levels || {})) {
      const entry = review?.[slug]?.[levelId];
      if (entry) {
        if (isRetired(entry)) continue;
        if (typeof entry.due === "number" && entry.due <= now) {
          out.push({ trackSlug: slug, levelId: Number(levelId), due: entry.due, box: entry.box, fails: entry.fails || 0 });
        }
      } else if (stars > 0 && stars < 3) {
        out.push({ trackSlug: slug, levelId: Number(levelId), due: 0, box: 0, fails: 0 });
      }
    }
  }

  out.sort((a, b) => a.due - b.due || a.levelId - b.levelId);
  return out.slice(0, limit);
}

// ---- merge ------------------------------------------------------------------

/**
 * Merge on login.
 *
 * Arcade scores merge with Math.max per metric because each is independent.
 * These cannot: `box` and `due` describe one another, so taking the max of each
 * separately would invent a schedule neither device was ever in. The rule is
 * therefore "the more recent record wins whole", with the two genuinely
 * monotonic fields — a personal best, and a count of past struggle — kept at
 * their maximum so neither can be erased by a stale device.
 */
export function mergePractice(cloud = {}, local = {}) {
  const c = { ...empty(), ...cloud };
  const l = { ...empty(), ...local };

  const cDay = { ...empty().day, ...(c.day || {}) };
  const lDay = { ...empty().day, ...(l.day || {}) };
  const newerDay = (lDay.date || "") >= (cDay.date || "") ? lDay : cDay;
  const day = {
    ...newerDay,
    streak: Math.max(cDay.streak || 0, lDay.streak || 0),
    best: Math.max(cDay.best || 0, lDay.best || 0),
  };

  const review = {};
  for (const slug of new Set([...Object.keys(c.review || {}), ...Object.keys(l.review || {})])) {
    const cs = c.review?.[slug] || {};
    const ls = l.review?.[slug] || {};
    review[slug] = {};
    for (const id of new Set([...Object.keys(cs), ...Object.keys(ls)])) {
      const a = cs[id];
      const b = ls[id];
      if (!a || !b) {
        review[slug][id] = a || b;
        continue;
      }
      const newer = (b.last || 0) >= (a.last || 0) ? b : a;
      review[slug][id] = { ...newer, fails: Math.max(a.fails || 0, b.fails || 0) };
    }
  }

  // Today's arcade credits are a local, same-day concern; the newer record wins
  // and a stale one is simply dropped rather than merged into today's counts.
  const arcade = (l.arcade?.date || "") >= (c.arcade?.date || "") ? l.arcade : c.arcade;

  // A certificate was awarded when it was first awarded: the earlier date wins,
  // so a second device stamping later can never move it. ISO strings compare
  // correctly as plain strings.
  const certs = {};
  for (const slug of new Set([...Object.keys(c.certs || {}), ...Object.keys(l.certs || {})])) {
    const a = c.certs?.[slug];
    const b = l.certs?.[slug];
    certs[slug] = a && b ? (a <= b ? a : b) : a || b;
  }

  return { day, review, arcade: arcade || empty().arcade, certs };
}
