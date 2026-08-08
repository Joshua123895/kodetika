import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { JSDOM } from "jsdom";
import { runAssertions, buildDocument, isGradableStyle } from "../src/data/webAssert.js";
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

// The track ships in tracks-draft/ until an icon exists for it (see the header
// of the YAML). Look in both places so this suite keeps working, unchanged, the
// moment it is activated.
const CANDIDATES = [
  join(ROOT, "src/data/tracks/web1.yaml"),
  join(ROOT, "src/data/tracks-draft/web1.yaml"),
];
const yamlPath = CANDIDATES.find(existsSync);

const track = load(readFileSync(yamlPath, "utf8"));

const levels = [];
for (const chapter of track.chapters ?? []) {
  for (const level of chapter.levels ?? []) {
    levels.push({ chapter: chapter.name, level });
  }
}

function render(html) {
  const doc = buildDocument({ "index.html": html });
  const dom = new JSDOM(doc, { runScripts: "dangerously" });
  return dom;
}

function check(html, expectations) {
  const dom = render(html);
  try {
    return runAssertions(dom.window.document, expectations, dom.window);
  } finally {
    dom.window.close();
  }
}

describe(`Web Development (${yamlPath.includes("draft") ? "draft" : "live"})`, () => {
  it("has levels to check", () => {
    expect(levels.length).toBeGreaterThan(0);
  });

  for (const { chapter, level } of levels) {
    describe(chapter, () => {
      it(`${level.name}: the official solution passes its own checks`, () => {
        const result = check(dedent(level.sol ?? ""), level.expect);
        expect(result.failures).toEqual([]);
      });

      // A level whose starter already satisfies the checks asks the student to
      // do nothing, and would hand out three stars for pressing Submit.
      it(`${level.name}: the starter does not already pass`, () => {
        const result = check(dedent(level.start ?? ""), level.expect);
        expect(result.passed).toBe(false);
      });

      // Same invariant tests/starBudgets.test.js enforces on the Python tracks.
      // Checked here too because a draft track is not in the directory that
      // audit globs, and activating it should never introduce a broken budget.
      it(`${level.name}: the line budget is reachable`, () => {
        const needed = countLines(dedent(level.sol ?? ""));
        const budget = parseInt(String(level.max).split("/")[0], 10);
        expect(budget).toBeGreaterThanOrEqual(needed);
      });

      it(`${level.name}: declares assertions`, () => {
        expect(Array.isArray(level.expect) && level.expect.length).toBeTruthy();
        for (const rule of level.expect) expect(rule.sel).toBeTruthy();
      });

      // The trap this closes: these tests grade in jsdom, students grade in a
      // browser, and for a handful of properties the two compute different
      // strings from the same stylesheet. A level asserting on one of them
      // passes here and fails the student — silently, and only for them. See
      // UNGRADABLE_STYLE_PROPS for what each one does and what to use instead.
      it(`${level.name}: styles it asserts grade the same in a browser`, () => {
        for (const rule of level.expect) {
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
