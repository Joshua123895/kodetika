// Measures every level's "≤ N lines" star budget against that level's own
// official solution.
//
// Shared by tests/starBudgets.test.js (the CI guard) and scripts/star-budgets.mjs
// (the local report/repair CLI). It lives here rather than under scripts/ because
// scripts/ is gitignored, and the guard has to survive a clean clone.
//
// Not a test file itself — vitest only collects *.test.js.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { dedent, NEEDS_PRELUDE } from "../src/data/levelSource.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TRACK_DIR = join(ROOT, "src/data/tracks");

/** Non-empty lines only — exactly what LevelPage.jsx counts when grading. */
export function countLines(code) {
  return code
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim()).length;
}

/**
 * The source a student would have in the editor when they hit Submit.
 *
 * This is NOT runnableSource(). Prelude tracks hand the student a starter that
 * stays in the editor, so the graded text is starter + their addition — except
 * that many of those levels' `sol` fields already repeat the starter verbatim,
 * in which case concatenating counts the same class twice. Detected by looking
 * for the starter's first meaningful line inside `sol`.
 */
export function submittedSource(trackSlug, level) {
  const starter = dedent(level.start ?? "");
  const solution = dedent(level.sol ?? "");
  if (!NEEDS_PRELUDE.has(trackSlug) || !starter.trim()) return solution;

  const firstStarterLine = starter.split("\n").find((l) => l.trim());
  if (firstStarterLine && solution.includes(firstStarterLine.trim())) return solution;

  return starter + "\n" + solution;
}

function loadTracks() {
  return readdirSync(TRACK_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((file) => ({ file, track: load(readFileSync(join(TRACK_DIR, file), "utf8")) }));
}

/** One row per level that declares a `max:`, with `margin < 0` meaning impossible. */
export function auditLevels() {
  const rows = [];
  for (const { file, track } of loadTracks()) {
    for (const chapter of track.chapters ?? []) {
      for (const level of chapter.levels ?? []) {
        if (!level.max || !level.sol) continue;
        const budget = parseInt(String(level.max).split("/")[0], 10);
        if (!Number.isFinite(budget)) continue;
        const needed = countLines(submittedSource(track.slug, level));
        rows.push({
          file,
          track: track.slug,
          chapter: chapter.name,
          name: level.name,
          max: String(level.max),
          budget,
          needed,
          margin: budget - needed,
        });
      }
    }
  }
  return rows;
}

/**
 * How much room over the official solution a repaired budget gets.
 *
 * Not invented — these are the median margins the hand-written budgets already
 * use, bucketed by solution length, measured over the 363 levels that were
 * already achievable (`node scripts/star-budgets.mjs` prints the table). Longer
 * solutions genuinely carry more slack in the existing content, which makes
 * sense: matching a reference exactly over 24 lines is a much harder ask than
 * over 3. The 11-15 bucket's median is +1.5; it rounds up, since a budget that
 * is slightly too generous costs a player nothing.
 */
export function slackFor(solutionLines) {
  if (solutionLines <= 10) return 1;
  if (solutionLines <= 15) return 2;
  return 3;
}
