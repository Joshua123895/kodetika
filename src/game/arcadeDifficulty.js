// The difficulty the player picks in the arcade, shared by both quiz games so
// "Medium" means the same kind of thing in each.
//
// Tier 1/2/3 matches the tier Guess the Output already generated rounds at —
// it simply used to choose for you, ramping up on a streak and down on misses.
// Choosing it yourself is the same dial, held still.
//
// Pure: no React, no DOM, so the bucket rules can be tested by running them.

export const TIERS = [
  { tier: 1, label: "Easy" },
  { tier: 2, label: "Medium" },
  { tier: 3, label: "Hard" },
];

export const DEFAULT_TIER = 2;

/** A stored/typed tier value, clamped to something the games can use. */
export function normaliseTier(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TIER;
  return Math.min(3, Math.max(1, Math.round(n)));
}

// How many lines of listing each tier is willing to make you scan. Bug Hunt's
// difficulty is mostly "how much is there to search", so length leads here;
// `d` (the puzzle's track difficulty, or 1 for a syntax error) rules out the
// advanced tracks at the easier tiers the way it does in Guess the Output.
export const BUG_HUNT_LINES = { 1: 12, 2: 20, 3: Infinity };

/**
 * Is this puzzle allowed at `tier`? `lines` is the length of the listing the
 * player has to scan, which the page already computes to render it.
 *
 * Cumulative on purpose: Medium includes everything Easy offers. The deck is
 * small enough (183 puzzles) that exclusive bands would leave Easy with a
 * couple of dozen and repeat them within a sitting.
 */
export function bugHuntFits(puzzle, lines, tier) {
  if (lines > (BUG_HUNT_LINES[tier] ?? Infinity)) return false;
  return tier >= 3 ? true : (puzzle.d ?? 3) <= tier + 1;
}
