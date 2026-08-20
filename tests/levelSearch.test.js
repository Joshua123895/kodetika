import { describe, it, expect } from "vitest";
import { TRACKS } from "../src/data/tracks.js";
import { buildIndex, searchLevels } from "../src/lib/levelSearch.js";

const tracks = [
  {
    slug: "python",
    name: "Python Fundamentals",
    chapters: [
      { id: 1, name: "Input & Output", levels: [{ id: 1, name: "Hello, World!" }, { id: 2, name: "Print a Variable" }] },
      { id: 2, name: "Loops", levels: [{ id: 3, name: "For Loops" }] },
    ],
  },
  {
    slug: "game-dev",
    name: "Game Development",
    chapters: [{ id: 1, name: "Physics", levels: [{ id: 1, name: "Collision Geometry" }] }],
  },
];

const index = buildIndex(tracks);

describe("buildIndex", () => {
  it("flattens every level with the path the router expects", () => {
    expect(index).toHaveLength(4);
    expect(index[2]).toMatchObject({ name: "For Loops", path: "/tracks/python/2/3" });
  });
});

describe("searchLevels", () => {
  it("ranks a name prefix above a name substring", () => {
    // "for loops" starts with "for"; nothing else does, but "Print a Variable"
    // does not contain it either — use "lo": "Loops" chapter context vs names.
    const hits = searchLevels(index, "coll");
    expect(hits[0].name).toBe("Collision Geometry");
  });

  it("is case-insensitive", () => {
    expect(searchLevels(index, "HELLO")[0].name).toBe("Hello, World!");
  });

  it("falls back to track and chapter names last", () => {
    const hits = searchLevels(index, "physics");
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe("Collision Geometry");
  });

  it("puts name matches ahead of context matches", () => {
    // "loops" is a level-name for For Loops AND the chapter name over it.
    const hits = searchLevels(index, "loops");
    expect(hits[0].name).toBe("For Loops");
  });

  it("returns nothing for a blank query", () => {
    expect(searchLevels(index, "")).toEqual([]);
    expect(searchLevels(index, "   ")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchLevels(index, "o", { limit: 2 })).toHaveLength(2);
  });
});

describe("against the real catalogue", () => {
  const real = buildIndex(TRACKS);

  it("indexes every shipped level", () => {
    const total = TRACKS.reduce((n, t) => n + t.chapters.reduce((m, c) => m + c.levels.length, 0), 0);
    expect(real).toHaveLength(total);
  });

  it("finds a known level by a half-remembered name", () => {
    const hits = searchLevels(real, "collision");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].name.toLowerCase()).toContain("collision");
  });

  it("every indexed path is well-formed", () => {
    for (const e of real) {
      expect(e.path).toMatch(/^\/tracks\/[a-z0-9-]+\/\d+\/\d+$/);
    }
  });
});
