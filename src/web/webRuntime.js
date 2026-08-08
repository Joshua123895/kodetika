// Runs a web level's page and grades it.
//
// The page renders in an iframe sandboxed to `allow-scripts` and nothing else,
// which gives it an opaque origin. That is deliberate: the student's script is
// arbitrary code running in their own browser, and without the opaque origin it
// could reach `parent.localStorage` and wipe the progress of the very site
// they are learning on. One dropped `parent.` in a beginner's DOM level should
// not be able to cost them 480 stars.
//
// The cost of that isolation is that the parent cannot read the frame's DOM, so
// the assertions cannot run out here. They are injected INTO the frame instead
// and the verdict comes back over postMessage — which is why runAssertions is
// written to survive `.toString()` (see src/data/webAssert.js).

import { runAssertions, buildDocument } from "../data/webAssert";

const RESULT = "step-into-code:web-result";

/**
 * Renders `files` and checks them against `expectations`.
 *
 * Never rejects on student error: a thrown exception in their script is a
 * result to show them, not an exception to propagate. Only the harness itself
 * failing (frame never loads) produces the timeout failure.
 */
export function runWebLevel(files, expectations, { timeout = 5000 } = {}) {
  return new Promise((resolve) => {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:absolute;width:1024px;height:768px;left:-99999px;top:0;border:0;";

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      frame.remove();
      resolve(result);
    };

    const onMessage = (e) => {
      // The frame is opaque-origin, so e.origin is "null" and cannot identify
      // it. The token does: it never leaves this closure and the frame only
      // learns it by being handed it, so another frame cannot forge a verdict.
      if (!e.data || e.data.type !== RESULT || e.data.token !== token) return;
      finish({ passed: e.data.passed, failures: e.data.failures, error: e.data.error });
    };

    const timer = setTimeout(
      () =>
        finish({
          passed: false,
          failures: ["Your page took too long to load. An infinite loop in a script will do this."],
        }),
      timeout
    );

    window.addEventListener("message", onMessage);

    // The runner goes last so the document above it is fully parsed by the time
    // it runs, and is wrapped so a student's thrown error is reported rather
    // than silently leaving the parent waiting for a message that never comes.
    const runner = `
<script>
(function () {
  var token = ${JSON.stringify(token)};
  var expectations = ${JSON.stringify(expectations ?? [])};
  var firstError = null;
  window.addEventListener("error", function (e) { if (!firstError) firstError = String(e.message); });
  function report() {
    var out;
    try {
      out = (${runAssertions.toString()})(document, expectations, window);
    } catch (err) {
      out = { passed: false, failures: ["The page could not be checked: " + err.message] };
    }
    if (firstError) {
      out = { passed: false, failures: out.failures.concat(["Your script threw an error: " + firstError]), error: firstError };
    }
    parent.postMessage({ type: ${JSON.stringify(RESULT)}, token: token, passed: out.passed, failures: out.failures, error: out.error || null }, "*");
  }
  // Give the student's own load handlers a turn first — a DOM level that builds
  // its markup in window.onload would otherwise be graded on an empty page.
  if (document.readyState === "complete") setTimeout(report, 0);
  else window.addEventListener("load", function () { setTimeout(report, 0); });
})();
</script>`;

    frame.srcdoc = buildDocument(files) + runner;
    document.body.appendChild(frame);
  });
}

/** The document string shown in the visible preview — no runner, no token. */
export function previewDocument(files) {
  return buildDocument(files);
}
