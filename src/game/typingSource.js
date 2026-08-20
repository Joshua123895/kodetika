// Picks snippets for the Speed Typing game.
//
// Pure and injectable so it can be unit tested without Vite, same as
// guessOutput.js.

import { runnableSource } from "../data/levelSource.js";

/**
 * Levels whose solution is a comfortable length to type: long enough to measure
 * a speed, short enough not to be a chore. Tabs and very long lines are
 * excluded — they make the per-character diff ambiguous on screen.
 */
export function buildTypingPool(tracks) {
  const pool = [];
  const seen = new Set();

  for (const track of tracks) {
    for (const chapter of track.chapters || []) {
      for (const level of chapter.levels || []) {
        // `req` levels excluded too: runnableSource now carries the grader's
        // request driver, and typing out generated plumbing teaches nothing.
        if (level.game || level.req || chapter.lib || !(level.solution ?? level.sol)) continue;

        const src = runnableSource(track.slug, level).trimEnd();
        if (!src || src.includes("\t")) continue;

        const lines = src.split("\n");
        if (lines.length < 2 || lines.length > 9) continue;
        if (lines.some((l) => l.length > 60)) continue;
        if (src.length < 40 || src.length > 260) continue;

        // The same snippet can appear in more than one track.
        if (seen.has(src)) continue;
        seen.add(src);

        pool.push({ src, name: level.name, slug: track.slug });
      }
    }
  }
  return pool;
}

/** Characters the player must actually type. Leading indentation is supplied
 *  automatically on Enter, so it does not count toward the score. */
export function typedLength(src) {
  return src
    .split("\n")
    .map((l, i) => (i === 0 ? l : l.replace(/^\s+/, "")))
    .join("\n").length;
}

/** Words per minute, using the standard 5-characters-per-word convention. */
export function wpm(charCount, elapsedMs) {
  if (!elapsedMs) return 0;
  return Math.round((charCount / 5) / (elapsedMs / 60000));
}

/** At or above this, a run counts as clean enough to set a record. */
export const CLEAN_RUN_ACCURACY = 95;

// A run shorter than this has not measured anything: the clock starts on the
// first keystroke, so a very short snippet can finish a few milliseconds later.
export const MIN_TIMED_MS = 1500;

// Sustained human records sit near 200. Past this it is a burst of input or a
// key repeating, not a person typing.
export const MAX_HUMAN_WPM = 250;

/**
 * The speed of a finished run, and whether it is allowed to become a record.
 *
 * `autoChars` is the indentation the editor supplied on Enter. It lands in the
 * typed text and counts toward finishing the snippet, but nobody pressed those
 * keys, so it comes out before the speed is worked out.
 *
 * The plausibility check matters because recordScore only ever raises the
 * stored value: one impossible figure becomes a personal best that can never be
 * beaten, and the number is then wrong forever.
 */
export function scoreRun({ chars, autoChars = 0, elapsedMs, accuracyPct }) {
  const typedChars = Math.max(0, chars - autoChars);
  const speed = wpm(typedChars, elapsedMs);
  return {
    wpm: speed,
    record:
      accuracyPct >= CLEAN_RUN_ACCURACY &&
      elapsedMs >= MIN_TIMED_MS &&
      speed <= MAX_HUMAN_WPM,
  };
}

export function accuracy(correctKeystrokes, totalKeystrokes) {
  if (!totalKeystrokes) return 100;
  return Math.round((correctKeystrokes / totalKeystrokes) * 100);
}
