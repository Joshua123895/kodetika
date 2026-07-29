import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { load as loadYaml } from "js-yaml";
import { norm } from "../src/utils/outputMatcher.js";

// Guards for Python Fundamentals specifically. levels.test.js already proves the
// solutions produce their declared test output; these cover the two failure
// modes it structurally cannot see:
//
//   1. A level whose `example` block was written by hand and never run. The
//      student reads it as the spec, so a wrong one is unguessable. This is a
//      real bug that shipped: The Grand Quest showed the hero winning a fight
//      the halving rule makes unwinnable, and its example failed its own regex.
//   2. A `max` line budget smaller than the reference solution, which makes the
//      3rd star unreachable no matter what the student writes.
//
// NOTE: check 2 is scoped to python1 on purpose. python2/3/4 currently have 77
// levels that violate it and are not yet fixed.

const track = loadYaml(readFileSync(join(process.cwd(), "src/data/tracks/python1.yaml"), "utf8"));
const levels = track.chapters.flatMap((ch) => ch.levels.map((level) => ({ chapter: ch.name, level })));

function runPython(code, inputs, files) {
  const dir = mkdtempSync(join(tmpdir(), "p1-"));
  try {
    for (const [name, content] of Object.entries(files || {})) writeFileSync(join(dir, name), String(content));
    writeFileSync(join(dir, "main.py"), code);
    return execSync("python main.py", {
      cwd: dir,
      input: (inputs || []).map(String).join("\n") + "\n",
      encoding: "utf8",
      timeout: 20000,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Python Fundamentals · line budgets", () => {
  it("every reference solution fits inside its own max, so 3 stars is reachable", () => {
    const unreachable = [];
    for (const { chapter, level } of levels) {
      if (!level.sol || !level.max) continue;
      const solLines = level.sol.split("\n").filter((l) => l.trim() !== "").length;
      const maxLines = parseInt(String(level.max).split("/")[0], 10);
      if (solLines > maxLines) unreachable.push(`${chapter} / ${level.name}: sol is ${solLines} lines, max is ${maxLines}`);
    }
    expect(unreachable).toEqual([]);
  });
});

describe("Python Fundamentals · examples are real", () => {
  for (const { chapter, level } of levels) {
    if (!level.example) continue;
    const expected = level.example.out ?? level.example.output;
    if (expected === undefined) continue;

    const regexTest = (level.tests || []).find((t) => t && typeof t === "object" && typeof t.match === "string");

    it(`${chapter} / ${level.name}`, () => {
      if (regexTest) {
        // Randomised levels cannot have one fixed answer, so the example only
        // has to be a shape the grader would actually accept.
        expect(new RegExp(regexTest.match, "s").test(expected)).toBe(true);
        return;
      }
      const rawIn = level.example.in ?? level.example.input;
      const inputs = rawIn === undefined ? [] : Array.isArray(rawIn) ? rawIn : [rawIn];
      const actual = runPython(level.sol, inputs, level.files?.initial);
      expect(norm(actual)).toBe(norm(expected));
    });
  }
});
