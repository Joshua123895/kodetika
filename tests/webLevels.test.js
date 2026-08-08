import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { JSDOM } from "jsdom";
import { runAssertions, buildDocument, isGradableStyle, CONSOLE_CAPTURE, CONSOLE_RENDERER } from "../src/data/webAssert.js";
import { checkOutput } from "../src/utils/outputMatcher.js";
import { dedent } from "../src/data/levelSource.js";
import { countLines } from "./starBudgets.audit.js";

// The web track's equivalent of tests/levels.test.js: every level's own `sol`
// is rendered and checked against that level's own `expect:` block. The rule is
// the same one the README states for Python — never hand-write the answer.
// There, CPython is the authority; here it is a real DOM.
//
// jsdom, not a browser, so the caveat is worth stating plainly: there is no
// layout engine. Structure, text, attributes and declared style properties are
// all real; anything that depends on boxes actually being laid out (widths,
// positions, "is it centred") is not, and levels must not assert on it.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRACK_DIR = join(ROOT, "src/data/tracks");

// Every web track, not just the first: HTML & CSS and JavaScript are separate
// tracks that share this one runtime, and a new webN.yaml is picked up here with
// no edit to this file.
const yamlPaths = readdirSync(TRACK_DIR)
  .filter((f) => /^web\d+\.yaml$/.test(f))
  .sort()
  .map((f) => join(TRACK_DIR, f));

const levels = [];
for (const path of yamlPaths) {
  const track = load(readFileSync(path, "utf8"));
  for (const chapter of track.chapters ?? []) {
    for (const level of chapter.levels ?? []) {
      // The non-Python tracks share a file prefix but not a runtime. A `sql:`
      // level has no document to render and no `expect:` block; it is graded
      // against a real SQLite in tests/sqlLevels.test.js, which splits the
      // corpus the same way the app does — on the level, not on the filename.
      if (level.sql) continue;
      levels.push({ track: track.name, chapter: chapter.name, level });
    }
  }
}

// A `web: js` level's editor holds a script rather than a document, exactly as
// LevelPage feeds it — the file map here has to match, or the suite would be
// grading something the student never submits.
// A DOM level (`web: js` plus a `page:`) puts the level's own markup in
// index.html and the student's script beside it, which is exactly what
// LevelPage's webFiles does.
const filesFor = (level, source) =>
  level.web === "js"
    ? { "index.html": level.page ?? "", "script.js": source }
    : { "index.html": source };

function render(level, source) {
  const doc = buildDocument(filesFor(level, source), { captureConsole: level.web === "js" });
  return new JSDOM(doc, { runScripts: "dangerously" });
}

/** Grades a level's source exactly as the browser runner does, `act:` included. */
function checkLevel(level, source) {
  const dom = render(level, source);
  try {
    return runAssertions(dom.window.document, level.expect, dom.window, level.act);
  } finally {
    dom.window.close();
  }
}

function check(html, expectations, actions) {
  const dom = render({ web: true }, html);
  try {
    return runAssertions(dom.window.document, expectations, dom.window, actions);
  } finally {
    dom.window.close();
  }
}

/** What a JavaScript level's source actually printed, joined as the runner does. */
function printed(level, source) {
  const dom = render(level, source);
  try {
    return (dom.window.__webLevelOutput || []).join("\n");
  } finally {
    dom.window.close();
  }
}

