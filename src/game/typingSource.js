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

export function accuracy(correctKeystrokes, totalKeystrokes) {
  if (!totalKeystrokes) return 100;
  return Math.round((correctKeystrokes / totalKeystrokes) * 100);
}
