import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadScores, getScore, recordScore, mergeScores, writeAllScores, registerArcadeCloudSaver } from "../src/lib/arcadeScores.js";

// A high-score store's one unforgivable bug is losing a record, so the merge and
// the never-downgrade rule are what these tests are really about.

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  registerArcadeCloudSaver(null);
});

describe("recording", () => {
  it("starts empty and reads zero for anything unseen", () => {
    expect(loadScores()).toEqual({});
    expect(getScore("guess", "streak")).toBe(0);
  });

  it("stores a new record and reads it back", () => {
    expect(recordScore("typing", "wpm", 42)).toBe(true);
    expect(getScore("typing", "wpm")).toBe(42);
  });

  it("never lowers an existing record", () => {
    recordScore("typing", "wpm", 60);
    expect(recordScore("typing", "wpm", 30)).toBe(false);
    expect(getScore("typing", "wpm")).toBe(60);
  });

  it("ignores an equal score rather than reporting a new record", () => {
    recordScore("guess", "score", 100);
    expect(recordScore("guess", "score", 100)).toBe(false);
  });

  it("rejects values that are not finite numbers", () => {
    expect(recordScore("guess", "score", NaN)).toBe(false);
    expect(recordScore("guess", "score", Infinity)).toBe(false);
    expect(recordScore("guess", "score", "80")).toBe(false);
    expect(getScore("guess", "score")).toBe(0);
  });

  it("keeps games and metrics independent", () => {
    recordScore("guess", "streak", 5);
    recordScore("guess", "score", 200);
    recordScore("bughunt", "streak", 3);
    expect(getScore("guess", "streak")).toBe(5);
    expect(getScore("guess", "score")).toBe(200);
    expect(getScore("bughunt", "streak")).toBe(3);
    expect(getScore("typing", "wpm")).toBe(0);
  });

  it("survives corrupt localStorage instead of throwing", () => {
    localStorage.setItem("step-into-code_arcade", "{not json");
    expect(loadScores()).toEqual({});
    expect(getScore("guess", "streak")).toBe(0);
  });
});

describe("merge on login", () => {
  it("keeps the higher value from either side", () => {
    const merged = mergeScores(
      { typing: { wpm: 70 }, guess: { streak: 3 } },
      { typing: { wpm: 55 }, guess: { streak: 9 } }
    );
    expect(merged).toEqual({ typing: { wpm: 70 }, guess: { streak: 9 } });
  });

  it("keeps entries present on only one side", () => {
    const merged = mergeScores({ bughunt: { streak: 4 } }, { typing: { wpm: 30 } });
    expect(merged).toEqual({ bughunt: { streak: 4 }, typing: { wpm: 30 } });
  });

  it("is symmetric — neither side can erase the other", () => {
    const a = { typing: { wpm: 70 }, guess: { score: 10 } };
    const b = { typing: { wpm: 90 }, bughunt: { streak: 2 } };
    expect(mergeScores(a, b)).toEqual(mergeScores(b, a));
  });

  it("tolerates missing sides and junk values", () => {
    expect(mergeScores()).toEqual({});
    expect(mergeScores({ typing: { wpm: "abc" } }, {})).toEqual({ typing: { wpm: 0 } });
  });
});

describe("cloud pushing", () => {
  it("debounces and sends the whole store, not just the delta", async () => {
    vi.useFakeTimers();
    const pushed = [];
    registerArcadeCloudSaver((all) => { pushed.push(all); return Promise.resolve(); });

    recordScore("guess", "streak", 2);
    recordScore("typing", "wpm", 40);
    expect(pushed).toHaveLength(0);   // nothing yet

    vi.advanceTimersByTime(1600);
    expect(pushed).toHaveLength(1);   // one upsert for the burst
    expect(pushed[0]).toEqual({ guess: { streak: 2 }, typing: { wpm: 40 } });
    vi.useRealTimers();
  });

  it("does not push when logged out", () => {
    vi.useFakeTimers();
    registerArcadeCloudSaver(null);
    recordScore("guess", "streak", 1);
    vi.advanceTimersByTime(3000);
    expect(getScore("guess", "streak")).toBe(1); // still saved locally
    vi.useRealTimers();
  });

  it("writeAllScores replaces the store wholesale, as the login merge needs", () => {
    recordScore("guess", "streak", 1);
    writeAllScores({ typing: { wpm: 99 } });
    expect(loadScores()).toEqual({ typing: { wpm: 99 } });
  });
});
