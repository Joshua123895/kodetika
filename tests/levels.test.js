import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { mkdtempSync, writeFileSync as writeTmp, readFileSync as readTmp, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { load as loadYaml } from "js-yaml";
import { checkOutput } from "../src/utils/outputMatcher.js";

function dedent(str) {
  if (!str) return "";
  const lines = str.split("\n");
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^(\s*)/)[1].length);
  if (indents.length === 0) return "";
  const min = Math.min(...indents);
  return lines.map((l) => l.slice(min)).join("\n");
}

const ROOT = join(import.meta.dirname, "..");
const TRACKS_DIR = join(ROOT, "src", "data", "tracks");

let pythonCmd = "python";
beforeAll(() => {
  for (const cmd of ["python", "python3"]) {
    try {
      execSync(`${cmd} --version`, { timeout: 3000, stdio: "ignore" });
      pythonCmd = cmd;
      return;
    } catch {}
  }
  throw new Error("Python not found. Install Python to run level tests.");
});

function loadYamlFile(file) {
  const raw = readFileSync(join(TRACKS_DIR, file), "utf-8");
  return loadYaml(raw);
}

function runPython(code, initialFiles = {}, inputs = []) {
  const dir = mkdtempSync(join(tmpdir(), "sitc-test-"));
  try {
    for (const [name, content] of Object.entries(initialFiles)) {
      const filePath = join(dir, name);
      const dirPath = join(dir, name.split("/").slice(0, -1).join("/"));
      if (dirPath !== dir && !existsSync(dirPath)) {
        mkdtempSync(dirPath);
      }
      writeTmp(filePath, String(content), "utf-8");
    }
    writeTmp(join(dir, "main.py"), code, "utf-8");

    const inputStr = inputs.length > 0 ? inputs.join("\n") + "\n" : "";
    const stdout = execSync(`${pythonCmd} main.py`, {
      cwd: dir,
      timeout: 10000,
      encoding: "utf-8",
      input: inputStr,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return stdout;
  } catch (e) {
    const stderr = e.stderr || "";
    const stdout = e.stdout || "";
    return stdout + stderr;
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

function normalizeTest(t) {
  if (typeof t === "string") return { expected: t };
  const out = {};
  if (t.in !== undefined) out.input = t.in;
  if (t.exp !== undefined) out.expected = t.exp;
  if (t.any !== undefined) out.expectAnyOf = t.any;
  if (t.match !== undefined) out.expectMatch = t.match;
  return out;
}

function loadTracks(file) {
  const data = loadYamlFile(file);
  const tracks = [];
  for (const ch of data.chapters || []) {
    for (const lvl of ch.levels || []) {
      tracks.push({ chapter: ch.name, level: lvl });
    }
  }
  return tracks;
}

function makeTestName(chapter, level) {
  const id = level.id !== undefined ? ` (id:${level.id})` : "";
  return `${chapter} → ${level.name}${id}`;
}

describe("Python Fundamentals", () => {
  const levels = loadTracks("python1.yaml");

  for (const { chapter, level } of levels) {
    const solutionCode = dedent(level.sol);

    if (level.tests && level.tests.length > 0) {
      describe(chapter, () => {
        for (const rawTest of level.tests) {
          const test = normalizeTest(rawTest);
          const input = test.input !== undefined ? (Array.isArray(test.input) ? test.input : [test.input]) : [];
          const label = input.length > 0
            ? `${level.name}${level.id !== undefined ? ` (id:${level.id})` : ""}, input: ${JSON.stringify(input)}`
            : `${level.name}${level.id !== undefined ? ` (id:${level.id})` : ""}`;

          it(label, () => {
            const output = runPython(solutionCode, level.files?.initial || {}, input);
            expect(checkOutput(output, test)).toBe(true);
          });
        }
      });
    } else if (level.sol.includes("print(")) {
      it(makeTestName(chapter, level), () => {
        const output = runPython(solutionCode, level.files?.initial || {});
        expect(output.trim()).not.toBe("");
      });
    } else {
      it.skip(`${makeTestName(chapter, level)}, no tests, no print in solution`);
    }
  }
});

describe("Python Advance", () => {
  const levels = loadTracks("python2.yaml");

  for (const { chapter, level } of levels) {
    const solutionCode = dedent(level.sol);

    if (level.tests && level.tests.length > 0) {
      describe(chapter, () => {
        for (const rawTest of level.tests) {
          const test = normalizeTest(rawTest);
          const input = test.input !== undefined ? (Array.isArray(test.input) ? test.input : [test.input]) : [];
          const label = input.length > 0
            ? `${level.name}${level.id !== undefined ? ` (id:${level.id})` : ""}, input: ${JSON.stringify(input)}`
            : `${level.name}${level.id !== undefined ? ` (id:${level.id})` : ""}`;

          it(label, () => {
            const output = runPython(solutionCode, level.files?.initial || {}, input);
            expect(checkOutput(output, test)).toBe(true);
          });
        }
      });
    } else if (level.sol.includes("print(")) {
      it(makeTestName(chapter, level), () => {
        const output = runPython(solutionCode, level.files?.initial || {});
        expect(output.trim()).not.toBe("");
      });
    } else {
      it.skip(`${makeTestName(chapter, level)}, no tests, no print in solution`);
    }
  }
});

describe("Object-Oriented Programming", () => {
  const levels = loadTracks("python3.yaml");

  for (const { chapter, level } of levels) {
    const solutionCode = dedent(level.sol);

    if (level.tests && level.tests.length > 0) {
      describe(chapter, () => {
        for (const rawTest of level.tests) {
          const test = normalizeTest(rawTest);
          const input = test.input !== undefined ? (Array.isArray(test.input) ? test.input : [test.input]) : [];
          const label = input.length > 0
            ? `${level.name}${level.id !== undefined ? ` (id:${level.id})` : ""}, input: ${JSON.stringify(input)}`
            : `${level.name}${level.id !== undefined ? ` (id:${level.id})` : ""}`;

          it(label, () => {
            const output = runPython(solutionCode, level.files?.initial || {}, input);
            expect(checkOutput(output, test)).toBe(true);
          });
        }
      });
    } else if (level.sol.includes("print(")) {
      it(makeTestName(chapter, level), () => {
        const output = runPython(solutionCode, level.files?.initial || {});
        expect(output.trim()).not.toBe("");
      });
    } else {
      it.skip(`${makeTestName(chapter, level)}, no tests, no print in solution`);
    }
  }
});

describe("Data Structures", () => {
  const levels = loadTracks("python4.yaml");

  for (const { chapter, level } of levels) {
    const solutionCode = level.start ? dedent(level.start + "\n" + level.sol) : dedent(level.sol);

    if (level.tests && level.tests.length > 0) {
      describe(chapter, () => {
        for (const rawTest of level.tests) {
          const test = normalizeTest(rawTest);
          const input = test.input !== undefined ? (Array.isArray(test.input) ? test.input : [test.input]) : [];
          const label = input.length > 0
            ? `${level.name}${level.id !== undefined ? ` (id:${level.id})` : ""}, input: ${JSON.stringify(input)}`
            : `${level.name}${level.id !== undefined ? ` (id:${level.id})` : ""}`;

          it(label, () => {
            const output = runPython(solutionCode, level.files?.initial || {}, input);
            expect(checkOutput(output, test)).toBe(true);
          });
        }
      });
    } else if (level.sol.includes("print(")) {
      it(makeTestName(chapter, level), () => {
        const output = runPython(solutionCode, level.files?.initial || {});
        expect(output.trim()).not.toBe("");
      });
    } else {
      it.skip(`${makeTestName(chapter, level)}, no tests, no print in solution`);
    }
  }
});

describe("Machine Learning", () => {
  // python7 solutions are standalone complete programs (the level `start` is
  // student-facing scaffolding that the solution already contains), so run
  // `sol` on its own rather than concatenating start + sol.
  const levels = loadTracks("python7.yaml");

  for (const { chapter, level } of levels) {
    const solutionCode = dedent(level.sol);

    if (level.tests && level.tests.length > 0) {
      describe(chapter, () => {
        for (const rawTest of level.tests) {
          const test = normalizeTest(rawTest);
          const input = test.input !== undefined ? (Array.isArray(test.input) ? test.input : [test.input]) : [];
          const label = `${level.name}${level.id !== undefined ? ` (id:${level.id})` : ""}`;

          it(label, () => {
            const output = runPython(solutionCode, level.files?.initial || {}, input);
            expect(checkOutput(output, test)).toBe(true);
          });
        }
      });
    } else {
      it.skip(`${makeTestName(chapter, level)}, no tests`);
    }
  }
});

describe("Algorithm Design & Patterns", () => {
  const levels = loadTracks("python5.yaml");

  for (const { chapter, level } of levels) {
    const solutionCode = level.start ? dedent(level.start + "\n" + level.sol) : dedent(level.sol);

    if (level.tests && level.tests.length > 0) {
      describe(chapter, () => {
        for (const rawTest of level.tests) {
          const test = normalizeTest(rawTest);
          const input = test.input !== undefined ? (Array.isArray(test.input) ? test.input : [test.input]) : [];
          const label = input.length > 0
            ? `${level.name}${level.id !== undefined ? ` (id:${level.id})` : ""}, input: ${JSON.stringify(input)}`
            : `${level.name}${level.id !== undefined ? ` (id:${level.id})` : ""}`;

          it(label, () => {
            const output = runPython(solutionCode, level.files?.initial || {}, input);
            expect(checkOutput(output, test)).toBe(true);
          });
        }
      });
    } else if (level.sol.includes("print(")) {
      it(makeTestName(chapter, level), () => {
        const output = runPython(solutionCode, level.files?.initial || {});
        expect(output.trim()).not.toBe("");
      });
    } else {
      it.skip(`${makeTestName(chapter, level)}, no tests, no print in solution`);
    }
  }
});
