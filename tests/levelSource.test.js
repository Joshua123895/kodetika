import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { load as loadYaml } from "js-yaml";
import { runnableSource, dedent, srcHash, NEEDS_PRELUDE } from "../src/data/levelSource.js";
import { norm } from "../src/utils/outputMatcher.js";

// runnableSource() is the single definition of "the program a solution is", and
// three things now depend on it (the level test suite, LevelPage's solution-diff
// grading, and the mini-game generators). This proves the rule against real
// CPython rather than trusting it.

const TRACKS_DIR = join(process.cwd(), "src", "data", "tracks");

let pythonCmd = "python";
beforeAll(() => {
  for (const cmd of ["python", "python3"]) {
    try {
      execSync(`${cmd} --version`, { timeout: 3000, stdio: "ignore" });
      pythonCmd = cmd;
      return;
    } catch { /* try next */ }
  }
  throw new Error("Python not found.");
});

function run(code) {
  const dir = mkdtempSync(join(tmpdir(), "lsrc-"));
  try {
    writeFileSync(join(dir, "main.py"), code, "utf-8");
    return execSync(`${pythonCmd} main.py`, { cwd: dir, timeout: 15000, encoding: "utf-8", input: "" });
  } catch (e) {
    return (e.stdout || "") + (e.stderr || "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Every level that is fully deterministic: one test, a concrete expected output,
// no stdin, no seeded files.
const deterministic = [];
for (const file of readdirSync(TRACKS_DIR).filter((f) => f.endsWith(".yaml"))) {
  const track = loadYaml(readFileSync(join(TRACKS_DIR, file), "utf-8"));
  for (const ch of track.chapters || []) {
    for (const lvl of ch.levels || []) {
      if (!lvl.sol || lvl.files || !Array.isArray(lvl.tests) || lvl.tests.length !== 1) continue;
      const t = lvl.tests[0];
      const expected = typeof t === "string" ? t : t.exp;
      const hasInput = typeof t === "object" && t.in !== undefined;
      if (expected === undefined || hasInput) continue;
      deterministic.push({ slug: track.slug, file, name: lvl.name, level: lvl, expected });
    }
  }
}

describe("runnableSource", () => {
  it("found a deterministic corpus to check against", () => {
    expect(deterministic.length).toBeGreaterThan(250);
  });

  it("adds a newline between starter and solution for prelude tracks", () => {
    // Concatenating without one produced "    ...from contextlib import …".
    const src = runnableSource("algorithms", { start: "a = 1", sol: "print(a)" });
    expect(src).toBe("a = 1\nprint(a)");
  });

  it("ignores the starter for tracks whose solutions are whole programs", () => {
    expect(runnableSource("python", { start: "IGNORED", sol: "print(1)" })).toBe("print(1)");
    expect(NEEDS_PRELUDE.has("python")).toBe(false);
  });

  it("accepts both the parsed and the raw YAML field names", () => {
    expect(runnableSource("python", { solution: "print(1)" })).toBe(
      runnableSource("python", { sol: "print(1)" })
    );
  });

  it("dedents YAML block-scalar indentation", () => {
    expect(dedent("    a = 1\n    b = 2")).toBe("a = 1\nb = 2");
  });

  it("hashes stably and differs on any edit", () => {
    expect(srcHash("print(1)")).toBe(srcHash("print(1)"));
    expect(srcHash("print(1)")).not.toBe(srcHash("print(2)"));
    expect(srcHash("print(1)")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("reproduces every deterministic level's expected output in real Python", () => {
    const mismatches = [];
    for (const entry of deterministic) {
      const src = runnableSource(entry.slug, entry.level);
      const got = run(src);
      if (norm(got) !== norm(entry.expected)) {
        mismatches.push(`${entry.file} :: ${entry.name}\n    expected ${JSON.stringify(norm(entry.expected)).slice(0, 60)}\n    got      ${JSON.stringify(norm(got)).slice(0, 60)}`);
      }
    }
    expect(mismatches.join("\n")).toBe("");
  }, 600000);
});
