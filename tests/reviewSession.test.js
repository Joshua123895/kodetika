import { describe, it, expect, beforeEach } from "vitest";
import { getSession, clearSession, itemStatus, sessionReport } from "../src/lib/reviewSession.js";
import { registerPracticeCloudSaver } from "../src/lib/practice.js";

// Plain-ESM modules, node environment, hand-rolled storage — the same shape
// tests/practice.test.js documents.
beforeEach(() => {
  const local = new Map();
  globalThis.localStorage = {
    getItem: (k) => (local.has(k) ? local.get(k) : null),
    setItem: (k, v) => local.set(k, String(v)),
    removeItem: (k) => local.delete(k),
    clear: () => local.clear(),
  };
  const session = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (session.has(k) ? session.get(k) : null),
    setItem: (k, v) => session.set(k, String(v)),
    removeItem: (k) => session.delete(k),
    clear: () => session.clear(),
  };
  registerPracticeCloudSaver(null);
});

const tracks = [
  {
    slug: "python",
    name: "Python Fundamentals",
    trackIcon: "p.svg",
    difficulty: 1,
    chapters: [
      { id: 1, name: "Basics", levels: [{ id: 1, name: "Hello" }, { id: 2, name: "Vars" }, { id: 3, name: "Loops" }] },
    ],
  },
];

const NOW = new Date(2026, 7, 20, 14, 0).getTime();

describe("getSession", () => {
  it("freezes the due queue with names, paths and starting boxes", () => {
    // Two seeded levels (low stars, no review history).
    const s = getSession(tracks, { python: { 1: 1, 2: 2 } }, { now: NOW });
    expect(s.items).toHaveLength(2);
    expect(s.items[0]).toMatchObject({ name: "Hello", path: "/tracks/python/1/1", startBox: 0 });
  });

  it("returns null when nothing is due", () => {
    expect(getSession(tracks, { python: { 1: 3 } }, { now: NOW })).toBeNull();
  });

  it("reuses today's session even after the queue changes", () => {
    const first = getSession(tracks, { python: { 1: 1 } }, { now: NOW });
    expect(first.items).toHaveLength(1);
    // The level got aced; the live queue is now empty, the session is not.
    const again = getSession(tracks, { python: { 1: 3 } }, { now: NOW });
    expect(again.items).toHaveLength(1);
    expect(again.items[0].name).toBe("Hello");
  });

  it("starts fresh after clearSession", () => {
    getSession(tracks, { python: { 1: 1 } }, { now: NOW });
    clearSession();
    expect(getSession(tracks, { python: { 1: 3 } }, { now: NOW })).toBeNull();
  });

  it("does not carry yesterday's session across midnight", () => {
    // Started at 23:50; the next visit is at 00:10 the following day. The old
    // session must not resume, even though it is only twenty minutes old.
    const lateNight = new Date(2026, 7, 20, 23, 50).getTime();
    const s1 = getSession(tracks, { python: { 1: 1, 2: 2 } }, { now: lateNight });
    expect(s1.items).toHaveLength(2);

    const pastMidnight = new Date(2026, 7, 21, 0, 10).getTime();
    // By now one level was aced; a fresh session sees only what is still due.
    const s2 = getSession(tracks, { python: { 1: 3, 2: 2 } }, { now: pastMidnight });
    expect(s2.date).toBe("2026-08-21");
    expect(s2.items).toHaveLength(1);
    expect(s2.items[0].name).toBe("Vars");
  });

  it("a level due late yesterday is still due after midnight", () => {
    // due is a timestamp; crossing midnight must not un-due it.
    const prac = { review: { python: { 3: { box: 1, due: new Date(2026, 7, 20, 23, 59).getTime(), fails: 1, last: 1 } } } };
    globalThis.localStorage.setItem("kodetika_practice", JSON.stringify(prac));
    const after = new Date(2026, 7, 21, 0, 1).getTime();
    const s = getSession(tracks, { python: { 3: 3 } }, { now: after });
    expect(s.items).toHaveLength(1);
    expect(s.items[0].name).toBe("Loops");
  });

  it("drops items whose level no longer exists rather than crashing", () => {
    const s = getSession(tracks, { python: { 1: 1, 999: 2 } }, { now: NOW });
    expect(s.items).toHaveLength(1);
  });
});

describe("itemStatus", () => {
  const item = { trackSlug: "python", levelId: 2, startBox: 1 };

  it("is pending while the entry has not moved", () => {
    const review = { python: { 2: { box: 1, fails: 1, last: NOW - 86400000 * 3 } } };
    expect(itemStatus(item, review, {})).toBe("pending");
  });

  it("is promoted once the box went up", () => {
    const review = { python: { 2: { box: 2, fails: 1, last: NOW } } };
    expect(itemStatus(item, review, {})).toBe("promoted");
  });

  it("is retired past the last box", () => {
    const review = { python: { 2: { box: 4, fails: 1, last: NOW, due: null } } };
    expect(itemStatus(item, review, {})).toBe("retired");
  });

  it("fell back when the box dropped", () => {
    const review = { python: { 2: { box: 0, fails: 2, last: NOW } } };
    expect(itemStatus(item, review, {})).toBe("fellback");
  });

  it("tells a fresh box-0 fail apart from an untouched box-0 item by the stamp", () => {
    const seeded = { trackSlug: "python", levelId: 1, startBox: 0 };
    const untouched = { python: { 1: { box: 0, fails: 1, last: NOW - 86400000 * 5 } } };
    expect(itemStatus(seeded, untouched, {})).toBe("pending");
    const failedToday = { python: { 1: { box: 0, fails: 2, last: Date.now() } } };
    expect(itemStatus(seeded, failedToday, {})).toBe("fellback");
  });

  it("counts an aced seeded level as retired even though nothing was stored", () => {
    // recordLevelResult keeps no record of a clean pass with no history, so the
    // review map cannot answer; three stars in the progress map can.
    const seeded = { trackSlug: "python", levelId: 1, startBox: 0 };
    expect(itemStatus(seeded, {}, { python: { 1: 3 } })).toBe("retired");
    expect(itemStatus(seeded, {}, { python: { 1: 1 } })).toBe("pending");
  });
});

describe("sessionReport", () => {
  it("sums the session and knows when it is finished", () => {
    const session = {
      date: "2026-08-20",
      items: [
        { trackSlug: "python", levelId: 1, startBox: 0, name: "Hello" },
        { trackSlug: "python", levelId: 2, startBox: 1, name: "Vars" },
        { trackSlug: "python", levelId: 3, startBox: 0, name: "Loops" },
      ],
    };
    const review = {
      python: {
        2: { box: 2, fails: 0, last: Date.now() }, // promoted
        3: { box: 0, fails: 3, last: Date.now() }, // fell back
      },
    };
    const progress = { python: { 1: 3 } }; // aced the seeded one
    const r = sessionReport(session, progress, review);
    expect(r.total).toBe(3);
    expect(r.done).toBe(3);
    expect(r.finished).toBe(true);
    expect(r.promoted).toBe(2); // the promotion plus the aced-seeded retire
    expect(r.retired).toBe(1);
    expect(r.fellback).toBe(1);
  });

  it("is unfinished while anything is pending", () => {
    const session = {
      date: "2026-08-20",
      items: [{ trackSlug: "python", levelId: 1, startBox: 0, name: "Hello" }],
    };
    const r = sessionReport(session, {}, {});
    expect(r.finished).toBe(false);
    expect(r.pending).toBe(1);
  });
});
