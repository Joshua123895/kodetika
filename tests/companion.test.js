import { describe, it, expect } from "vitest";
import { companionHint, firstSyntaxError, lineOf, TONES, DEFAULT_TONE, voiceFor } from "../src/lib/companion.js";
import { parseRichText } from "../src/data/richText.js";

// The companion decides what a stuck student is told, so the ladder it walks is
// worth testing directly rather than through a rendered component.
//
// `hint` is built with the real parseRichText rather than a hand-written stand
// in. The first version of these tests used plain strings, which let a wrong
// assumption pass: a level has ONE hint, parsed into a block LIST, and the
// component that renders it calls .map on that list. Faking the shape hid a
// crash that a real level triggered immediately.

const level = (over = {}) => ({
  startingCode: "# Write your code here\n",
  hint: parseRichText("Try: `print(\"Hello\")`"),
  ...over,
});

describe("firstSyntaxError", () => {
  it("returns null for code that parses", () => {
    expect(firstSyntaxError("x = 1\nprint(x)\n")).toBeNull();
  });

  it("finds a stray token", () => {
    expect(firstSyntaxError("x = = 1")).toBeGreaterThan(0);
  });

  it("reports the earliest error, not whichever the walk reached first", () => {
    const code = "a = = 1\nb = = 2";
    expect(lineOf(code, firstSyntaxError(code))).toBe(1);
  });

  it("flags a block opener with no body, which is what `try:` alone is", () => {
    expect(firstSyntaxError("try:")).not.toBeNull();
  });
});

describe("the hint ladder", () => {
  it("hands back the hint as the block list RichText expects", () => {
    const r = companionHint({ level: level(), code: "x = 1\n", step: 0 });
    // The situation is clean here, so rung 0 is the authored hint itself.
    expect(Array.isArray(r.rich)).toBe(true);
    expect(r.rich.length).toBeGreaterThan(0);
  });

  it("treats a comment-only starter as untouched", () => {
    const r = companionHint({ level: level(), code: "# Write your code here\n" });
    expect(r.kind).toBe("blank");
  });

  it("treats an empty editor as untouched", () => {
    expect(companionHint({ level: level(), code: "   \n" }).kind).toBe("blank");
  });

  it("reports a syntax error with its line number", () => {
    const r = companionHint({ level: level(), code: "x = 1\ny = = 2\n" });
    expect(r.kind).toBe("syntax");
    expect(r.text).toContain("line 2");
  });

  it("puts the syntax error ahead of a missing construct", () => {
    // Both are true; only the parse failure should be reported, because every
    // other check would be reading broken code.
    const r = companionHint({
      level: level({ sourceChecks: { contains: ["print"], failMessage: "Use print." } }),
      code: "x = = 1",
    });
    expect(r.kind).toBe("syntax");
  });

  it("uses the level's own message when a required construct is missing", () => {
    const r = companionHint({
      level: level({ sourceChecks: { contains: ["\\bprint\\("], failMessage: "Use `print()` here." } }),
      code: "x = 1\n",
    });
    expect(r.kind).toBe("missing");
    expect(r.text).toBe("Use `print()` here.");
  });

  it("catches a banned construct too", () => {
    const r = companionHint({
      level: level({ sourceChecks: { absent: ["while True"], failMessage: "No infinite loops." } }),
      code: "while True:\n    pass\n",
    });
    expect(r.kind).toBe("forbidden");
    expect(r.text).toBe("No infinite loops.");
  });

  it("survives a level whose pattern is not a valid regex", () => {
    // `redirect(` shipped exactly like this. An invalid pattern must not throw
    // in front of a student, and must not be reported as missing either.
    const r = companionHint({
      level: level({ sourceChecks: { contains: ["redirect("] } }),
      code: "x = 1\n",
    });
    expect(r.kind).not.toBe("missing");
  });

  it("gives the authored hint on the second click, after saying what looks wrong", () => {
    const code = "# Write your code here\n";
    expect(companionHint({ level: level(), code, step: 0 }).kind).toBe("blank");
    expect(companionHint({ level: level(), code, step: 1 }).kind).toBe("authored");
  });

  it("admits it is out of ideas rather than looping back to the start", () => {
    const code = "# Write your code here\n";
    expect(companionHint({ level: level(), code, step: 2 }).kind).toBe("stuck");
  });

  it("says the code looks right when nothing is wrong and the hint is spent", () => {
    const r = companionHint({ level: level(), code: "x = 1\n", step: 1 });
    expect(r.kind).toBe("ready");
  });

  it("copes with a level that has no hint at all", () => {
    const r = companionHint({ level: level({ hint: undefined }), code: "x = 1\n", step: 0 });
    expect(r.kind).toBe("ready");
    expect(r.rich).toBeUndefined();
  });

  it("never parses a web or sql level as Python", () => {
    // `<h1>Hi</h1>` is not Python, and reporting it as a syntax error would be
    // the companion inventing a problem the student does not have.
    for (const over of [{ web: true }, { sql: true }]) {
      const r = companionHint({ level: level(over), code: "<h1>Hi</h1>" });
      expect(r.kind).not.toBe("syntax");
    }
  });

  it("says something sensible with no level at all", () => {
    expect(companionHint({}).kind).toBe("idle");
    expect(companionHint().kind).toBe("idle");
  });

  it("never quotes the solution", () => {
    const secret = "print('the answer')";
    const r = companionHint({ level: level({ solution: secret }), code: "x = 1\n", step: 9 });
    expect(JSON.stringify(r)).not.toContain("the answer");
  });

  it("only ever sets one of text or rich, which is what the component branches on", () => {
    const cases = [
      { code: "", step: 0 },
      { code: "x = = 1", step: 0 },
      { code: "x = 1\n", step: 0 },
      { code: "x = 1\n", step: 5 },
    ];
    for (const c of cases) {
      const r = companionHint({ level: level(), ...c });
      expect(Boolean(r.text) !== Boolean(r.rich), JSON.stringify(r)).toBe(true);
    }
  });
});