describe("Web tracks", () => {
  it("has levels to check", () => {
    expect(levels.length).toBeGreaterThan(0);
  });

  for (const { track, chapter, level } of levels) {
    describe(`${track} / ${chapter}`, () => {
      it(`${level.name}: the official solution passes its own checks`, () => {
        if (level.expect) {
          const result = checkLevel(level, dedent(level.sol ?? ""));
          expect(result.failures).toEqual([]);
        }
        // The web track's version of running every Python `sol` through CPython:
        // the declared output is never hand-written, it is what the solution
        // actually prints when executed.
        for (const test of level.tests ?? []) {
          const out = printed(level, dedent(level.sol ?? ""));
          expect(checkOutput(out, { expected: test.exp }), `printed:\n${out}`).toBe(true);
        }
      });

      // A level whose starter already satisfies the checks asks the student to
      // do nothing, and would hand out three stars for pressing Submit.
      it(`${level.name}: the starter does not already pass`, () => {
        const start = dedent(level.start ?? "");
        if (level.expect) {
          expect(checkLevel(level, start).passed).toBe(false);
        }
        for (const test of level.tests ?? []) {
          expect(checkOutput(printed(level, start), { expected: test.exp })).toBe(false);
        }
      });

      // Same invariant tests/starBudgets.test.js enforces on the Python tracks.
      // Checked here too because a draft track is not in the directory that
      // audit globs, and activating it should never introduce a broken budget.
      it(`${level.name}: the line budget is reachable`, () => {
        const needed = countLines(dedent(level.sol ?? ""));
        const budget = parseInt(String(level.max).split("/")[0], 10);
        expect(budget).toBeGreaterThanOrEqual(needed);
      });

      // Either kind of check counts, but a level with neither grades nothing and
      // would pass on an empty submission.
      it(`${level.name}: declares assertions`, () => {
        const hasDom = Array.isArray(level.expect) && level.expect.length > 0;
        const hasOutput = Array.isArray(level.tests) && level.tests.length > 0;
        expect(hasDom || hasOutput).toBe(true);
        for (const rule of level.expect ?? []) expect(rule.sel).toBeTruthy();
        for (const test of level.tests ?? []) expect(test.exp).toBeTruthy();
      });

      // A DOM level asserts on markup the student never types, so that markup has
      // to exist. Without a `page:` the assertions would run against an empty
      // document and no answer could ever pass.
      it(`${level.name}: a JavaScript level with DOM assertions supplies a page`, () => {
        if (level.web === "js" && level.expect) expect(level.page, "needs a `page:` fixture").toBeTruthy();
      });

      // An `act:` step naming an element the page does not contain fails every
      // student with a message about the level, not about their code.
      it(`${level.name}: every act: step targets an element the page has`, () => {
        for (const step of level.act ?? []) {
          expect(step.sel, "an act: step needs a `sel`").toBeTruthy();
          const dom = new JSDOM(level.page ?? "");
          expect(dom.window.document.querySelector(step.sel), `\`${step.sel}\` is not on the page`).toBeTruthy();
          dom.window.close();
        }
      });

      // `checks:` on a web level must stay regex-only. The AST forms are
      // implemented by parsing the source with Python's `ast`, so one on a
      // JavaScript level would boot a 20MB interpreter to be told the code is a
      // SyntaxError.
      it(`${level.name}: uses only pattern source-checks`, () => {
        const astKeys = ["cls", "fn", "mth", "inh", "not", "classes", "functions", "methods", "inheritance"];
        for (const key of astKeys) expect(level.checks?.[key]).toBeUndefined();
      });

      // A `has:` pattern that does not match the level's own solution would fail
      // every student including one who wrote the intended answer.
      it(`${level.name}: its own solution satisfies every source-check`, () => {
        const sol = dedent(level.sol ?? "");
        for (const pattern of level.checks?.has ?? []) {
          expect(new RegExp(pattern).test(sol), `\`${pattern}\` does not match the solution`).toBe(true);
        }
        for (const pattern of level.checks?.no ?? []) {
          expect(new RegExp(pattern).test(sol), `\`${pattern}\` wrongly matches the solution`).toBe(false);
        }
      });

      // The trap this closes: these tests grade in jsdom, students grade in a
      // browser, and for a handful of properties the two compute different
      // strings from the same stylesheet. A level asserting on one of them
      // passes here and fails the student — silently, and only for them. See
      // UNGRADABLE_STYLE_PROPS for what each one does and what to use instead.
      it(`${level.name}: styles it asserts grade the same in a browser`, () => {
        for (const rule of level.expect ?? []) {
          for (const [prop, value] of Object.entries(rule.style ?? {})) {
            expect(
              isGradableStyle(prop, value),
              `\`${prop}: ${value}\` does not compute identically in jsdom and Chrome`
            ).toBe(true);
          }
        }
      });
    });
  }
});

