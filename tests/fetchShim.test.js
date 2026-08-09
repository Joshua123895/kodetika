import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { routeTable, fetchShimScript } from "../src/backend/fetchShim.js";
import { pageFrom, parseRender, isFullstackLevel } from "../src/backend/fullstack.js";
import { buildDocument, runAssertions } from "../src/data/webAssert.js";

// The full-stack chapters rest on one claim: a page served by the student's own
// Python can call back into that same Python over `fetch` and be graded on what
// it renders. Nothing else in the repo can catch a break in that bridge — the
// level suites would just report every level as wrong — so it is tested here on
// hand-written payloads, with no interpreter involved.
//
// This suite runs without CPython on purpose. The bridge is pure JavaScript on
// both sides of the wire, and a machine with no Python should still be able to
// prove it.

/** The shape `requestDriver`'s probe payload uses, so the fixtures are honest. */
const res = (m, p, s, r, b, h = { "Content-Type": "application/json" }) => ({ m, p, s, r, b, h });

const PAGE = res("GET", "/", 200, "OK", "<ul id='notes'></ul>", { "Content-Type": "text/html" });

/**
 * Renders a page with the shim installed and waits for it to settle, exactly as
 * webRuntime's injected runner does. The `__fetchIdle` handshake is the part
 * most likely to rot, so the test goes through it rather than around it.
 */
async function renderPage(html, prelude, expectations) {
  const dom = new JSDOM(buildDocument({ "index.html": html }, { prelude }), { runScripts: "dangerously" });
  const { window } = dom;
  try {
    if (typeof window.__fetchIdle === "function") await window.__fetchIdle();
    await new Promise((r) => setTimeout(r, 0));
    return runAssertions(window.document, expectations, window);
  } finally {
    window.close();
  }
}

