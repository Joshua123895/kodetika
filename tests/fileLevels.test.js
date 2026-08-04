import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { load as loadYaml } from "js-yaml";
import { runnableSource } from "../src/data/levelSource.js";

// Levels that hand the student a file are graded by reading that file back, not
// by comparing printed output (see LevelPage's `files.track` branch). Nothing
// else in the suite exercises that contract: levels.test.js compares stdout, so
// a file level whose solution prints nothing is skipped outright. These tests
// run the real solution against real CPython and inspect the resulting files.

const TRACKS_DIR = join(process.cwd(), "src/data/tracks");
const YAML_BY_SLUG = { python: "python1.yaml", "python-beyond": "python2.yaml" };

let pythonCmd = null;
beforeAll(() => {
  for (const cmd of ["python", "python3", "py"]) {
    try {
      execSync(`${cmd} --version`, { timeout: 3000, stdio: "ignore" });
      pythonCmd = cmd;
      return;
    } catch {
      // Not this interpreter — try the next candidate.
    }
  }
  throw new Error("Python not found. Install Python to run file-level tests.");
});

/** Runs `code` in a fresh temp dir seeded with `initialFiles`, then reads back `tracked`. */
function runAndCollect(code, initialFiles, tracked) {
  const dir = mkdtempSync(join(tmpdir(), "sitc-files-"));
  try {
    for (const [name, content] of Object.entries(initialFiles || {})) {
      const filePath = join(dir, name);
      if (!existsSync(dirname(filePath))) mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, String(content), "utf-8");
    }
    writeFileSync(join(dir, "main.py"), code, "utf-8");

    let stdout = "";
    try {
      stdout = execSync(`${pythonCmd} main.py`, {
        cwd: dir, timeout: 10000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      stdout = (e.stdout || "") + (e.stderr || "");
    }

    const files = {};
    for (const name of tracked || []) {
      const filePath = join(dir, name);
      files[name] = existsSync(filePath) ? readFileSync(filePath, "utf-8") : null;
    }
    return { stdout, files };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // A leftover temp dir is harmless; never fail a test over cleanup.
    }
  }
}

function fileLevels() {
  const out = [];
  for (const [slug, file] of Object.entries(YAML_BY_SLUG)) {
    const track = loadYaml(readFileSync(join(TRACKS_DIR, file), "utf-8"));
    for (const chapter of track.chapters) {
      for (const level of chapter.levels) {
        if (!level.files?.track?.length) continue;
        out.push({ slug, chapter: chapter.name, level });
      }
    }
  }
  return out;
}

describe("levels graded by file contents", () => {
  for (const { slug, chapter, level } of fileLevels()) {
    const tracked = level.files.track;
    const initial = level.files.initial || {};

    it(`${chapter} / ${level.name} — solution produces every tracked file`, () => {
      const { files } = runAndCollect(runnableSource(slug, level), initial, tracked);
      for (const name of tracked) {
        expect(files[name], `${name} missing after running the solution`).not.toBeNull();
      }
    });

    // Only levels with no stdout assertion reach the file-comparison branch. For
    // those, the solution MUST leave at least one tracked file different from
    // what it started as — otherwise doing nothing at all would also pass.
    const gradedOnFiles = !(level.tests?.length > 0) && !level.sol.includes("print(");
    if (gradedOnFiles) {
      it(`${chapter} / ${level.name} — actually changes a tracked file`, () => {
        const { files } = runAndCollect(runnableSource(slug, level), initial, tracked);
        const changed = tracked.some((name) => files[name] !== (initial[name] ?? null));
        expect(changed, "solution left every tracked file exactly as seeded, so an empty submission would pass too").toBe(true);
      });
    }
  }
});

describe("File Handling level 68 (Write a File)", () => {
  const track = loadYaml(readFileSync(join(TRACKS_DIR, "python1.yaml"), "utf-8"));
  const level = track.chapters.flatMap((c) => c.levels).find((l) => l.id === 68);

  it("is graded by reading the file, not by printed output", () => {
    // Both conditions are load-bearing: a `tests` block or a print() in the
    // solution makes LevelPage settle on stdout and never look at the file.
    expect(level.tests).toBeUndefined();
    expect(level.sol).not.toContain("print(");
    expect(level.files.track).toContain("test.txt");
  });

  it("really rewrites test.txt", () => {
    const seed = level.files.initial["test.txt"];
    const { files, stdout } = runAndCollect(runnableSource("python", level), level.files.initial, ["test.txt"]);
    expect(files["test.txt"]).toBe("Hello");
    expect(files["test.txt"]).not.toBe(seed);
    expect(stdout.trim()).toBe("");
  });
});