describe("the assertion engine", () => {
  it("passes a matching selector and text", () => {
    const r = check("<h1>Hi</h1>", [{ sel: "h1", text: "Hi" }]);
    expect(r.passed).toBe(true);
  });

  it("ignores the whitespace a beginner's indentation adds", () => {
    const r = check("<p>\n   Hello   there\n</p>", [{ sel: "p", text: "Hello there" }]);
    expect(r.passed).toBe(true);
  });

  it("names the missing element rather than reporting a bare count", () => {
    const r = check("<p>x</p>", [{ sel: "h1", text: "Hi" }]);
    expect(r.failures[0]).toContain("`h1`");
  });

  it("enforces an exact count", () => {
    const r = check("<ul><li>a</li><li>b</li></ul>", [{ sel: "li", count: 3 }]);
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toContain("found 2");
  });

  it("checks attributes and reports the wrong value", () => {
    const r = check('<a href="/wrong">go</a>', [{ sel: "a", attr: { href: "/right" } }]);
    expect(r.failures[0]).toContain("/wrong");
  });

  it("reports a missing attribute distinctly from a wrong one", () => {
    const r = check("<img src='a.png'>", [{ sel: "img", attr: { alt: "A cat" } }]);
    expect(r.failures[0]).toContain("missing");
  });

  // The cross-environment trap: jsdom echoes back the keyword you wrote, a
  // browser resolves it to rgb(). A level graded in both has to accept either.
  it("treats a colour keyword, its hex and its rgb() as the same value", () => {
    const a = check("<p style='color: red'>x</p>", [{ sel: "p", style: { color: "rgb(255, 0, 0)" } }]);
    const b = check("<p style='color: #ff0000'>x</p>", [{ sel: "p", style: { color: "red" } }]);
    expect([a.passed, b.passed]).toEqual([true, true]);
  });

  it("uses a level's own msg when one is given", () => {
    const r = check("<p>x</p>", [{ sel: "h1", msg: "Every page needs a title." }]);
    expect(r.failures).toEqual(["Every page needs a title."]);
  });

  // Chrome computes `bold` to 700 and jsdom leaves it a keyword, so without
  // this the same correct answer passes CI and fails the student.
  it("treats font-weight bold and 700 as the same value", () => {
    const a = check("<style>p{font-weight:bold}</style><p>x</p>", [{ sel: "p", style: { "font-weight": "700" } }]);
    const b = check("<style>p{font-weight:700}</style><p>x</p>", [{ sel: "p", style: { "font-weight": "bold" } }]);
    expect([a.passed, b.passed]).toEqual([true, true]);
  });

  it("does not rewrite `normal` outside font-weight", () => {
    const r = check("<style>p{font-style:normal}</style><p>x</p>", [{ sel: "p", style: { "font-style": "400" } }]);
    expect(r.passed).toBe(false);
  });

  it("grades a rule that reached the element through a class selector", () => {
    const r = check("<style>.note{color:#800080}</style><p class=note>x</p>", [
      { sel: "p.note", style: { color: "purple" } },
    ]);
    expect(r.passed).toBe(true);
  });

  it("flags a bad selector as a level error, not a student mistake", () => {
    const r = check("<p>x</p>", [{ sel: "h1[[[", text: "x" }]);
    expect(r.failures[0]).toContain("Level error");
  });

  it("reports every failing rule, not just the first", () => {
    const r = check("<p>x</p>", [{ sel: "h1" }, { sel: "ul" }]);
    expect(r.failures).toHaveLength(2);
  });
});

describe("the cross-environment style guard", () => {
  it("rejects the properties that diverge between jsdom and Chrome", () => {
    expect(isGradableStyle("border", "2px solid black")).toBe(false);
    expect(isGradableStyle("border-width", "2px")).toBe(false);
    expect(isGradableStyle("background", "#eef")).toBe(false);
    expect(isGradableStyle("box-shadow", "0 2px 4px #000000")).toBe(false);
    expect(isGradableStyle("text-decoration", "none")).toBe(false);
  });

  // A browser reports the width the layout engine settled on; jsdom, having no
  // layout engine, can only repeat what was declared. `max-width` is exempt
  // because it is reported as specified in both.
  it("rejects the properties a browser resolves through layout", () => {
    expect(isGradableStyle("width", "50%")).toBe(false);
    expect(isGradableStyle("width", "300px")).toBe(false);
    expect(isGradableStyle("height", "40px")).toBe(false);
    expect(isGradableStyle("max-width", "600px")).toBe(true);
  });

  // jsdom does not expand `gap` into its longhands, so they read `normal` there
  // and `16px` in Chrome. The shorthand itself agrees.
  it("allows gap but not its longhands", () => {
    expect(isGradableStyle("gap", "16px")).toBe(true);
    expect(isGradableStyle("row-gap", "16px")).toBe(false);
    expect(isGradableStyle("column-gap", "16px")).toBe(false);
  });

  it("allows a margin as a length and rejects it as auto", () => {
    expect(isGradableStyle("margin-top", "0px")).toBe(true);
    expect(isGradableStyle("padding-left", "20px")).toBe(true);
    expect(isGradableStyle("margin-left", "auto")).toBe(false);
    expect(isGradableStyle("margin", "0 auto")).toBe(false);
  });

  it("allows line-height with a unit and rejects it without one", () => {
    expect(isGradableStyle("line-height", "28px")).toBe(true);
    expect(isGradableStyle("line-height", "1.6")).toBe(false);
  });

  it("requires colours be written as hex or rgb(), never a keyword", () => {
    expect(isGradableStyle("color", "#008080")).toBe(true);
    expect(isGradableStyle("color", "rgb(0, 128, 128)")).toBe(true);
    expect(isGradableStyle("color", "teal")).toBe(false);
    expect(isGradableStyle("background-color", "crimson")).toBe(false);
  });

  it("leaves everything else alone", () => {
    expect(isGradableStyle("padding-top", "16px")).toBe(true);
    expect(isGradableStyle("text-align", "center")).toBe(true);
  });
});

