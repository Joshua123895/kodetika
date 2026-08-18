import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import { TRACKS } from "../src/data/tracks.js";
import { withDriver, splitProbe } from "../src/data/levelSource.js";
import { pageFrom, isFullstackLevel, parseRender } from "../src/backend/fullstack.js";
import { runAssertions, buildDocument, isGradableStyle } from "../src/data/webAssert.js";
import { checkOutput } from "../src/utils/outputMatcher.js";
import { compilePattern } from "../src/utils/structureValidator.js";
import { runPyodide, miniwebFiles } from "./pyodideRunner.js";

// Every level in the Web Developer track, run for real and graded the way the
// app grades it: the student's Python answers the level's `req:` list, one of
// those responses is rendered as a page, and the level's `expect:` assertions
// run against that page's DOM.
//
// This is the only suite where both engines meet, so it is also the only place
// that can catch them disagreeing. It deliberately re-implements nothing: the
// composition comes from levelSource, the page comes from fullstack.js and the
// verdict comes from webAssert — the same three modules the browser uses.

const LEVELS = [];
for (const track of TRACKS) {
  for (const chapter of track.chapters || []) {
    for (const level of chapter.levels || []) {
      if (isFullstackLevel(level)) LEVELS.push({ track: track.name, chapter: chapter.name, level });
    }
  }
}

let libs;
beforeAll(async () => {
  libs = miniwebFiles();
});

/** Runs a level's source and returns the page it served, plus the console head. */
async function serve(level, source) {
  const composed = withDriver(level, source, { probe: true });
  const { stdout } = await runPyodide(composed, libs);
  const { output, responses } = splitProbe(stdout);
  return { output, responses, page: pageFrom(level, responses) };
}

/** Renders a page with the fetch bridge installed and checks it, as the app does. */
async function grade(page, level) {
  const dom = new JSDOM(buildDocument({ "index.html": page.html }, { prelude: page.prelude }), {
    runScripts: "dangerously",
  });
  const { window } = dom;
  try {
    if (typeof window.__fetchIdle === "function") await window.__fetchIdle();
    await new Promise((r) => setTimeout(r, 0));
    return runAssertions(window.document, level.expect, window, level.act);
  } finally {
    window.close();
  }
}

describe("Web Developer levels", () => {
  it("has levels to check", () => {
    expect(LEVELS.length).toBeGreaterThan(0);
  });

  for (const { chapter, level } of LEVELS) {
    const label = `${chapter} / ${level.name}`;

    it(`${label}: the solution serves a page that passes`, async () => {
      const { page, output } = await serve(level, level.solution);
      // A traceback lands in the console head, and "no h1 on the page" would be
      // a useless way to report a NameError. Surface the real thing.
      expect(page.error ? `${page.error}\n${output}` : null).toBeNull();
      const result = await grade(page, level);
      expect(result.failures).toEqual([]);
      for (const test of level.tests ?? []) {
        expect(checkOutput(output, test), `transcript did not match:\n${output}`).toBe(true);
      }
    }, 30000);

    it(`${label}: the starter does not already pass`, async () => {
      const { page, output } = await serve(level, level.startingCode ?? "");
      if (page.error) return; // A starter that serves nothing is a fair failure.
      const domPassed = (await grade(page, level)).passed;
      // Both halves, exactly as the app checks them: a level whose subject is a
      // status code is only failed by the transcript, and one whose subject is
      // markup is only failed by the DOM.
      const transcriptPassed = (level.tests ?? []).every((t) => checkOutput(output, t));
      expect(domPassed && transcriptPassed).toBe(false);
    }, 30000);

    it(`${label}: is declared correctly`, () => {
      // `render:` has to name a request the driver actually issues, or the level
      // is graded on a page that was never asked for.
      const { method, path } = parseRender(level.render);
      const issued = (level.req || []).map((r) =>
        typeof r === "string" ? r.trim() : `${(r.m || "GET").toUpperCase()} ${r.p}`
      );
      expect(issued).toContain(`${method} ${path}`);

      // The same computed-style traps the HTML track documents apply here — the
      // page is graded in jsdom in CI and in Chrome for the student.
      for (const rule of level.expect) {
        for (const [prop, value] of Object.entries(rule.style || {})) {
          expect(isGradableStyle(prop, value), `${label}: \`${prop}: ${value}\` grades differently in jsdom and Chrome`).toBe(true);
        }
      }
    });

    // `checks.has`/`checks.no` land as `contains`/`absent` after parseChecks.
    // Asserted against the level's own solution, because a check the reference
    // answer fails is a check no student can pass.
    // Compiled as regexes, not compared as substrings, because that is what
    // validateStructure does to them at grading time (PRD 4.4: `has:` / `no:`
    // are patterns). A substring comparison here quietly disagrees with the app
    // for any pattern containing a metacharacter: `redirect\(` is a correct
    // pattern that is not a literal substring of anything, while `redirect(` is
    // a literal substring that throws when compiled and is then skipped, so the
    // check silently grades nothing. Matching the app's semantics is what keeps
    // this suite and tests/backendLevels.test.js from asking for opposite things.
    if (level.sourceChecks?.contains) {
      it(`${label}: its own solution satisfies checks.has`, () => {
        for (const pattern of level.sourceChecks.contains) {
          expect(compilePattern(pattern).test(level.solution), `\`${pattern}\` does not match the solution`).toBe(true);
        }
      });
    }

    if (level.sourceChecks?.absent) {
      it(`${label}: its own solution satisfies checks.no`, () => {
        for (const pattern of level.sourceChecks.absent) {
          expect(compilePattern(pattern).test(level.solution), `\`${pattern}\` wrongly matches the solution`).toBe(false);
        }
      });
    }
  }
});