describe("the fetch bridge", () => {
  it("serves a page's fetch from the app's own response", async () => {
    const responses = [PAGE, res("GET", "/api/notes", 200, "OK", '[{"id":1,"text":"buy milk"},{"id":2,"text":"walk the dog"}]')];
    const { html, prelude, error } = pageFrom({ render: "GET /" }, responses);
    expect(error).toBeUndefined();

    const script = `<script>
      fetch("/api/notes").then(r => r.json()).then(notes => {
        document.querySelector("#notes").innerHTML =
          notes.map(n => "<li>" + n.text + "</li>").join("");
      });
    </script>`;

    const result = await renderPage(html + script, prelude, [
      { sel: "#notes li", count: 2 },
      { sel: "#notes li", text: "buy milk" },
    ]);
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("waits for a fetch that resolves after load", async () => {
    // The regression this guards: grading on `load` alone checks an empty list,
    // because a fetch cannot possibly have resolved by then.
    const responses = [PAGE, res("GET", "/api/notes", 200, "OK", '[{"text":"only one"}]')];
    const { html, prelude } = pageFrom({ render: "GET /" }, responses);
    const script = `<script>
      window.addEventListener("load", function () {
        fetch("/api/notes").then(r => r.json()).then(notes => {
          document.querySelector("#notes").innerHTML = "<li>" + notes[0].text + "</li>";
        });
      });
    </script>`;
    const result = await renderPage(html + script, prelude, [{ sel: "#notes li", text: "only one" }]);
    expect(result.failures).toEqual([]);
  });

  it("settles after a fetch that starts inside another fetch's callback", async () => {
    const responses = [
      PAGE,
      res("GET", "/api/notes", 200, "OK", '[{"id":7}]'),
      res("GET", "/api/notes/7", 200, "OK", '{"text":"chained"}'),
    ];
    const { html, prelude } = pageFrom({ render: "GET /" }, responses);
    const script = `<script>
      fetch("/api/notes").then(r => r.json()).then(list =>
        fetch("/api/notes/" + list[0].id)).then(r => r.json()).then(note => {
          document.querySelector("#notes").innerHTML = "<li>" + note.text + "</li>";
        });
    </script>`;
    const result = await renderPage(html + script, prelude, [{ sel: "#notes li", text: "chained" }]);
    expect(result.failures).toEqual([]);
  });

  it("answers a path the app does not serve with a real 404", async () => {
    const { html, prelude } = pageFrom({ render: "GET /" }, [PAGE]);
    const script = `<script>
      fetch("/api/nope").then(r => {
        document.querySelector("#notes").innerHTML = "<li>" + r.status + " " + r.ok + "</li>";
      });
    </script>`;
    const result = await renderPage(html + script, prelude, [{ sel: "#notes li", text: "404 false" }]);
    expect(result.failures).toEqual([]);
  });

  it("accepts the three ways a student writes the same URL", async () => {
    const responses = [PAGE, res("GET", "/api/notes", 200, "OK", '["ok"]')];
    const { prelude, html } = pageFrom({ render: "GET /" }, responses);
    const script = `<script>
      Promise.all([
        fetch("/api/notes"),
        fetch("api/notes"),
        fetch("http://localhost:8000/api/notes"),
      ].map(p => p.then(r => r.status))).then(codes => {
        document.querySelector("#notes").innerHTML = "<li>" + codes.join(",") + "</li>";
      });
    </script>`;
    const result = await renderPage(html + script, prelude, [{ sel: "#notes li", text: "200,200,200" }]);
    expect(result.failures).toEqual([]);
  });

  it("routes by method, not by path alone", async () => {
    const responses = [
      PAGE,
      res("GET", "/notes", 200, "OK", '{"via":"get"}'),
      res("POST", "/notes", 201, "Created", '{"via":"post"}'),
    ];
    const { prelude, html } = pageFrom({ render: "GET /" }, responses);
    const script = `<script>
      fetch("/notes", { method: "POST" }).then(r => r.json()).then(body => {
        document.querySelector("#notes").innerHTML = "<li>" + body.via + "</li>";
      });
    </script>`;
    const result = await renderPage(html + script, prelude, [{ sel: "#notes li", text: "post" }]);
    expect(result.failures).toEqual([]);
  });

  it("hands back headers case-insensitively, like a real Headers", async () => {
    const responses = [PAGE, res("GET", "/api/notes", 200, "OK", "[]", { "Content-Type": "application/json" })];
    const { prelude, html } = pageFrom({ render: "GET /" }, responses);
    const script = `<script>
      fetch("/api/notes").then(r => {
        document.querySelector("#notes").innerHTML =
          "<li>" + r.headers.get("content-type") + "|" + r.headers.get("X-Missing") + "</li>";
      });
    </script>`;
    const result = await renderPage(html + script, prelude, [{ sel: "#notes li", text: "application/json|null" }]);
    expect(result.failures).toEqual([]);
  });

  it("rejects .json() on a body that is not JSON, rather than resolving undefined", async () => {
    const responses = [PAGE, res("GET", "/api/notes", 200, "OK", "<h1>not json</h1>", { "Content-Type": "text/html" })];
    const { prelude, html } = pageFrom({ render: "GET /" }, responses);
    const script = `<script>
      fetch("/api/notes").then(r => r.json())
        .then(() => { document.querySelector("#notes").innerHTML = "<li>resolved</li>"; })
        .catch(() => { document.querySelector("#notes").innerHTML = "<li>rejected</li>"; });
    </script>`;
    const result = await renderPage(html + script, prelude, [{ sel: "#notes li", text: "rejected" }]);
    expect(result.failures).toEqual([]);
  });

  it("is never synchronous, so a page written as if it were fails here too", async () => {
    const responses = [PAGE, res("GET", "/api/notes", 200, "OK", '["x"]')];
    const { prelude, html } = pageFrom({ render: "GET /" }, responses);
    const script = `<script>
      var done = false;
      fetch("/api/notes").then(() => { done = true; });
      document.querySelector("#notes").innerHTML = "<li>" + done + "</li>";
    </script>`;
    const result = await renderPage(html + script, prelude, [{ sel: "#notes li", text: "false" }]);
    expect(result.failures).toEqual([]);
  });
});

describe("routeTable", () => {
  it("lets the last response for a path win", () => {
    const table = routeTable([
      res("GET", "/notes", 200, "OK", "first"),
      res("GET", "/notes", 200, "OK", "second"),
    ]);
    expect(table["GET /notes"].b).toBe("second");
  });

  it("keeps a query string as part of the key", () => {
    const table = routeTable([res("GET", "/search?q=cats", 200, "OK", "[]")]);
    expect(Object.keys(table)).toEqual(["GET /search?q=cats"]);
  });

  it("survives an empty or missing payload", () => {
    expect(routeTable(null)).toEqual({});
    expect(fetchShimScript(routeTable([]))).toContain("window.fetch");
  });
});

describe("pageFrom", () => {
  it("names the request that was never answered", () => {
    const { error } = pageFrom({ render: "GET /home" }, [PAGE]);
    expect(error).toContain("GET /home");
  });

  it("explains a redirect rather than reporting a missing element", () => {
    const { error } = pageFrom({ render: "GET /" }, [res("GET", "/", 302, "Found", "", { Location: "/login" })]);
    expect(error).toContain("302 Found");
    expect(error).toContain("/login");
  });

  it("renders an error page, because a 404 is still a page", () => {
    const { html, error } = pageFrom({ render: "GET /nope" }, [
      res("GET", "/nope", 404, "Not Found", "<h1>Not found</h1>", { "Content-Type": "text/html" }),
    ]);
    expect(error).toBeUndefined();
    expect(html).toContain("Not found");
  });

  it("reports a crashed program instead of an empty page", () => {
    expect(pageFrom({ render: "GET /" }, null).error).toContain("stopped before");
  });

  it("defaults a bare path to GET", () => {
    expect(parseRender("/about")).toEqual({ method: "GET", path: "/about" });
    expect(parseRender("POST /notes")).toEqual({ method: "POST", path: "/notes" });
  });

  it("only claims levels that have both halves", () => {
    expect(isFullstackLevel({ render: "GET /", expect: [{ sel: "h1" }] })).toBe(true);
    expect(isFullstackLevel({ render: "GET /" })).toBe(false);
    expect(isFullstackLevel({ expect: [{ sel: "h1" }] })).toBe(false);
    expect(isFullstackLevel({ web: true, expect: [{ sel: "h1" }] })).toBe(false);
  });
});
