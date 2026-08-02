import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { load as loadYaml } from "js-yaml";
import { runnableSource, srcHash } from "../src/data/levelSource.js";
import { norm } from "../src/utils/outputMatcher.js";
import manifest from "../src/data/bughunt.json";

// Bug Hunt ships pre-verified puzzles, so the failure this suite exists to catch
// is a puzzle that has quietly stopped being a bug — because the level it was
// built from was edited, or because the mutation never really broke anything.

const TRACKS_DIR = join(process.cwd(), "src", "data", "tracks");

// Rebuild the level index exactly as the generator does: ids restart at 1 per
// track and count every level, including ones the generator skipped.
const levels = new Map();
for (const file of readdirSync(TRACKS_DIR).filter((f) => f.endsWith(".yaml")).sort()) {
  const track = loadYaml(readFileSync(join(TRACKS_DIR, file), "utf-8"));
  let id = 0;
  for (const ch of track.chapters || []) {
    for (const lvl of ch.levels || []) {
      id++;
      levels.set(`${track.slug}#${id}`, { track, level: lvl });
    }
  }
}

const puzzles = manifest.puzzles;

let pythonCmd = null;
beforeAll(() => {
  for (const cmd of ["python", "python3", "py"]) {
    const r = spawnSync(cmd, ["--version"], { timeout: 5000 });
    if (!r.error && r.status === 0) { pythonCmd = cmd; return; }
  }
  throw new Error("Python not found.");
});

const run = (code) => {
  const r = spawnSync(pythonCmd, ["-"], { input: code, encoding: "utf-8", timeout: 10000 });
  return { stdout: r.stdout || "", stderr: r.stderr || "" };
};

function sourceFor(p) {
  const entry = levels.get(`${p.t}#${p.l}`);
  if (!entry) return null;
  return runnableSource(entry.track.slug, entry.level);
}

describe("bug hunt manifest", () => {
  it("ships a usable deck", () => {
    expect(puzzles.length).toBeGreaterThan(100);
    expect(manifest.version).toBe(1);
  });

  it("every puzzle still points at a level that exists", () => {
    const missing = puzzles.filter((p) => !levels.has(`${p.t}#${p.l}`));
    expect(missing.map((p) => `${p.t}#${p.l}`)).toEqual([]);
  });

  // The staleness gate. If a YAML edit changes a level a puzzle was built from,
  // the recorded line index now points somewhere else — this fails first.
  it("no puzzle has gone stale against its source", () => {
    const stale = [];
    for (const p of puzzles) {
      const src = sourceFor(p);
      if (src === null || srcHash(src) !== p.h) stale.push(`${p.t}#${p.l} ${p.n}`);
    }
    expect(stale).toEqual([]);
  });

  it("targets a real, non-blank, non-comment line and actually changes it", () => {
    for (const p of puzzles) {
      const lines = sourceFor(p).split("\n");
      expect(p.i).toBeGreaterThanOrEqual(0);
      expect(p.i).toBeLessThan(lines.length);
      const original = lines[p.i].trim();
      expect(original.length).toBeGreaterThan(0);
      expect(original.startsWith("#")).toBe(false);
      expect(p.s).not.toBe(lines[p.i]);
      expect(p.a).toContain(p.i);
    }
  });

  it("keeps easy syntax-error puzzles a small minority", () => {
    const syntax = puzzles.filter((p) => p.c === "SYNTAX").length;
    expect(syntax / puzzles.length).toBeLessThanOrEqual(0.2);
  });

  it("has no duplicate puzzles", () => {
    const keys = puzzles.map((p) => `${p.t}#${p.l}#${p.i}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // The expensive one, deliberately unconditional: a puzzle that no longer
  // breaks its program is exactly what this game cannot tolerate shipping.
  it("every mutation still breaks its program, and still prints what was recorded", () => {
    const broken = [];
    for (const p of puzzles) {
      const lines = sourceFor(p).split("\n");
      const expected = norm(run(lines.join("\n")).stdout);
      lines[p.i] = p.s;
      const r = run(lines.join("\n"));
      const actual = norm(r.stdout);

      if (actual === expected && !r.stderr.trim()) {
        broken.push(`${p.t}#${p.l} ${p.n}: mutation no longer changes behaviour`);
      } else if (p.c === "SILENT" && actual !== p.w) {
        broken.push(`${p.t}#${p.l} ${p.n}: recorded output drifted`);
      }
    }
    expect(broken).toEqual([]);
  }, 600000);
});
