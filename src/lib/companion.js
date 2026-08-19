// What the companion says, given the code actually in the editor.
//
// Kept as a pure function of (level, code, step) with no DOM and no React, for
// the same reason levelSource.js is: it is the interesting half of the feature,
// and a rule that decides what a student is told deserves tests that run it
// rather than a component snapshot that renders it.
//
// The rules are a ladder, most specific first. That ordering is the whole
// design: someone who has written nothing needs a different sentence from
// someone whose code will not parse, who needs a different sentence again from
// someone whose code runs but ignores what the level asked for.
//
// Voice is deliberately casual, the way a friend sitting next to you would say
// it. The one exception is `checks.failMessage`, which is the level author's own
// sentence and is passed through untouched.
//
// It never reads `level.solution`. A hint that quotes the answer is not a hint,
// and the whole level object is in scope here, so that is worth stating.

import { python } from "@codemirror/lang-python";
import { compilePattern } from "../utils/structureValidator";

const pythonParser = python().language.parser;

/**
 * The same seven things to say, in three registers.
 *
 * Only the companion's own sentences live here. `checks.failMessage` is the
 * level author's writing and is passed through in every tone, because rewording
 * someone else's teaching to sound chatty would change what it teaches.
 *
 * Kept as one table rather than scattered conditionals so that adding a tone is
 * adding a column, and so a missing line in a new tone is obvious on sight.
 */
export const TONES = ["formal", "normal", "casual"];

export const DEFAULT_TONE = "casual";

const VOICE = {
  formal: {
    idle: "Select a level and assistance will be provided.",
    blank: "No code has been written yet. Review the objective and begin with its first requirement.",
    syntax: (line) => `There is a syntax error near line ${line}. Check for an unclosed bracket or quote, or a missing colon.`,
    missing: "A construct this level requires is not present. Review the objective.",
    forbidden: "This level does not permit one of the constructs in your code. Review the objective.",
    ready: "This appears to satisfy the objective. Submit it to run the checks.",
    stuck: "No further issues can be identified from here. The Hint tab contains the full explanation.",
    more: "Select again for further detail.",
    done: "No further detail is available.",
  },
  normal: {
    idle: "Open a level and I can help.",
    blank: "Nothing written yet. Read the objective and start with the first thing it asks for.",
    syntax: (line) => `There is a problem around line ${line}. Check for a missing bracket, quote or colon.`,
    missing: "You are not using what this level is about yet. Check the objective again.",
    forbidden: "Something in your code is not allowed here. Check the objective again.",
    ready: "That looks like what the level asked for. Press Submit to check it.",
    stuck: "That is all I can spot. The Hint tab has the full explanation.",
    more: "Click again for more.",
    done: "That is everything I have.",
  },
  casual: {
    idle: "Open up a level and I will give you a hand.",
    blank: "Nothing here yet. Have a read of the objective and just write the first bit it asks for.",
    syntax: (line) => `Something looks off around line ${line}. Worth checking for a missing bracket, quote or colon.`,
    missing: "You are not using the thing this level is really about yet. Give the objective another look.",
    forbidden: "There is something in there this level does not want you to use. Give the objective another look.",
    ready: "Looks like what the level asked for. Hit Submit and see what the checks say.",
    stuck: "That is all I have got on this one. The Hint tab has the full write-up if you want it.",
    more: "Poke me again if you want more.",
    done: "That is all I have got on this one.",
  },
};

/** The voice table for `tone`, falling back rather than throwing on a bad value. */
export function voiceFor(tone) {
  return VOICE[tone] ?? VOICE[DEFAULT_TONE];
}

/** Character offset of the first parse error, or null when the code parses. */
export function firstSyntaxError(code) {
  let earliest = null;
  pythonParser.parse(code).iterate({
    enter: (node) => {
      if (!node.type.isError) return;
      if (earliest === null || node.from < earliest) earliest = node.from;
    },
  });
  return earliest;
}

