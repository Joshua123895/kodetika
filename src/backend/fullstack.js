// Joining the two graders.
//
// A full-stack level is a backend level whose verdict comes from a DOM instead
// of from stdout. The student writes Python; their app answers the level's
// `req:` list exactly as it does in the backend tracks; one of those responses
// is the page, and the rest are what the page's own script may fetch. The page
// is then rendered and checked with the same `expect:` assertions the HTML and
// JavaScript tracks use.
//
// Nothing here runs anything. It is the pure part — payload in, page and route
// table out — so that the browser (Pyodide + sandboxed iframe) and CI (real
// CPython + jsdom) can share every decision except how they execute. Same
// reason `levelSource.js` and `webAssert.js` are shaped this way.

import { routeTable, fetchShimScript } from "./fetchShim";

/** Case-insensitive header lookup, the same rule the `browser` tab uses. */
function headerOf(headers, name) {
  const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

/**
 * True for a level graded on the page its own Python served.
 *
 * Both halves are required: `render:` alone would leave nothing to check, and
 * `expect:` alone is an ordinary web level where the student writes the HTML.
 */
export function isFullstackLevel(level) {
  return Boolean(level?.render) && Array.isArray(level?.expect) && level.expect.length > 0;
}

/** Splits `"GET /"` into its two parts; a bare path is a GET. */
export function parseRender(render) {
  const text = String(render ?? "").trim();
  const space = text.indexOf(" ");
  if (space === -1) return { method: "GET", path: text };
  return { method: text.slice(0, space).toUpperCase(), path: text.slice(space + 1).trim() };
}

/**
 * Turns a probe payload into the page to grade and the fetch table behind it.
 *
 * Returns `{ error }` rather than throwing, because every caller is showing the
 * result to a student: a level whose `render:` never got answered is a mistake
 * they can fix in their own code, not an exception to propagate.
 */
export function pageFrom(level, responses) {
  if (!Array.isArray(responses)) {
    return { error: "Your program stopped before it could serve a page. The console has the error." };
  }

  const { method, path } = parseRender(level.render);
  const hit = responses.find((r) => r.m === method && r.p === path);
  if (!hit) {
    return { error: `Your app never answered ${method} ${path}, so there is no page to check.` };
  }

  // A redirect has no page in it — the browser would have gone somewhere else.
  // Said plainly, because "no `h1` on the page" would send the student hunting
  // through their HTML for a bug that is actually in their routing.
  //
  // Only 3xx. A 404 or a 500 carries a body and is a page a browser really
  // shows, which is the whole subject of the level that teaches error pages.
  if (hit.s >= 300 && hit.s < 400) {
    const where = headerOf(hit.h, "Location");
    return {
      error: `${method} ${path} answered ${hit.s} ${hit.r}${where ? ` and sent the browser to ${where}` : ""}, so there is no page here to check.`,
    };
  }

  return {
    html: hit.b ?? "",
    // Every response, not just the page's: the whole point of the last chapters
    // is that the page calls back into the same app, and those calls are already
    // in the payload because the level listed them in `req:`.
    prelude: fetchShimScript(routeTable(responses)),
  };
}
