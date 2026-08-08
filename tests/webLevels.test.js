import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { JSDOM } from "jsdom";
import { runAssertions, buildDocument } from "../src/data/webAssert.js";
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

  it("flags a bad selector as a level error, not a student mistake", () => {
    const r = check("<p>x</p>", [{ sel: "h1[[[", text: "x" }]);
    expect(r.failures[0]).toContain("Level error");
  });

  it("reports every failing rule, not just the first", () => {
    const r = check("<p>x</p>", [{ sel: "h1" }, { sel: "ul" }]);
    expect(r.failures).toHaveLength(2);
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
