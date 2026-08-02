// Round generator for the "Guess the Output" mini game.
//
// Content comes from the level corpus at runtime rather than a build artifact.
// A distractor is valid iff its normalized form differs from the answer, which
// is decidable in JavaScript — so there is nothing to precompute, and a JSON
// would only duplicate bytes already in the bundle and go stale whenever a YAML
// is edited.
//
// Pure: no React, no DOM, no imports from Vite-only modules. The tracks array is
// passed in so this can be exercised from node/vitest with YAML-loaded data.

import { norm } from "../utils/outputMatcher.js";
import { runnableSource } from "../data/levelSource.js";

/** Deterministic RNG so a round is reproducible from its seed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const shuffle = (rng, arr) => {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Classifies one output line, used by the mutators and by shape matching. */
export function kindOf(line) {
  if (/^-?\d+$/.test(line)) return "I";
  if (/^-?\d+\.\d+$/.test(line)) return "F";
  if (/^(True|False)$/.test(line)) return "B";
  if (/^\[.*\]$/.test(line)) return "L";
  if (/^\(.*\)$/.test(line)) return "T";
  if (/^\{.*\}$/.test(line)) return "D";
  return "S";
}

const kindSig = (s) => s.split("\n").map(kindOf).join("");

// --- eligibility -----------------------------------------------------------

