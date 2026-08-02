// The single definition of "the Python program a level's solution actually is".
//
// This has to be one function because three places need the same answer and had
// been disagreeing:
//   - tests/levels.test.js, which verifies every solution against real CPython
//   - src/pages/LevelPage.jsx, when grading a level that has no `tests` by
//     diffing the student's output against the solution's
//   - the mini-game content generators, which need the exact source that
//     produces a level's recorded expected output
//
// Deliberately plain ESM: no import.meta.glob, no `?react` imports. src/data/
// tracks.js is Vite-only, so node scripts and vitest cannot import it — they can
// import this.

/**
 * Removes the common leading indentation from a block of code. YAML block
 * scalars carry the document's indentation into the string.
 */
export function dedent(str) {
  if (!str) return "";
  const lines = str.split("\n");
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^(\s*)/)[1].length);
  if (indents.length === 0) return "";
  const min = Math.min(...indents);
  return lines.map((l) => l.slice(min)).join("\n");
}

/**
 * Tracks whose solutions are written as a CONTINUATION of the starter code
 * rather than as a whole program. Keyed by track slug, never by file name or
 * array index: `track.id` is derived from the order Vite's glob happens to
 * return, which is not something to depend on.
 */
export const NEEDS_PRELUDE = new Set(["data-structures", "algorithms"]);

/**
 * The complete runnable program for a level's solution.
 *
 * Accepts either the parsed shape (`startingCode`/`solution`, from
 * src/data/tracks.js) or the raw YAML shape (`start`/`sol`), so callers that
 * read the YAML directly do not have to translate first.
 */
export function runnableSource(trackSlug, level) {
  const starter = level.startingCode ?? level.start ?? "";
  const solution = level.solution ?? level.sol ?? "";

  // The newline matters. Concatenating directly — as LevelPage used to — glues
  // the solution onto the starter's last line, e.g. "    ...from contextlib
  // import contextmanager", a SyntaxError.
  if (NEEDS_PRELUDE.has(trackSlug) && starter.trim()) {
    return dedent(starter + "\n" + solution);
  }
  return dedent(solution);
}

/**
 * FNV-1a 32-bit hash, hex. Used by generated mini-game content to detect that
 * the level it was built from has since been edited, so a stale puzzle can be
 * dropped rather than pointing at the wrong line.
 */
export function srcHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
