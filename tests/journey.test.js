import { describe, it, expect } from "vitest";
import { TRACKS } from "../src/data/tracks.js";
import {
  trackSummaries,
  overallTotals,
  locateLevel,
  softSpots,
} from "../src/lib/journey.js";

// A fixture in the shape TRACKS actually produces: two chapters, ids that do
// not start at 1 and are not contiguous, because assignLevelIds is allowed to
// leave gaps and the profile must not assume otherwise.
const tracks = [
  {
    slug: "python",
    name: "Python Fundamentals",
    trackIcon: "python.svg",
    difficulty: 1,
    chapters: [
      { id: 1, name: "Input & Output", levels: [{ id: 1, name: "Hello" }, { id: 2, name: "Vars" }] },
      { id: 2, name: "Loops", levels: [{ id: 40, name: "For Loops" }] },
    ],
  },
  {
    slug: "sql",
    name: "SQL",
    trackIcon: "sql.svg",
    difficulty: 2,
    chapters: [{ id: 1, name: "Select", levels: [{ id: 1, name: "First Query" }] }],
  },
];

describe("trackSummaries", () => {
  it("counts completion and mastery apart", () => {
    // Every level done, but all on one star.
    const progress = { python: { 1: 1, 2: 1, 40: 1 } };
    const [python] = trackSummaries(tracks, progress);
    expect(python.done).toBe(3);
    expect(python.total).toBe(3);
    expect(python.pct).toBe(100);
    expect(python.complete).toBe(true);
    // 3 of a possible 9 stars.
    expect(python.stars).toBe(3);
    expect(python.maxStars).toBe(9);
    expect(python.mastery).toBe(33);
  });

  it("treats an untouched track as started: false rather than crashing", () => {
    const [, sql] = trackSummaries(tracks, { python: { 1: 3 } });
    expect(sql.done).toBe(0);
    expect(sql.started).toBe(false);
    expect(sql.complete).toBe(false);
    expect(sql.pct).toBe(0);
  });

  it("ignores progress for a level id the track no longer has", () => {
    const [python] = trackSummaries(tracks, { python: { 1: 3, 999: 3 } });
    expect(python.done).toBe(1);
    expect(python.stars).toBe(3);
  });

  it("handles a completely empty progress map", () => {
    const all = trackSummaries(tracks, {});
    expect(all.every((s) => s.done === 0 && s.stars === 0)).toBe(true);
  });
});

describe("overallTotals", () => {
  it("sums the per-track figures", () => {
    const summaries = trackSummaries(tracks, { python: { 1: 3, 2: 2 }, sql: { 1: 3 } });
    const totals = overallTotals(summaries);
    expect(totals.levels).toBe(3);
    expect(totals.totalLevels).toBe(4);
    expect(totals.stars).toBe(8);
    expect(totals.maxStars).toBe(12);
    expect(totals.tracksStarted).toBe(2);
    expect(totals.tracksComplete).toBe(1); // sql is 1/1
    expect(totals.totalTracks).toBe(2);
  });

  it("measures mastery against the levels done, not the whole catalogue", () => {
    // Three levels aced out of four in existence: mastered everything attempted.
    const summaries = trackSummaries(tracks, { python: { 1: 3, 2: 3 }, sql: { 1: 3 } });
    const totals = overallTotals(summaries);
    expect(totals.mastery).toBe(100);
    // The catalogue-wide figure is the one that stays low, and it is kept apart.
    expect(totals.catalogueMastery).toBe(75);
  });

  it("does not report 0% mastery for a strong start on a big catalogue", () => {
    const many = [
      {
        slug: "python",
        name: "Python",
        trackIcon: "p.svg",
        difficulty: 1,
        chapters: [
          {
            id: 1,
            name: "Ch",
            levels: Array.from({ length: 300 }, (_, i) => ({ id: i + 1, name: `L${i + 1}` })),
          },
        ],
      },
    ];
    const totals = overallTotals(trackSummaries(many, { python: { 1: 3, 2: 3, 3: 3 } }));
    expect(totals.mastery).toBe(100);
    expect(totals.catalogueMastery).toBe(1);
  });

  it("does not divide by zero on an empty catalogue or an untouched one", () => {
    const empty = overallTotals([]);
    expect(empty.pct).toBe(0);
    expect(empty.mastery).toBe(0);
    expect(empty.catalogueMastery).toBe(0);

    const untouched = overallTotals(trackSummaries(tracks, {}));
    expect(untouched.mastery).toBe(0);
  });
});

describe("locateLevel", () => {
  it("finds a level in a later chapter and builds its path", () => {
    expect(locateLevel(tracks, "python", 40)).toMatchObject({
      chapterId: 2,
      levelName: "For Loops",
      path: "/tracks/python/2/40",
    });
  });

  it("returns null for an unknown track or level", () => {
    expect(locateLevel(tracks, "nope", 1)).toBeNull();
    expect(locateLevel(tracks, "python", 999)).toBeNull();
  });
});

describe("softSpots", () => {
  const review = {
    python: {
      1: { box: 0, fails: 5, last: 100 },
      2: { box: 1, fails: 2, last: 300 },
      40: { box: 0, fails: 0, last: 400 }, // never failed
    },
    sql: { 1: { box: 4, fails: 9, last: 500 } }, // retired
  };

  it("ranks by retries, worst first", () => {
    const spots = softSpots(tracks, review);
    expect(spots.map((s) => s.levelId)).toEqual([1, 2]);
    expect(spots[0].fails).toBe(5);
  });

  it("leaves out levels that were never failed", () => {
    expect(softSpots(tracks, review).some((s) => s.levelId === 40)).toBe(false);
  });

  it("leaves out retired levels however hard they once were", () => {
    expect(softSpots(tracks, review).some((s) => s.trackSlug === "sql")).toBe(false);
  });

  it("breaks a tie toward the more recent struggle", () => {
    const tied = { python: { 1: { box: 0, fails: 3, last: 100 }, 2: { box: 0, fails: 3, last: 900 } } };
    expect(softSpots(tracks, tied).map((s) => s.levelId)).toEqual([2, 1]);
  });

  it("respects the limit", () => {
    expect(softSpots(tracks, review, { limit: 1 })).toHaveLength(1);
  });

  it("skips a review entry whose level no longer exists", () => {
    const stale = { python: { 4242: { box: 0, fails: 7, last: 1 } } };
    expect(softSpots(tracks, stale)).toEqual([]);
  });

  it("survives an empty review map", () => {
    expect(softSpots(tracks, {})).toEqual([]);
  });
});

describe("against the real catalogue", () => {
  it("adds every track up without a missing field", () => {
    const summaries = trackSummaries(TRACKS, {});
    expect(summaries).toHaveLength(TRACKS.length);
    for (const s of summaries) {
      expect(s.total).toBeGreaterThan(0);
      expect(s.name).toBeTruthy();
      expect(s.slug).toBeTruthy();
    }
  });

  it("reports the catalogue size the app actually ships", () => {
    const totals = overallTotals(trackSummaries(TRACKS, {}));
    // Guards against a track silently dropping out of the glob.
    expect(totals.totalLevels).toBe(
      TRACKS.reduce((n, t) => n + t.chapters.reduce((m, c) => m + c.levels.length, 0), 0)
    );
    expect(totals.maxStars).toBe(totals.totalLevels * 3);
  });
});
