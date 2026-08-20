import { describe, it, expect } from "vitest";
import { asLevels, buildNotice } from "../src/lib/notice.js";

// The shape recordActivity() actually returns, so these are not hand-faked.
const day = (over = {}) => ({
  streak: 1,
  best: 1,
  previousPoints: 0,
  points: 2,
  goal: 6,
  goalMet: false,
  milestone: null,
  ...over,
});

describe("asLevels", () => {
  it("renders whole levels, halves and both together", () => {
    expect(asLevels(0)).toBe("0");
    expect(asLevels(1)).toBe("½");
    expect(asLevels(2)).toBe("1");
    expect(asLevels(3)).toBe("1½");
    expect(asLevels(6)).toBe("3");
    expect(asLevels(7)).toBe("3½");
  });
});

describe("buildNotice ranking", () => {
  it("puts a milestone above everything else it coincides with", () => {
    const n = buildNotice(day({ milestone: 7, goalMet: true, streak: 7 }), { retired: true });
    expect(n.kind).toBe("milestone");
    expect(n.title).toBe("7 day streak");
    expect(n.sound).toBe("milestone");
  });

  it("puts meeting the goal above retiring a level", () => {
    const n = buildNotice(day({ goalMet: true, points: 6 }), { retired: true });
    expect(n.kind).toBe("goal");
    expect(n.sound).toBe("goal");
  });

  it("puts retiring a level above ordinary progress", () => {
    const n = buildNotice(day(), { retired: true });
    expect(n.kind).toBe("review");
    expect(n.sound).toBe("reviewDone");
  });

  it("falls back to ordinary progress, and stays silent for it", () => {
    const n = buildNotice(day(), { retired: false });
    expect(n.kind).toBe("progress");
    // A noise on every single level stops meaning anything by the third one.
    expect(n.sound).toBeNull();
  });

  it("treats a missing review argument as nothing retired", () => {
    expect(buildNotice(day()).kind).toBe("progress");
  });
});

describe("buildNotice content", () => {
  it("counts today in levels rather than points", () => {
    const n = buildNotice(day({ points: 3, goal: 6 }));
    expect(n.title).toBe("1½ of 3 levels today");
  });

  it("mentions the streak only once it is worth mentioning", () => {
    expect(buildNotice(day({ streak: 1 })).detail).toBe("Keep it rolling.");
    expect(buildNotice(day({ streak: 4 })).detail).toBe("4 day streak going.");
  });

  it("carries both ends of the bar, which is what makes it animate", () => {
    const n = buildNotice(day({ previousPoints: 2, points: 4, goal: 6 }));
    expect(n.progress).toEqual({ from: 2, to: 4, max: 6 });
  });

  it("reports the goal in levels, not points", () => {
    const n = buildNotice(day({ goalMet: true, goal: 6, points: 6 }));
    expect(n.detail).toContain("3 levels done");
  });
});

describe("certificate rank", () => {
  it("outranks even a streak milestone", () => {
    const n = buildNotice(day({ milestone: 30, goalMet: true, streak: 30 }), { retired: true }, { certificate: "SQL" });
    expect(n.kind).toBe("certificate");
    expect(n.detail).toContain("SQL");
    expect(n.sound).toBe("milestone");
  });

  it("changes nothing when absent", () => {
    expect(buildNotice(day(), {}, {}).kind).toBe("progress");
    expect(buildNotice(day()).kind).toBe("progress");
  });
});
