import { describe, it, expect, beforeEach } from "vitest";
import {
  dayKey,
  previousDayKey,
  getDay,
  recordActivity,
  recordArcadeCorrect,
  recordLevelResult,
  dueLevels,
  mergePractice,
  isRetired,
  loadPractice,
  writeAllPractice,
  LEVEL_POINTS,
  ARCADE_CORRECT_FOR_CREDIT,
  SPACING_DAYS,
  DEFAULT_GOAL,
  registerPracticeCloudSaver,
} from "../src/lib/practice.js";

// The rules here decide whether someone keeps a streak they earned and whether
// a level they struggled with ever comes back, so they are tested by running
// them rather than by rendering a card.
//
// Time is always passed in. Nothing mocks the clock, which means a day-boundary
// case is an ordinary function call and the tests cannot go green only because
// it happened to be the right hour when they ran.

const DAY = 86400000;
// A fixed local noon, so adding or subtracting whole days can never land on the
// previous date through a timezone offset.
const NOON = new Date(2026, 7, 20, 12, 0, 0).getTime();
const daysFrom = (base, n) => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d.getTime();
};

// Same hand-rolled store the arcade-score tests use: these modules are plain
// ESM with no DOM, so the suite runs them in node rather than paying for jsdom.
beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  registerPracticeCloudSaver(null);
});

describe("day keys", () => {
  it("uses the local date, not UTC", () => {
    // 9pm local on the 20th is already the 21st in UTC. A UTC key would break
    // the streak of anyone who studies in the evening east of Greenwich.
    const evening = new Date(2026, 7, 20, 21, 30).getTime();
    expect(dayKey(evening)).toBe("2026-08-20");
  });

  it("walks back by calendar, so month ends are right", () => {
    expect(previousDayKey(new Date(2026, 8, 1, 12).getTime())).toBe("2026-08-31");
  });

  it("walks back across a year boundary", () => {
    expect(previousDayKey(new Date(2026, 0, 1, 12).getTime())).toBe("2025-12-31");
  });
});

describe("streak", () => {
  it("starts at one on the first day", () => {
    const r = recordActivity({ points: LEVEL_POINTS, now: NOON });
    expect(r.streak).toBe(1);
    expect(r.points).toBe(2);
  });

  it("adds points without moving the streak again the same day", () => {
    recordActivity({ points: LEVEL_POINTS, now: NOON });
    const r = recordActivity({ points: LEVEL_POINTS, now: NOON + 3600000 });
    expect(r.streak).toBe(1);
    expect(r.points).toBe(4);
  });

  it("increments the next day and resets the daily points", () => {
    recordActivity({ points: LEVEL_POINTS, now: NOON });
    const r = recordActivity({ points: LEVEL_POINTS, now: daysFrom(NOON, 1) });
    expect(r.streak).toBe(2);
    expect(r.points).toBe(2);
  });

  it("resets to one after a missed day", () => {
    recordActivity({ points: LEVEL_POINTS, now: NOON });
    const r = recordActivity({ points: LEVEL_POINTS, now: daysFrom(NOON, 2) });
    expect(r.streak).toBe(1);
  });

  it("keeps the best streak after a reset", () => {
    for (let i = 0; i < 4; i++) recordActivity({ points: LEVEL_POINTS, now: daysFrom(NOON, i) });
    const r = recordActivity({ points: LEVEL_POINTS, now: daysFrom(NOON, 10) });
    expect(r.streak).toBe(1);
    expect(r.best).toBe(4);
  });

  it("survives a day where the goal was missed", () => {
    // One level is well short of the three-level goal, and must still count.
    recordActivity({ points: LEVEL_POINTS, goal: DEFAULT_GOAL, now: NOON });
    const r = recordActivity({ points: LEVEL_POINTS, goal: DEFAULT_GOAL, now: daysFrom(NOON, 1) });
    expect(r.streak).toBe(2);
  });

  it("reports the goal only on the crossing, not on every level after it", () => {
    expect(recordActivity({ points: 2, goal: 6, now: NOON }).goalMet).toBe(false);
    expect(recordActivity({ points: 2, goal: 6, now: NOON }).goalMet).toBe(false);
    expect(recordActivity({ points: 2, goal: 6, now: NOON }).goalMet).toBe(true);
    expect(recordActivity({ points: 2, goal: 6, now: NOON }).goalMet).toBe(false);
  });

  it("reports a milestone once, on the day it is reached", () => {
    for (let i = 0; i < 6; i++) {
      expect(recordActivity({ points: 2, now: daysFrom(NOON, i) }).milestone).toBeNull();
    }
    expect(recordActivity({ points: 2, now: daysFrom(NOON, 6) }).milestone).toBe(7);
    // A second level on the same day must not fire it again.
    expect(recordActivity({ points: 2, now: daysFrom(NOON, 6) }).milestone).toBeNull();
  });

  it("does not break a live streak just because today is untouched", () => {
    recordActivity({ points: 2, now: NOON });
    const today = getDay(daysFrom(NOON, 1));
    expect(today.streak).toBe(1);
    expect(today.points).toBe(0);
  });

  it("shows a broken streak as zero once a whole day was missed", () => {
    recordActivity({ points: 2, now: NOON });
    expect(getDay(daysFrom(NOON, 2)).streak).toBe(0);
  });
});

