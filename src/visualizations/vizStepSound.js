// Decides which sound each playback step should make.
//
// Policy: every step ticks, except
//   - a step that deletes something, or reports a negative outcome -> "fail"
//   - a step that finds something, or finishes the run -> "complete"
//
// State shapes differ a lot between vizzes: the interpreter-backed ones
// (search, hash map) carry a human-readable `status` string, while the
// structural ones (stack, queue, tree, heap, linked list) are raw snapshots
// with no label at all. So deletion is detected structurally instead, by
// counting item-like objects and noticing when the count drops.

// Negative outcomes. Checked before the success pattern because "No pair
// found" and "Not found" both contain the word "found".
const FAIL_STATUS = /not found|no result|no pair found|\bfail|\berror|invalid|underflow|overflow/i;

// Positive outcomes. `\bfound\b` avoids matching the "found" inside the
// negative phrases above (already excluded) while catching "Found at index 3".
const DONE_STATUS = /\bfound\b|complete|sorted|\bdone\b|success/i;

// An "item" is any plain object carrying a value-ish or identity key. That
// matches the node/element objects every structural viz builds
// ({ val, _id }, { value, _id }, tree's { name, val, left, right }) while
// ignoring bookkeeping arrays of plain numbers such as `activeRange: [0, 5]`
// or `found: [2]`, which would otherwise read as items appearing/vanishing.
function countItems(node, seen = new Set()) {
  if (node === null || typeof node !== "object") return 0;
  if (seen.has(node)) return 0; // guard against cyclic structures
  seen.add(node);

  if (Array.isArray(node)) {
    let n = 0;
    for (const entry of node) n += countItems(entry, seen);
    return n;
  }

  const isItem =
    Object.hasOwn(node, "_id") ||
    Object.hasOwn(node, "val") ||
    Object.hasOwn(node, "value");

  let n = isItem ? 1 : 0;
  for (const key of Object.keys(node)) n += countItems(node[key], seen);
  return n;
}

// Stable identity for a state's `found` indices, or "" when nothing is found.
// Comparing these across steps distinguishes a new find from one still shown.
function foundKey(state) {
  const found = state?.found;
  if (!Array.isArray(found) || found.length === 0) return "";
  return found.join(",");
}

/**
 * Classify a single step as "tick", "fail" or "complete".
 *
 * Order matters: an explicit negative status wins over everything (so a search
 * that ends "Not found" still sounds like a failure on its final frame), then
 * the final frame resolves as "complete" so a run always ends on a settled
 * sound, then explicit success, then structural deletion.
 */
export function classifyStep(states, i) {
  if (!Array.isArray(states) || i < 0 || i >= states.length) return "tick";

  const state = states[i];
  const status = typeof state?.status === "string" ? state.status : "";

  if (FAIL_STATUS.test(status)) return "fail";
  if (i === states.length - 1) return "complete";
  if (DONE_STATUS.test(status)) return "complete";

  // A find, detected structurally: `found` holds the matched indices, so the
  // step where it first becomes non-empty is the moment the target was hit.
  // Requiring a change means a find that stays highlighted across several
  // trailing frames only sounds once.
  if (foundKey(state) && foundKey(state) !== foundKey(states[i - 1])) return "complete";

  if (i > 0 && countItems(state) < countItems(states[i - 1])) return "fail";

  return "tick";
}

/** Classify every step up front, so playback only does an array lookup. */
export function classifyStepSounds(states) {
  if (!Array.isArray(states)) return [];
  return states.map((_, i) => classifyStep(states, i));
}

export { countItems };
