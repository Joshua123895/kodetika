import { describe, it, expect } from "vitest";
import {
  scoreRun,
  wpm,
  accuracy,
  MIN_TIMED_MS,
  MAX_HUMAN_WPM,
  CLEAN_RUN_ACCURACY,
} from "../src/game/typingSource.js";

// 60 characters is 12 words by the standard five-character convention, so a
// minute of them is 12 wpm and ten seconds of them is 72.
const MINUTE = 60000;

describe("wpm", () => {
  it("uses the five-characters-per-word convention", () => {
    expect(wpm(60, MINUTE)).toBe(12);
    expect(wpm(300, MINUTE)).toBe(60);
    expect(wpm(60, MINUTE / 6)).toBe(72);
  });

  it("returns 0 rather than Infinity when no time has passed", () => {
    expect(wpm(100, 0)).toBe(0);
  });
});

describe("scoreRun", () => {
  const clean = { elapsedMs: MINUTE, accuracyPct: 100 };

  it("does not pay the player for indentation the editor supplied", () => {
    // 300 characters on screen, but 100 of them were auto-indent on Enter.
    const withAuto = scoreRun({ chars: 300, autoChars: 100, ...clean });
    const withoutAuto = scoreRun({ chars: 200, autoChars: 0, ...clean });
    expect(withAuto.wpm).toBe(40);
    expect(withAuto.wpm).toBe(withoutAuto.wpm);
  });

  it("treats a run with no auto-indent exactly as before", () => {
    expect(scoreRun({ chars: 300, ...clean }).wpm).toBe(60);
  });

  it("never goes negative if autoChars somehow exceeds the text", () => {
    expect(scoreRun({ chars: 10, autoChars: 999, ...clean }).wpm).toBe(0);
  });

  describe("what may become a record", () => {
    it("accepts an ordinary clean run", () => {
      expect(scoreRun({ chars: 300, ...clean }).record).toBe(true);
    });

    it("refuses a messy run even at a believable speed", () => {
      const messy = scoreRun({ chars: 300, elapsedMs: MINUTE, accuracyPct: CLEAN_RUN_ACCURACY - 1 });
      expect(messy.record).toBe(false);
    });

    it("refuses a run too short to have measured anything", () => {
      // This is the shape that produced the 2678 wpm sitting in the real data.
      const burst = scoreRun({ chars: 300, elapsedMs: 400, accuracyPct: 100 });
      expect(burst.wpm).toBeGreaterThan(MAX_HUMAN_WPM);
      expect(burst.record).toBe(false);
    });

    it("refuses a superhuman figure even over a long enough run", () => {
      // Long enough to pass the clock check, still not humanly possible.
      const fast = scoreRun({ chars: 20000, elapsedMs: MIN_TIMED_MS * 2, accuracyPct: 100 });
      expect(fast.wpm).toBeGreaterThan(MAX_HUMAN_WPM);
      expect(fast.record).toBe(false);
    });

    it("accepts a fast but human run right at the ceiling", () => {
      // 250 wpm for three seconds is 12.5 words, so about 62 characters.
      const at = scoreRun({ chars: 62, elapsedMs: 3000, accuracyPct: 100 });
      expect(at.wpm).toBeLessThanOrEqual(MAX_HUMAN_WPM);
      expect(at.record).toBe(true);
    });

    it("refuses anything at the exact instant the clock never started", () => {
      expect(scoreRun({ chars: 300, elapsedMs: 0, accuracyPct: 100 }).record).toBe(false);
    });
  });
});

describe("accuracy", () => {
  it("is 100 before anything has been typed", () => {
    expect(accuracy(0, 0)).toBe(100);
  });

  it("rounds to whole percent", () => {
    expect(accuracy(19, 20)).toBe(95);
    expect(accuracy(2, 3)).toBe(67);
  });
});
