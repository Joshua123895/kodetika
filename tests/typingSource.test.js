import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { load as loadYaml } from "js-yaml";
import { buildTypingPool, typedLength, wpm, accuracy } from "../src/game/typingSource.js";

const TRACKS_DIR = join(process.cwd(), "src", "data", "tracks");

const tracks = readdirSync(TRACKS_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => {
    const t = loadYaml(readFileSync(join(TRACKS_DIR, f), "utf-8"));
    return {
      slug: t.slug,
      chapters: (t.chapters || []).map((ch) => ({
        levels: (ch.levels || []).map((l) => ({ ...l, solution: l.sol, startingCode: l.start })),
      })),
    };
  });

const pool = buildTypingPool(tracks);

describe("typing pool", () => {
  it("finds enough snippets to keep the game varied", () => {
    expect(pool.length).toBeGreaterThan(80);
  });

  it("only offers snippets that are comfortable to type", () => {
    for (const s of pool) {
      const lines = s.src.split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines.length).toBeLessThanOrEqual(9);
      expect(s.src.length).toBeGreaterThanOrEqual(40);
      expect(s.src.length).toBeLessThanOrEqual(260);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(60);
    }
  });

  it("never includes a tab, which would be ambiguous to type and to render", () => {
    for (const s of pool) expect(s.src).not.toContain("\t");
  });

  it("has no trailing whitespace to trip the final keystroke", () => {
    for (const s of pool) expect(s.src).toBe(s.src.trimEnd());
  });

  it("does not repeat the same snippet", () => {
    const srcs = pool.map((s) => s.src);
    expect(new Set(srcs).size).toBe(srcs.length);
  });

  it("excludes game levels", () => {
    expect(pool.some((s) => s.slug === "game-dev")).toBe(false);
  });
});

describe("metrics", () => {
  it("does not count auto-supplied indentation as typed characters", () => {
    // The player presses Enter and the four spaces appear for them.
    expect(typedLength("def f():\n    return 1")).toBe("def f():\nreturn 1".length);
  });

  it("computes wpm on the five-characters-per-word convention", () => {
    expect(wpm(300, 60000)).toBe(60);
    expect(wpm(0, 60000)).toBe(0);
    expect(wpm(100, 0)).toBe(0); // no divide-by-zero before the clock starts
  });

  it("computes accuracy, defaulting to 100 before any keystroke", () => {
    expect(accuracy(0, 0)).toBe(100);
    expect(accuracy(9, 10)).toBe(90);
    expect(accuracy(10, 10)).toBe(100);
  });
});