// These are the rules a student has to be able to predict when they write the
// answer, so they are pinned rather than left to whatever the host console does.
describe("console capture", () => {
  const run = (src) => printed({ web: "js" }, src);

  it("prints a string without quotes", () => {
    expect(run('console.log("hi");')).toBe("hi");
  });

  it("joins several arguments with one space", () => {
    expect(run('console.log("a", 1, true);')).toBe("a 1 true");
  });

  it("prints arrays and objects as JSON", () => {
    expect(run("console.log([1, 2]);")).toBe("[1,2]");
    expect(run('console.log({ a: 1 });')).toBe('{"a":1}');
  });

  it("distinguishes null from undefined", () => {
    expect(run("console.log(null, undefined);")).toBe("null undefined");
  });

  it("keeps one line per call", () => {
    expect(run('console.log("a");\nconsole.log("b");')).toBe("a\nb");
  });

  // The buffer is what grading reads, so a level that prints nothing must come
  // back empty rather than undefined — checkOutput would otherwise compare
  // against the string "undefined".
  it("comes back empty when nothing was printed", () => {
    expect(run("let x = 1;")).toBe("");
  });

  it("does not disturb code that reads console.log back", () => {
    expect(run('const f = console.log; f("via alias");')).toBe("via alias");
  });
});

// The pane a JavaScript level shows instead of a blank page. The regression
// worth guarding is structural: a JS level's page has no markup of its own, so
// every script lands in <head> and a throwing script fires before <body> exists.
// Painting on the spot appended the line directly to <html>, where it rendered
// outside the console's own styling — invisible in the pane, and only for the
// students whose code was broken, which is precisely who needed to see it.
describe("the console pane", () => {
  const paint = async (src) => {
    const doc = CONSOLE_CAPTURE + CONSOLE_RENDERER + buildDocument({ "index.html": "", "script.js": src });
    const dom = new JSDOM(doc, { runScripts: "dangerously" });
    await new Promise((resolve) => {
      if (dom.window.document.readyState === "complete") resolve();
      else dom.window.addEventListener("load", resolve, { once: true });
    });
    const { document: d } = dom.window;
    const result = {
      lines: [...d.body.children].map((el) => `${el.className || "log"}=${el.textContent}`),
      strayUnderHtml: [...d.documentElement.children].filter((el) => el.tagName === "DIV").length,
    };
    dom.window.close();
    return result;
  };

  it("paints each logged line into the body", async () => {
    const { lines, strayUnderHtml } = await paint('console.log("a");\nconsole.log([1, 2]);');
    expect(lines).toEqual(["log=a", "log=[1,2]"]);
    expect(strayUnderHtml).toBe(0);
  });

  it("puts nothing outside the body when a script throws", async () => {
    const { strayUnderHtml } = await paint('console.log("before");\nnope();');
    expect(strayUnderHtml).toBe(0);
  });

  it("still shows what was printed before the throw", async () => {
    const { lines } = await paint('console.log("before");\nnope();');
    expect(lines[0]).toBe("log=before");
  });
});

describe("document assembly", () => {
  it("inlines style.css when the html does not link it", () => {
    const doc = buildDocument({ "index.html": "<p>x</p>", "style.css": "p { color: red }" });
    expect(doc).toContain("<style>");
    expect(doc).toContain("color: red");
  });

  it("does not double-inject a script the student already linked", () => {
    const html = '<body><script src="script.js"></script></body>';
    const doc = buildDocument({ "index.html": html, "script.js": "console.log(1)" });
    expect(doc).not.toContain("console.log(1)");
  });

  it("puts the stylesheet inside head when there is one", () => {
    const doc = buildDocument({ "index.html": "<head></head><body></body>", "style.css": "p{}" });
    expect(doc.indexOf("<style>")).toBeLessThan(doc.indexOf("</head>"));
  });

  it("runs a script that builds the DOM, so JS levels can be graded", () => {
    const r = check("<div id='app'></div><script>document.getElementById('app').textContent='built'</script>", [
      { sel: "#app", text: "built" },
    ]);
    expect(r.passed).toBe(true);
  });
});
