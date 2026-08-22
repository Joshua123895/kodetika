import { describe, it, expect } from "vitest";
import { TIERS, DEFAULT_TIER, normaliseTier, bugHuntFits, BUG_HUNT_LINES } from "../src/game/arcadeDifficulty.js";

describe("the difficulty dial", () => {
  it("offers three tiers, easiest first, with a middle default", () => {
    expect(TIERS.map((t) => t.tier)).toEqual([1, 2, 3]);
    expect(TIERS.map((t) => t.label)).toEqual(["Easy", "Medium", "Hard"]);
    expect(DEFAULT_TIER).toBe(2);
  });

  it("clamps anything stored or typed into range", () => {
    expect(normaliseTier(1)).toBe(1);
    expect(normaliseTier(9)).toBe(3);
    expect(normaliseTier(0)).toBe(1);
    expect(normaliseTier("2")).toBe(2);
    expect(normaliseTier(undefined)).toBe(DEFAULT_TIER);
    expect(normaliseTier("banana")).toBe(DEFAULT_TIER);
  });
});

describe("bugHuntFits", () => {
  const puzzle = (d) => ({ d });

  it("keeps a long listing out of the easier tiers", () => {
    expect(bugHuntFits(puzzle(1), 30, 1)).toBe(false);
    expect(bugHuntFits(puzzle(1), 30, 2)).toBe(false);
    expect(bugHuntFits(puzzle(1), 30, 3)).toBe(true);
  });

  it("keeps the advanced tracks out of Easy", () => {
    expect(bugHuntFits(puzzle(3), 8, 1)).toBe(false);
    expect(bugHuntFits(puzzle(2), 8, 1)).toBe(true);
  });

  it("is cumulative: medium offers everything easy does", () => {
    for (const d of [1, 2, 3]) {
      for (const lines of [5, 12, 20]) {
        if (bugHuntFits(puzzle(d), lines, 1)) expect(bugHuntFits(puzzle(d), lines, 2)).toBe(true);
        if (bugHuntFits(puzzle(d), lines, 2)) expect(bugHuntFits(puzzle(d), lines, 3)).toBe(true);
      }
    }
  });

  it("treats a puzzle with no recorded difficulty as the hardest", () => {
    expect(bugHuntFits({}, 5, 1)).toBe(false);
    expect(bugHuntFits({}, 5, 3)).toBe(true);
  });

  it("hard has no length ceiling", () => {
    expect(BUG_HUNT_LINES[3]).toBe(Infinity);
  });
});