// The answer is readable straight off the snippet with no reasoning: a single
// print, no control flow, and the output sitting verbatim in the source.
// Deliberately narrow. The looser "output appears in source" rule rejects good
// rounds like "Loop Over a List", where the player must know a for-loop prints
// one item per line.
function isTrivial(src, exp) {
  const prints = (src.match(/print\(/g) || []).length;
  if (prints > 1) return false;
  if (/\b(for|while|def|if|class)\b/.test(src)) return false;
  return src.includes(exp);
}

function firstDeterministicTest(level) {
  const tests = level.tests;
  if (!Array.isArray(tests) || tests.length !== 1) return null;
  const t = tests[0];
  if (typeof t === "string") return { expected: t };
  const expected = t.expected ?? t.exp;
  const input = t.input ?? t.in;
  if (expected === undefined || input !== undefined) return null;
  return { expected };
}

export function buildPool(tracks) {
  const pool = [];
  for (const track of tracks) {
    for (const chapter of track.chapters || []) {
      for (const level of chapter.levels || []) {
        if (level.game || level.files) continue;
        const test = firstDeterministicTest(level);
        if (!test) continue;

        const src = runnableSource(track.slug, level);
        const exp = norm(test.expected);
        if (!src.trim() || !exp) continue;

        const srcLines = src.split("\n").filter((l) => l.trim()).length;
        const expLines = exp.split("\n").length;
        if (srcLines < 2 || srcLines > 14) continue;
        if (expLines > 8 || exp.length > 240) continue;
        if (isTrivial(src, exp)) continue;

        pool.push({
          src,
          exp,
          name: level.name,
          slug: track.slug,
          // level.id restarts at 1 in every track, so it is not a global
          // ordinal on its own.
          ordinal: (track.difficulty || 1) * 1000 + (level.id || 0),
          difficulty: track.difficulty || 1,
          srcLines,
          sig: kindSig(exp),
        });
      }
    }
  }
  return pool;
}

// --- distractor mutators ---------------------------------------------------
// Each models a specific beginner misconception, and returns null when it does
// not apply. They operate on the normalized answer string.

const mapLines = (s, fn) => s.split("\n").map(fn).join("\n");

function mutateOneLine(rng, s, predicate, fn) {
  const lines = s.split("\n");
  const targets = lines.map((l, i) => [l, i]).filter(([l]) => predicate(l));
  if (!targets.length) return null;
  const [line, idx] = pick(rng, targets);
  const replaced = fn(line);
  if (replaced === null || replaced === line) return null;
  lines[idx] = replaced;
  return lines.join("\n");
}

const MUTATORS = {
  // fencepost
  INT_OFF_BY_ONE: (s, rng) =>
    mutateOneLine(rng, s, (l) => kindOf(l) === "I" || /\d(?!.*\d)/.test(l), (l) =>
      l.replace(/(-?\d+)(?!.*\d)/, (m) => String(Number(m) + (rng() < 0.5 ? 1 : -1)))
    ),
  // wrong operator
  INT_SCALE: (s, rng) =>
    mutateOneLine(rng, s, (l) => kindOf(l) === "I", (l) => {
      const n = Number(l);
      const opts = [n * 2, Math.floor(n / 2), n + 10, n - 10].filter((v) => v !== n);
      return opts.length ? String(pick(rng, opts)) : null;
    }),
  // comparison direction. Flips exactly one, never all — flipping every bool is
  // a systematic tell.
  BOOL_FLIP: (s, rng) =>
    mutateOneLine(rng, s, (l) => kindOf(l) === "B", (l) => (l === "True" ? "False" : "True")),
  // / vs // vs round()
  NUM_FORM: (s, rng) =>
    mutateOneLine(rng, s, (l) => kindOf(l) === "I" || kindOf(l) === "F", (l) =>
      kindOf(l) === "F" ? l.replace(/\.\d+$/, "") : `${l}.0`
    ),
  // print(x) vs print([x]) / repr
  REPR_FORM: (s, rng) => mutateOneLine(rng, s, (l) => l.length > 0 && !l.includes("'"), (l) => `'${l}'`),
  // list / tuple / set confusion
  BRACKET_FORM: (s, rng) =>
    mutateOneLine(rng, s, (l) => kindOf(l) === "L", (l) => {
      const inner = l.slice(1, -1);
      return pick(rng, [`(${inner})`, `{${inner}}`, `[${inner.replace(/, /g, ",")}]`]);
    }),
  // wrong sort direction / wrong print order
  SEQ_REORDER: (s, rng) => {
    const lines = s.split("\n");
    if (lines.length >= 2) {
      const i = Math.floor(rng() * (lines.length - 1));
      const out = lines.slice();
      [out[i], out[i + 1]] = [out[i + 1], out[i]];
      return out.join("\n");
    }
    return mutateOneLine(rng, s, (l) => kindOf(l) === "L", (l) => {
      const parts = l.slice(1, -1).split(", ");
      return parts.length > 1 ? `[${parts.reverse().join(", ")}]` : null;
    });
  },
  // the range fencepost — drop or add a term of an arithmetic run
  RUN_SHIFT: (s, rng) => {
    const lines = s.split("\n");
    if (lines.length < 3 || !lines.every((l) => kindOf(l) === "I")) return null;
    const nums = lines.map(Number);
    const step = nums[1] - nums[0];
    if (!nums.every((n, i) => i === 0 || n - nums[i - 1] === step)) return null;
    return pick(rng, [
      nums.slice(1),
      nums.slice(0, -1),
      [...nums, nums[nums.length - 1] + step],
      nums.map((n) => n + step),
    ]).join("\n");
  },
  // print(a, b) vs print(a + b)
  SEP_SWAP: (s, rng) => mutateOneLine(rng, s, (l) => / /.test(l) && kindOf(l) === "S", (l) => l.replace(" ", "")),
  // slice off-by-one
  LIST_TRIM: (s, rng) =>
    mutateOneLine(rng, s, (l) => kindOf(l) === "L", (l) => {
      const parts = l.slice(1, -1).split(", ");
      if (parts.length < 2) return null;
      return `[${(rng() < 0.5 ? parts.slice(1) : parts.slice(0, -1)).join(", ")}]`;
    }),
  CASE_PUNCT: (s) => {
    const out = mapLines(s, (l) => l.replace(/,/g, ""));
    return out === s ? null : out;
  },
};

const TIER_MUTATORS = {
  1: ["INT_OFF_BY_ONE", "BOOL_FLIP", "SEP_SWAP", "CASE_PUNCT"],
  2: ["INT_OFF_BY_ONE", "BOOL_FLIP", "SEP_SWAP", "CASE_PUNCT", "INT_SCALE", "NUM_FORM", "BRACKET_FORM", "RUN_SHIFT", "LIST_TRIM"],
  3: Object.keys(MUTATORS),
};

// --- assembly --------------------------------------------------------------

const stripWs = (s) => s.replace(/\s+/g, "");

/**
 * A candidate is usable only if it is genuinely different from the answer and
 * from the other choices. Everything is compared AFTER norm(), and the caller
 * stores the normalized form, so what is rendered is byte-identical to what is
 * compared — otherwise "5" and "5\n" render the same and one is scored wrong.
 */
export function accept(candidate, correctNorm, chosen) {
  if (candidate == null) return false;
  const c = norm(candidate);
  if (!c) return false;
  if (c === correctNorm) return false;
  if (chosen.has(c)) return false;
  // Whitespace-only differences are invisible unless rendered in a <pre>.
  if (stripWs(c) === stripWs(correctNorm)) return false;
  return true;
}

/** Rejects choice sets where the answer is identifiable by shape alone. */
export function passesShapeRules(choices, correct) {
  const lineCounts = choices.map((c) => c.split("\n").length);
  const correctLines = correct.split("\n").length;
  const differing = lineCounts.filter((n) => n !== correctLines).length;
  // Either everything matches the answer's line count, or at least two choices
  // differ — otherwise "the odd one out" is the answer.
  if (differing !== 0 && differing < 2) return false;

  const lens = choices.map((c) => c.length);
  if (Math.max(...lens) > 3 * Math.min(...lens)) return false;

  for (const a of choices) {
    for (const b of choices) {
      if (a !== b && (a.startsWith(b) || a.endsWith(b))) return false;
    }
  }

  // If the answer is the only choice containing a signal character, that
  // character gives it away.
  for (const ch of ["[", "(", "{", "'", '"', ".", ",", ":"]) {
    const holders = choices.filter((c) => c.includes(ch));
    if (holders.length === 1 && holders[0] === correct) return false;
  }
  return true;
}

/**
 * Builds one round. Returns null if no valid set could be assembled, in which
 * case the caller should retry with a different seed.
 */
export function generateRound(pool, seed, tier = 2) {
  const rng = mulberry32(seed);
  const tiered = pool.filter((l) => (tier >= 3 ? true : l.difficulty <= tier && l.srcLines <= (tier === 1 ? 6 : 12)));
  const usable = tiered.length ? tiered : pool;
  if (!usable.length) return null;

  // Borrowing must be keyed by the normalized string: 67 outputs repeat across
  // levels, so "another level's output" can otherwise BE the answer.
  const byOutput = new Map();
  for (const l of usable) {
    if (!byOutput.has(l.exp)) byOutput.set(l.exp, l);
  }

  for (let attempt = 0; attempt < 25; attempt++) {
    const level = pick(rng, usable);
    const correct = level.exp;
    const chosen = new Set([correct]);
    const distractors = [];

    // Tier A — typed mutations of the correct answer.
    for (const name of shuffle(rng, TIER_MUTATORS[tier] || TIER_MUTATORS[3])) {
      if (distractors.length === 3) break;
      let candidate;
      try {
        candidate = MUTATORS[name](correct, rng);
      } catch { candidate = null; }
      if (accept(candidate, correct, chosen)) {
        const c = norm(candidate);
        chosen.add(c);
        distractors.push(c);
      }
    }

    // Tier B — borrow a same-shape output from another level.
    if (distractors.length < 3) {
      const sameShape = [...byOutput.values()].filter((l) => l.sig === level.sig && l.exp !== correct);
      for (const other of shuffle(rng, sameShape)) {
        if (distractors.length === 3) break;
        if (accept(other.exp, correct, chosen)) {
          chosen.add(other.exp);
          distractors.push(other.exp);
        }
      }
    }

    if (distractors.length < 3) continue;

    const choices = shuffle(rng, [correct, ...distractors]);
    if (!passesShapeRules(choices, correct)) continue;

    return {
      source: level.src,
      choices,
      answerIndex: choices.indexOf(correct),
      levelName: level.name,
      trackSlug: level.slug,
      tier,
      seed,
    };
  }
  return null;
}
