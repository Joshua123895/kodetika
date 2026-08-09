import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fetchShimScript } from "../src/backend/fetchShim.js";

// A guard for the two scripts this codebase writes as template literals and
// injects into an iframe — the runner in webRuntime.js and the fetch bridge in
// fetchShim.js.
//
// Neither can be executed in CI. jsdom does not run (or even parse) an iframe's
// `srcdoc`, so every web, SQL and full-stack suite instead calls `runAssertions`
// on a document it built itself. That leaves the generated script text checked
// by nothing, and a break there fails *every* level identically, with a timeout
// message that reads like the student's fault.
//
// The specific way it breaks: a backtick anywhere inside the template ends it,
// and the halves either side stay valid JavaScript — `const runner = A < B` is a
// boolean. Build, lint and every other test pass while the app grades nothing.
// It has happened twice, once from a comment that quoted `<` in backticks.

/** The text between a template literal's opening and its documented last line. */
function templateBody(source, open, close) {
  const from = source.indexOf(open);
  expect(from, `could not find the start of the template: ${open}`).toBeGreaterThan(-1);
  const to = source.indexOf(close, from);
  expect(to, `could not find the end of the template: ${close}`).toBeGreaterThan(from);
  return source.slice(from + open.length, to);
}

const CASES = [
  {
    file: "src/web/webRuntime.js",
    open: "const runner = `",
    close: "</script>`;",
    // Proves the slice really is the runner and not some shorter accident.
    must: ["parent.postMessage", "__fetchIdle"],
  },
  {
    file: "src/backend/fetchShim.js",
    open: "return `<script>",
    close: "</script>\n`;",
    must: ["window.fetch", "window.__fetchIdle"],
  },
];

describe("injected script templates", () => {
  for (const { file, open, close, must } of CASES) {
    it(`${file}: the injected script contains no backtick`, () => {
      const body = templateBody(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), open, close);
      for (const needle of must) expect(body).toContain(needle);
      expect(body.includes("`"), "a backtick here ends the template early and silently").toBe(false);
    });
  }

  // The half that can be checked for real: the shim is a plain function of its
  // table, so its output is inspectable without a browser.
  it("fetchShimScript emits one complete script element", () => {
    const out = fetchShimScript({ "GET /x": { s: 200, r: "OK", h: {}, b: "hi" } });
    expect(out.startsWith("<script>")).toBe(true);
    expect(out.trimEnd().endsWith("</script>")).toBe(true);
    // One opening tag and one closing tag: the table's own bodies are escaped,
    // so a page carrying a script of its own cannot close this element early.
    expect(out.split("<script").length - 1).toBe(1);
    expect(out.split("</script").length - 1).toBe(1);
  });
});