/** 1-based line number containing `offset`. */
export function lineOf(code, offset) {
  return code.slice(0, offset).split("\n").length;
}

// Comment-only starters ("# Write your code here") are not work, so someone
// staring at one should be told how to begin rather than congratulated.
function isUntouched(code, startingCode) {
  const meaningful = (s) =>
    String(s ?? "")
      .replace(/^\s*(#|\/\/|--|<!--).*$/gm, "")
      .trim();
  const written = meaningful(code);
  if (!written) return true;
  return written === meaningful(startingCode);
}

/**
 * Levels whose source is not Python. Their grammars disagree with Python's, so
 * parsing their code as Python would invent errors that are not there.
 */
function isPythonLevel(level) {
  return !level?.web && !level?.sql && !level?.game;
}

const asList = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

/** Safe `test`: an unparseable pattern grades nothing rather than throwing. */
function matches(pattern, code) {
  try {
    return compilePattern(pattern).test(code);
  } catch {
    return null;
  }
}

/**
 * The most specific thing wrong with `code` right now, or null when this module
 * cannot find anything. Split out from the stepping below so the ladder itself
 * stays readable and testable on its own.
 */
function situation(level, code, voice) {
  if (isUntouched(code, level.startingCode)) {
    return { kind: "blank", text: voice.blank };
  }

  // Nothing else is worth saying while the code will not parse, because every
  // later check would be reading broken code.
  if (isPythonLevel(level)) {
    const at = firstSyntaxError(code);
    if (at !== null) {
      return { kind: "syntax", text: voice.syntax(lineOf(code, at)) };
    }
  }

  // A construct the level requires is absent, or a banned one is present. The
  // level already carries a sentence for exactly this, so use its words rather
  // than describing a regex to a beginner. Note that this one sentence is NOT
  // retoned: it is the author's teaching, not the companion's chatter.
  const checks = level.sourceChecks;
  if (checks) {
    const missing = asList(checks.contains).some((p) => matches(p, code) === false);
    const banned = asList(checks.absent).some((p) => matches(p, code) === true);
    if (missing || banned) {
      return {
        kind: missing ? "missing" : "forbidden",
        text: checks.failMessage ?? (missing ? voice.missing : voice.forbidden),
      };
    }
  }

  return null;
}

/**
 * Picks what the companion should say next.
 *
 * `step` counts clicks since the code last changed, so asking twice gets you
 * something new rather than the same sentence again: first what looks wrong,
 * then the level's own hint, then an admission that this is as far as it can
 * see. Any edit resets it, because the situation may have changed entirely.
 *
 * Returns `{ kind, text?, rich? }`. `rich` is the level's parsed hint, a block
 * list meant for the RichText component. `text` is a plain sentence this module
 * wrote. Exactly one of them is set.
 */
export function companionHint({ level, code = "", step = 0, tone = DEFAULT_TONE } = {}) {
  const voice = voiceFor(tone);
  if (!level) return { kind: "idle", text: voice.idle, more: voice.done };

  // One authored hint per level: `hint:` is a single string in the YAML, and
  // parseRichText turns it into the block list RichText renders. Passing one
  // block instead of the list is what crashed this the first time round.
  const authored = Array.isArray(level.hint) && level.hint.length ? level.hint : null;

  const now = situation(level, code, voice);
  const rungs = [];
  if (now) rungs.push(now);
  if (authored) rungs.push({ kind: "authored", rich: authored });

  // Everything this module can check is satisfied, or it has run out of things
  // to say. Either way, say so plainly rather than inventing a problem: the
  // grader is the authority on correctness, and pretending otherwise would send
  // someone hunting for a bug that is not there.
  const last = now
    ? { kind: "stuck", text: voice.stuck }
    : { kind: "ready", text: voice.ready };

  const rung = step < rungs.length ? rungs[step] : last;
  // The footer under the bubble: whether there is another rung to reach for.
  return { ...rung, more: step < rungs.length - 1 ? voice.more : voice.done };
}