describe("tone", () => {
  const KEYS = ["idle", "blank", "syntax", "missing", "forbidden", "ready", "stuck", "more", "done"];

  it("every tone answers every situation", () => {
    // A missing line would fall through as undefined and render as an empty
    // bubble, which is worse than the wrong register.
    for (const t of TONES) {
      for (const key of KEYS) {
        expect(voiceFor(t)[key], `${t}.${key}`).toBeTruthy();
      }
    }
  });

  it("the tones actually differ, so the setting does something", () => {
    const said = TONES.map((t) => voiceFor(t).ready);
    expect(new Set(said).size).toBe(TONES.length);
  });

  it("phrases the same situation differently per tone", () => {
    const code = "x = = 1";
    const texts = TONES.map((t) => companionHint({ level: level(), code, tone: t }).text);
    // Same rung in each case...
    for (const t of TONES) expect(companionHint({ level: level(), code, tone: t }).kind).toBe("syntax");
    // ...and every one still names the line, whatever the register.
    for (const text of texts) expect(text).toContain("line 1");
    expect(new Set(texts).size).toBe(TONES.length);
  });

  it("falls back to the default rather than breaking on an unknown tone", () => {
    const r = companionHint({ level: level(), code: "x = 1\n", step: 1, tone: "piratespeak" });
    expect(r.text).toBe(voiceFor(DEFAULT_TONE).ready);
  });

  it("never retones the level author's own message", () => {
    // checks.failMessage is teaching, not chatter. It must survive every tone
    // byte for byte.
    const lvl = level({ sourceChecks: { contains: ["print"], failMessage: "Use `print()` here." } });
    for (const t of TONES) {
      expect(companionHint({ level: lvl, code: "x = 1\n", tone: t }).text).toBe("Use `print()` here.");
    }
  });

  it("labels the footer as more-available or not", () => {
    const lvl = level();
    // Rung 0 of 2 has another to reach for; the last one does not.
    expect(companionHint({ level: lvl, code: "", step: 0 }).more).toBe(voiceFor(DEFAULT_TONE).more);
    expect(companionHint({ level: lvl, code: "", step: 1 }).more).toBe(voiceFor(DEFAULT_TONE).done);
  });
});