describe("arcade credit", () => {
  it("pays nothing before the fifth correct answer", () => {
    for (let i = 1; i < ARCADE_CORRECT_FOR_CREDIT; i++) {
      expect(recordArcadeCorrect("bughunt", { now: NOON })).toBeNull();
    }
  });

  it("pays half a level on the fifth", () => {
    let last = null;
    for (let i = 0; i < ARCADE_CORRECT_FOR_CREDIT; i++) last = recordArcadeCorrect("bughunt", { now: NOON });
    expect(last).not.toBeNull();
    expect(last.points).toBe(1);
  });

  it("pays once per game per day, however long you play", () => {
    for (let i = 0; i < 40; i++) recordArcadeCorrect("bughunt", { now: NOON });
    expect(getDay(NOON).points).toBe(1);
  });

  it("pays separately for a different game", () => {
    for (let i = 0; i < 10; i++) recordArcadeCorrect("bughunt", { now: NOON });
    for (let i = 0; i < 10; i++) recordArcadeCorrect("guess", { now: NOON });
    expect(getDay(NOON).points).toBe(2);
  });

  it("pays again the next day", () => {
    for (let i = 0; i < 10; i++) recordArcadeCorrect("bughunt", { now: NOON });
    const next = daysFrom(NOON, 1);
    for (let i = 0; i < ARCADE_CORRECT_FOR_CREDIT; i++) recordArcadeCorrect("bughunt", { now: next });
    expect(getDay(next).points).toBe(1);
  });
});

