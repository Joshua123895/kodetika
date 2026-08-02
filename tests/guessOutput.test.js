import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { load as loadYaml } from "js-yaml";
import { buildPool, generateRound, accept, passesShapeRules, kindOf, mulberry32 } from "../src/game/guessOutput.js";
import { norm } from "../src/utils/outputMatcher.js";

// The generator is checked by proving its invariants over thousands of seeded
// rounds, rather than by freezing one sample of its output in a fixture. A round
// that shows two identical choices, or whose answer is guessable from shape
// alone, is the failure this game cannot tolerate.

const TRACKS_DIR = join(process.cwd(), "src", "data", "tracks");

// Shape the raw YAML the way src/data/tracks.js exposes it at runtime.
const tracks = readdirSync(TRACKS_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => {
    const t = loadYaml(readFileSync(join(TRACKS_DIR, f), "utf-8"));
    let id = 0;
    return {
      slug: t.slug,
      difficulty: t.difficulty,
      chapters: (t.chapters || []).map((ch) => ({
        levels: (ch.levels || []).map((l) => ({ ...l, id: ++id, solution: l.sol, startingCode: l.start })),
      })),
    };
  });

const pool = buildPool(tracks);

describe("pool", () => {
  it("finds a usable corpus", () => {
    expect(pool.length).toBeGreaterThan(150);
  });

  it("only includes levels with a non-empty deterministic output", () => {
    for (const l of pool) {
      expect(l.exp).toBe(norm(l.exp));
      expect(l.exp.length).toBeGreaterThan(0);
    }
  });

  it("excludes game levels and oversized snippets", () => {
    for (const l of pool) {
      expect(l.srcLines).toBeLessThanOrEqual(14);
      expect(l.srcLines).toBeGreaterThanOrEqual(2);
      expect(l.exp.split("\n").length).toBeLessThanOrEqual(8);
    }
  });
});

describe("accept", () => {
  it("rejects a candidate equal to the answer after normalizing", () => {
    expect(accept("5\n", "5", new Set(["5"]))).toBe(false);
    expect(accept("5", "5", new Set(["5"]))).toBe(false);
  });

  it("rejects whitespace-only differences, which are invisible when rendered", () => {
    expect(accept("Alex 18", "Alex18", new Set())).toBe(false);
  });

  it("rejects duplicates of an already-chosen distractor", () => {
    expect(accept("7", "5", new Set(["5", "7"]))).toBe(false);
  });

  it("accepts a genuinely different value", () => {
    expect(accept("7", "5", new Set(["5"]))).toBe(true);
  });
});

describe("shape rules", () => {
  it("rejects a set where only the answer has a bracket", () => {
    expect(passesShapeRules(["[1, 2]", "12", "13", "14"], "[1, 2]")).toBe(false);
  });

  it("rejects a set where one choice contains another", () => {
    expect(passesShapeRules(["12", "123", "45", "67"], "123")).toBe(false);
  });

  it("classifies output line kinds", () => {
    expect(kindOf("42")).toBe("I");
    expect(kindOf("4.0")).toBe("F");
    expect(kindOf("True")).toBe("B");
    expect(kindOf("[1, 2]")).toBe("L");
    expect(kindOf("hello")).toBe("S");
  });
});

describe("generated rounds", () => {
  const rounds = [];
  for (let seed = 1; seed <= 700; seed++) {
    for (const tier of [1, 2, 3]) {
      const r = generateRound(pool, seed, tier);
      if (r) rounds.push(r);
    }
  }

  it("generates a round for the overwhelming majority of seeds", () => {
    expect(rounds.length).toBeGreaterThan(1800);
  });

  it("always offers exactly four distinct choices", () => {
    for (const r of rounds) {
      expect(r.choices).toHaveLength(4);
      expect(new Set(r.choices).size).toBe(4);
    }
  });

  it("renders exactly what it compares — every choice is pre-normalized", () => {
    // "5" and "5\n" look identical on screen; if one were stored unnormalized
    // the player could pick a visually correct option and be marked wrong.
    for (const r of rounds) {
      for (const c of r.choices) expect(c).toBe(norm(c));
    }
  });

  it("has a valid answer index pointing at a real choice", () => {
    for (const r of rounds) {
      expect(r.answerIndex).toBeGreaterThanOrEqual(0);
      expect(r.answerIndex).toBeLessThan(4);
      expect(r.choices[r.answerIndex]).toBeTruthy();
    }
  });

  it("never lets a distractor collapse onto the answer", () => {
    for (const r of rounds) {
      const answer = r.choices[r.answerIndex];
      const others = r.choices.filter((_, i) => i !== r.answerIndex);
      for (const o of others) {
        expect(norm(o)).not.toBe(norm(answer));
        expect(o.replace(/\s+/g, "")).not.toBe(answer.replace(/\s+/g, ""));
      }
    }
  });

  it("passes its own shape rules", () => {
    for (const r of rounds) {
      expect(passesShapeRules(r.choices, r.choices[r.answerIndex])).toBe(true);
    }
  });

  it("does not park the answer in one position", () => {
    const counts = [0, 0, 0, 0];
    for (const r of rounds) counts[r.answerIndex]++;
    const expected = rounds.length / 4;
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.6);
      expect(c).toBeLessThan(expected * 1.4);
    }
  });

  it("is reproducible from its seed", () => {
    const a = generateRound(pool, 12345, 2);
    const b = generateRound(pool, 12345, 2);
    expect(a).toEqual(b);
  });

  it("keeps the snippet short enough to read", () => {
    for (const r of rounds) {
      expect(r.source.split("\n").length).toBeLessThanOrEqual(20);
    }
  });
});

describe("mulberry32", () => {
  it("is deterministic and stays in range", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
