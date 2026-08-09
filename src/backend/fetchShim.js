// The bridge that lets a page talk to the app that served it.
//
// The last chapters of the Web Developer track are the point of the whole
// platform: a student's Python app serves an HTML page, and that page's own
// script calls the student's JSON API and renders what comes back. Both halves
// are theirs, and the level is graded on the DOM that results.
//
// The obstacle is that the two halves do not live anywhere near each other. The
// Python runs in a Web Worker (or, in CI, in a real CPython process); the page
// renders in an opaque-origin iframe (or, in CI, in jsdom). There is no server
// listening on any port for the page's `fetch` to reach, and inventing one would
// mean a real network stack in four environments that would then have to agree.
//
// So the requests are answered before they are asked. A level declares which
// paths its page is allowed to fetch; the driver already runs the app for every
// request in `req:`, so those paths ride along and their real responses come
// back in the probe payload. This turns that payload into a `fetch` the page
// cannot tell from the real thing — same status, same headers, same bytes,
// produced by the student's own handlers.
//
// What it deliberately is not: live. A POST from the page cannot change what a
// later GET returns, because every response was computed up front. That is
// stated in the level text rather than hidden, and it is the same bargain the
// `browser` tab's address bar makes.
//
// Plain ESM with no DOM globals at module load, like levelSource.js and
// webAssert.js, so node and vitest can import it.

/** Where a shimmed response's fields come from — the driver's probe payload. */
const KEY = (method, path) => `${String(method).toUpperCase()} ${path}`;

/**
 * Builds the lookup the shim serves from, out of the driver's probe payload.
 *
 * Later entries win. A level whose `req:` list hits the same path twice —
 * "delete it, then ask for it again" — should have its page see the world as it
 * stood after the last request, which is also what the `browser` tab shows.
 */
export function routeTable(responses) {
  const table = {};
  for (const res of Array.isArray(responses) ? responses : []) {
    table[KEY(res.m, res.p)] = { s: res.s, r: res.r, h: res.h || {}, b: res.b ?? "" };
  }
  return table;
}

/**
 * A `<script>` installing `window.fetch` over `table`, to be injected ahead of
 * the student's own script.
 *
 * Shipped as a string for the same reason `runAssertions` is stringified: the
 * frame has an opaque origin and cannot import anything from out here, and the
 * identical string is what jsdom gets, so CI and the browser cannot drift into
 * answering the same request differently.
 */
/**
 * JSON safe to embed inside a `<script>` element.
 *
 * The parser ends a script at the first `</script` in its text, wherever that
 * appears — including inside a string literal. The bodies in this table are
 * pages, and from chapter 3 on those pages contain scripts of their own, so
 * without this the shim truncates itself the moment a level gets interesting.
 * `\\u003c` is an ordinary JavaScript escape, so the value is unchanged.
 */
function embed(value) {
  return JSON.stringify(value ?? {}).replace(/</g, "\\u003c");
}

export function fetchShimScript(table) {
  return `<script>
(function () {
  var TABLE = ${embed(table)};
  var pending = 0;
  var waiters = [];

  function settle() {
    if (pending > 0) return;
    var list = waiters;
    waiters = [];
    for (var i = 0; i < list.length; i++) list[i]();
  }

  // Only the path and query survive. A student may write fetch("/api/notes"),
  // fetch("api/notes") or the whole origin, and all three mean the same request
  // to the app that served the page.
  function pathOf(url) {
    var s = String(url);
    s = s.replace(/^[a-z]+:\\/\\/[^/]*/i, "");
    if (s.charAt(0) !== "/") s = "/" + s;
    return s.replace(/#.*$/, "");
  }

  function headersOf(map) {
    var lower = {};
    for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) lower[k.toLowerCase()] = map[k];
    return {
      get: function (name) {
        var v = lower[String(name).toLowerCase()];
        return v === undefined ? null : v;
      },
      has: function (name) { return lower[String(name).toLowerCase()] !== undefined; },
      forEach: function (fn) { for (var k in lower) fn(lower[k], k); },
    };
  }

  function responseOf(hit, url) {
    var body = hit ? hit.b : JSON.stringify({ error: "Not Found" });
    var status = hit ? hit.s : 404;
    return {
      ok: status >= 200 && status < 300,
      status: status,
      statusText: hit ? hit.r : "Not Found",
      url: url,
      redirected: false,
      headers: headersOf(hit ? hit.h : { "Content-Type": "application/json" }),
      text: function () { return Promise.resolve(body); },
      json: function () {
        try { return Promise.resolve(JSON.parse(body)); }
        catch (e) { return Promise.reject(new SyntaxError("The response is not JSON: " + e.message)); }
      },
      clone: function () { return responseOf(hit, url); },
    };
  }

  window.fetch = function (input, init) {
    var url = input && input.url ? input.url : input;
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var key = method + " " + pathOf(url);
    var hit = Object.prototype.hasOwnProperty.call(TABLE, key) ? TABLE[key] : null;
    pending++;
    // A real fetch is never synchronous, and a page written as if it were would
    // pass here and break everywhere else. One turn of the event loop is the
    // cheapest way to keep that honest.
    return new Promise(function (resolve) {
      setTimeout(function () {
        pending--;
        resolve(responseOf(hit, pathOf(url)));
        // Deferred a turn so the .then chain this resolve kicks off has run and
        // registered any follow-up fetch before we call ourselves idle.
        setTimeout(settle, 0);
      }, 0);
    });
  };

  // How the grader knows the page has finished loading itself. Resolves once no
  // request is outstanding; grading a fetch-driven page on the "load" event
  // alone would check an empty list every time.
  window.__fetchIdle = function () {
    return new Promise(function (resolve) {
      if (pending === 0) { setTimeout(resolve, 0); return; }
      waiters.push(resolve);
    });
  };
})();
</script>
`;
}