describe("review scheduling", () => {
  const progress = { python: { 1: 1, 2: 3, 3: 2 } };

  it("seeds from levels solved below three stars, and ignores aced ones", () => {
    const due = dueLevels(progress, { now: NOON });
    expect(due.map((d) => d.levelId).sort()).toEqual([1, 3]);
  });

  it("stores nothing for a level aced first time", () => {
    const r = recordLevelResult("python", 9, 3, NOON);
    expect(r.tracked).toBe(false);
    expect(loadPractice().review.python).toBeUndefined();
  });

  it("parks a poor result as due immediately, so it is seen again soon", () => {
    recordLevelResult("python", 1, 1, NOON);
    const due = dueLevels({ python: { 1: 1 } }, { now: NOON });
    expect(due).toHaveLength(1);
    expect(due[0].fails).toBe(1);
  });

  it("promotes a box on an aced review and pushes the next sighting out", () => {
    recordLevelResult("python", 1, 1, NOON); // box 0, due now
    recordLevelResult("python", 1, 3, NOON); // aced: box 1
    const entry = loadPractice().review.python["1"];
    expect(entry.box).toBe(1);
    expect(entry.due).toBe(NOON + SPACING_DAYS[1] * DAY);
    // Not due until that date arrives.
    expect(dueLevels({ python: { 1: 1 } }, { now: NOON + DAY })).toHaveLength(0);
    expect(dueLevels({ python: { 1: 1 } }, { now: entry.due })).toHaveLength(1);
  });

  it("drops back to box zero on a failed review and counts the struggle", () => {
    recordLevelResult("python", 1, 1, NOON);
    recordLevelResult("python", 1, 3, NOON);
    recordLevelResult("python", 1, 2, NOON + DAY * 5);
    const entry = loadPractice().review.python["1"];
    expect(entry.box).toBe(0);
    expect(entry.fails).toBe(2);
  });

  it("retires a level that climbs past the last box", () => {
    recordLevelResult("python", 1, 1, NOON);
    let t = NOON;
    for (let i = 0; i < SPACING_DAYS.length; i++) {
      t += DAY;
      recordLevelResult("python", 1, 3, t);
    }
    const entry = loadPractice().review.python["1"];
    expect(isRetired(entry)).toBe(true);
    expect(dueLevels({ python: { 1: 1 } }, { now: t + DAY * 999 })).toHaveLength(0);
  });

  it("survives a round trip through JSON, which has no Infinity", () => {
    recordLevelResult("python", 1, 1, NOON);
    let t = NOON;
    for (let i = 0; i < SPACING_DAYS.length; i++) recordLevelResult("python", 1, 3, (t += DAY));
    const revived = JSON.parse(JSON.stringify(loadPractice()));
    expect(isRetired(revived.review.python["1"])).toBe(true);
  });

  it("sorts soonest first and caps the list", () => {
    const many = { python: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i + 1, 1])) };
    const due = dueLevels(many, { now: NOON, limit: 20 });
    expect(due).toHaveLength(20);
    for (let i = 1; i < due.length; i++) expect(due[i].due).toBeGreaterThanOrEqual(due[i - 1].due);
  });

  it("ignores a level with no stars at all, which was never attempted", () => {
    expect(dueLevels({ python: { 5: 0 } }, { now: NOON })).toHaveLength(0);
  });
});

describe("merge on login", () => {
  it("takes the more recent day but the best of both bests", () => {
    const cloud = { day: { date: "2026-08-19", points: 6, streak: 9, best: 20 } };
    const local = { day: { date: "2026-08-20", points: 2, streak: 3, best: 4 } };
    const m = mergePractice(cloud, local);
    expect(m.day.date).toBe("2026-08-20");
    expect(m.day.points).toBe(2);
    expect(m.day.best).toBe(20);
  });

  it("keeps the more recent review entry whole rather than mixing fields", () => {
    // Taking max(box) and max(due) separately would invent a schedule neither
    // device was ever in, which is the whole reason this is not Math.max.
    const cloud = { review: { python: { 1: { box: 3, due: 500, fails: 1, last: 100 } } } };
    const local = { review: { python: { 1: { box: 0, due: 900, fails: 4, last: 800 } } } };
    const m = mergePractice(cloud, local);
    expect(m.review.python[1].box).toBe(0);
    expect(m.review.python[1].due).toBe(900);
    expect(m.review.python[1].fails).toBe(4);
  });

  it("never loses a record of struggle, even from the older device", () => {
    const cloud = { review: { python: { 1: { box: 0, due: 1, fails: 9, last: 100 } } } };
    const local = { review: { python: { 1: { box: 1, due: 2, fails: 0, last: 800 } } } };
    expect(mergePractice(cloud, local).review.python[1].fails).toBe(9);
  });

  it("keeps an entry only one side has", () => {
    const cloud = { review: { python: { 1: { box: 0, due: 1, fails: 1, last: 5 } } } };
    const local = { review: { sql: { 2: { box: 0, due: 1, fails: 1, last: 5 } } } };
    const m = mergePractice(cloud, local);
    expect(m.review.python[1]).toBeTruthy();
    expect(m.review.sql[2]).toBeTruthy();
  });

  it("copes with empty on either side", () => {
    expect(mergePractice({}, {}).day.streak).toBe(0);
    expect(mergePractice(undefined, undefined).review).toEqual({});
  });

  it("round-trips a merged blob back into storage", () => {
    const merged = mergePractice({ day: { date: "2026-08-20", points: 4, streak: 2, best: 5 } }, {});
    writeAllPractice(merged);
    expect(loadPractice().day.best).toBe(5);
  });
});
