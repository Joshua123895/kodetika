// The single definition of "did this web level's page come out right".
//
// Two very different environments have to agree on that answer:
//   - the browser, where the student's page renders inside a sandboxed iframe
//     and the assertions run INSIDE it (the frame has an opaque origin, so the
//     parent cannot reach its DOM and the verdict has to be postMessaged out)
//   - vitest, where tests/webLevels.test.js parses each level's own `sol` with
//     jsdom and asserts the level's expectations pass, the same way
//     tests/levels.test.js runs every Python solution through real CPython
//
// The browser half is why `runAssertions` is written as ONE self-contained
// function with every helper nested inside it: the iframe gets it via
// `runAssertions.toString()`, so anything it referenced from module scope would
// be undefined the moment it landed there. It costs some nesting and buys the
// guarantee that CI and the browser can never drift into grading differently.
//
// Deliberately plain ESM, no DOM globals at module load — same rule as
// src/data/levelSource.js, so node and vitest can import it.

/**
 * Checks a rendered document against a level's `expect:` list.
 *
 * @param doc  a Document — `iframe.contentDocument` in the browser, jsdom's in CI
 * @param expectations  the parsed `expect:` array from the level YAML
 * @param win  the matching window, needed for getComputedStyle
 * @returns {{passed: boolean, failures: string[]}} failures are reader-facing
 *          sentences, already phrased for the "Test Failed" panel
 */
export function runAssertions(doc, expectations, win, actions) {
  // ---- helpers (nested on purpose: see the header) -------------------------

  // Beginners indent and wrap their markup however they like, and the DOM keeps
  // every bit of that whitespace in textContent. Comparing raw would fail a
  // correct answer for putting a heading on its own line.
  const squash = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

  // jsdom and Chrome disagree on how a color is spelled back to you: jsdom
  // hands back the keyword or hex you wrote, Chrome resolves everything to
  // rgb(). Neither is wrong, but a level graded in both has to accept both, so
  // colors are normalized to rgb() on the way into the comparison.
  const NAMED = {
    black: "0,0,0", white: "255,255,255", red: "255,0,0", lime: "0,255,0",
    green: "0,128,0", blue: "0,0,255", yellow: "255,255,0", cyan: "0,255,255",
    aqua: "0,255,255", magenta: "255,0,255", fuchsia: "255,0,255",
    silver: "192,192,192", gray: "128,128,128", grey: "128,128,128",
    maroon: "128,0,0", olive: "128,128,0", purple: "128,0,128",
    teal: "0,128,128", navy: "0,0,128", orange: "255,165,0",
  };

  // Chrome computes `font-weight: bold` to the number 700 while jsdom hands
  // back the keyword. Mapped per-property rather than globally, because
  // `normal` means 400 only here — on `font-style` or `letter-spacing` it is
  // its own value and must not be rewritten.
  const WEIGHTS = { normal: "400", bold: "700" };

  const normalizeValue = (prop, raw) => {
    const v = squash(raw).toLowerCase();
    if (prop === "font-weight" && WEIGHTS[v]) return WEIGHTS[v];
    if (NAMED[v]) return `rgb(${NAMED[v]})`;
    const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
    if (hex) {
      const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
      const n = parseInt(h, 16);
      return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
    }
    // rgb(1, 2, 3) and rgb(1,2,3) are the same value spelled two ways.
    const rgb = v.match(/^rgba?\(([^)]+)\)$/);
    if (rgb) {
      const parts = rgb[1].split(",").map((p) => p.trim());
      if (parts.length === 4 && parseFloat(parts[3]) === 1) parts.pop();
      return `rgb(${parts.join(",")})`;
    }
    return v;
  };

  // A selector the student's page doesn't contain is by far the most common
  // failure, and "expected 1, got 0" tells them nothing. Name the tag.
  const describe = (sel) => `\`${sel}\``;

  const failures = [];

  // A level about `addEventListener` cannot be graded on the page as it loads —
  // nothing has happened yet. `act:` drives the page first: each entry names an
  // element and what to do to it, and only then are the expectations checked, so
  // what is graded is the page AFTER the interaction the level is teaching.
  //
  // Deliberately tiny: click and type are the two a beginner meets, and every
  // event is dispatched with bubbles:true so a listener on an ancestor sees it.
  for (const step of Array.isArray(actions) ? actions : []) {
    const target = step.sel ? doc.querySelector(step.sel) : null;
    if (!target) {
      failures.push(`The check tried to use ${describe(step.sel)}, but the page has no such element.`);
      return { passed: false, failures };
    }
    try {
      if (step.type !== undefined) {
        target.value = String(step.type);
        target.dispatchEvent(new win.Event("input", { bubbles: true }));
        target.dispatchEvent(new win.Event("change", { bubbles: true }));
      } else {
        target.dispatchEvent(new win.Event(step.event || "click", { bubbles: true, cancelable: true }));
      }
    } catch (err) {
      failures.push(`Your code threw an error while the page was being used: ${err.message}`);
      return { passed: false, failures };
    }
  }

  const list = Array.isArray(expectations) ? expectations : [];

  for (const rule of list) {
    const sel = rule.sel;
    if (!sel) continue;

    let matches;
    try {
      matches = Array.from(doc.querySelectorAll(sel));
    } catch {
      // A malformed selector is an authoring bug in the level, not a student
      // mistake. Surface it loudly rather than failing the student silently.
      failures.push(`Level error: \`${sel}\` is not a valid CSS selector.`);
      continue;
    }

    // `count` is explicit; without it the rule just requires the element exists.
    const wantCount = rule.count;
    if (wantCount !== undefined) {
      if (matches.length !== wantCount) {
        failures.push(
          rule.msg ||
            `Expected ${wantCount} ${describe(sel)} element${wantCount === 1 ? "" : "s"}, found ${matches.length}.`
        );
        continue;
      }
    } else if (matches.length === 0) {
      failures.push(rule.msg || `No ${describe(sel)} element on the page.`);
      continue;
    }

    const el = matches[0];

    if (rule.text !== undefined) {
      const actual = squash(el.textContent);
      const want = squash(rule.text);
      if (actual !== want) {
        failures.push(rule.msg || `${describe(sel)} should read "${want}" but reads "${actual}".`);
        continue;
      }
    }

    if (rule.contains !== undefined) {
      const actual = squash(el.textContent);
      const want = squash(rule.contains);
      if (!actual.includes(want)) {
        failures.push(rule.msg || `${describe(sel)} should contain "${want}" but reads "${actual}".`);
        continue;
      }
    }

    if (rule.attr) {
      let bad = false;
      for (const [name, want] of Object.entries(rule.attr)) {
        const actual = el.getAttribute(name);
        if (actual === null) {
          failures.push(rule.msg || `${describe(sel)} is missing the \`${name}\` attribute.`);
          bad = true;
          break;
        }
        if (squash(actual) !== squash(want)) {
          failures.push(
            rule.msg || `${describe(sel)} has \`${name}="${squash(actual)}"\`, expected \`${name}="${squash(want)}"\`.`
          );
          bad = true;
          break;
        }
      }
      if (bad) continue;
    }

    if (rule.style) {
      let bad = false;
      for (const [prop, want] of Object.entries(rule.style)) {
        const computed = win.getComputedStyle(el).getPropertyValue(prop);
        if (normalizeValue(prop, computed) !== normalizeValue(prop, want)) {
          failures.push(
            rule.msg ||
              `${describe(sel)} should have \`${prop}: ${squash(want)}\` but has \`${squash(computed) || "nothing"}\`.`
          );
          bad = true;
          break;
        }
      }
      if (bad) continue;
    }
  }

  return { passed: failures.length === 0, failures };
}

/**
 * CSS properties a level must never assert on, because jsdom and a real browser
 * do not agree on what they compute to. Every entry here was found by running
 * the same declaration through both, not by reasoning about the spec.
 *
 * The recurring cause is that a browser's getComputedStyle returns the *used*
 * value — the number the layout engine settled on — while jsdom, which has no
 * layout engine, can only hand back what was declared:
 *
 *   border-width  jsdom echoes `2px`; Chrome reports the used width, snapped to
 *                 device pixels — at 80% page zoom it came back as `1.6px`, so
 *                 the same correct answer passes or fails depending on how the
 *                 student happens to have zoomed their browser.
 *   border        the shorthand carries a width, so it inherits that problem.
 *   width/height  `50%` stays `50%` in jsdom and resolved to `392px` in Chrome,
 *                 a number that depends on the width of the preview pane. Use
 *                 `max-width`, which is reported as specified in both.
 *   margin: auto  `margin-left` stays `auto` in jsdom and came back as `92px` in
 *                 Chrome. Levels may teach `margin: 0 auto` for centring — they
 *                 just cannot check it. See "Centring the Page".
 *
 * The rest are shorthands the two expand differently:
 *
 *   background        Chrome expands it to the full eight-part longhand
 *                     (`rgb(…) none repeat scroll 0% 0% / auto padding-box …`).
 *   box-shadow        written as `0 2px 4px #000000`, read back from Chrome as
 *                     `rgb(0, 0, 0) 0px 2px 4px 0px`.
 *   text-decoration   assert `text-decoration-line`, which both agree on.
 *   row/column-gap    jsdom does not expand the `gap` shorthand into them, so
 *                     they read `normal` there and `16px` in Chrome. Asserting
 *                     `gap` itself is fine, and a student who writes the two
 *                     longhands instead still passes, because Chrome — the one
 *                     grading them — expands in the other direction.
 *   line-height       a unitless `1.6` stays `1.6` in jsdom and resolves against
 *                     font-size in Chrome (`25.6px`).
 *
 * `tests/webLevels.test.js` fails the build if a level declares one of these,
 * so each trap can only be fallen into once.
 */
export const UNGRADABLE_STYLE_PROPS = [
  "border",
  "border-width",
  "background",
  "box-shadow",
  "text-decoration",
  "width",
  "height",
  "row-gap",
  "column-gap",
  "line-height",
];

const COLOR_PROPS = ["color", "background-color", "border-color"];

// `auto` on any of these resolves to a pixel count in a browser and stays the
// keyword in jsdom. The property is otherwise perfectly gradable, so this is a
// value rule rather than an outright ban — `margin-top: 0px` is fine.
const AUTO_PRONE_PROPS = /^(margin|padding)(-(top|right|bottom|left))?$/;

/**
 * True when `value` is safe to assert for `prop`. Split out from the list above
 * because two of the rules depend on the value, not just the property:
 *
 *   line-height  fine with a unit, ambiguous without one.
 *   margin       fine as a length, ungradable as `auto`.
 *   colors       must be written as a hex or `rgb()`, never as a keyword.
 *                `runAssertions` resolves the twenty keywords a beginner
 *                actually reaches for, but the CSS named-color set is 148 long
 *                and shipping all of them would bloat a function that gets
 *                stringified into every graded frame. Anything outside that
 *                map — `crimson`, say — stays a keyword in jsdom and resolves
 *                to `rgb(220, 20, 60)` in Chrome, so the level would pass CI
 *                and fail the student. Writing the hex sidesteps the question:
 *                a student who types the keyword still passes, because it is
 *                the *computed* value that gets normalized.
 */
export function isGradableStyle(prop, value) {
  const v = String(value).trim();
  if (prop === "line-height") return /[a-z%]$/i.test(v);
  if (AUTO_PRONE_PROPS.test(prop)) return !/\bauto\b/i.test(v);
  if (COLOR_PROPS.includes(prop)) return /^(#[0-9a-f]{3,8}|rgba?\(.+\))$/i.test(v);
  return !UNGRADABLE_STYLE_PROPS.includes(prop);
}

/**
 * A script that must run BEFORE the student's code, buffering everything they
 * `console.log` so a level can be graded on what it printed rather than on the
 * DOM it built. That is what makes a JavaScript track possible at all: `let x =
 * 5` leaves no trace in a page, so there would otherwise be nothing to check.
 *
 * Shipped as a string for the same reason `runAssertions` is stringified — the
 * browser needs it inside an opaque-origin frame it cannot otherwise reach — and
 * shared with `tests/webLevels.test.js` so the two environments format values
 * identically. A divergence here would be the console equivalent of the
 * computed-style trap in UNGRADABLE_STYLE_PROPS.
 *
 * The formatting rule is deliberately simpler than a devtools console, because
 * it is also the rule a student has to predict when writing their answer:
 * strings print as themselves (no quotes), objects and arrays as JSON, and
 * everything else as `String(v)`. Arguments join with a single space.
 */
export const CONSOLE_CAPTURE = `<script>
(function () {
  var lines = [];
  window.__webLevelOutput = lines;
  function show(v) {
    if (typeof v === "string") return v;
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    if (typeof v === "object") {
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    }
    return String(v);
  }
  var real = console.log;
  console.log = function () {
    lines.push(Array.prototype.map.call(arguments, show).join(" "));
    // Still forward to the real console: the student's own devtools should show
    // what they printed, and swallowing it would make debugging worse than not
    // having the level at all.
    try { real.apply(console, arguments); } catch (e) {}
  };
})();
</script>
`;

/**
 * The preview half of the same idea. A JavaScript level's page is deliberately
 * empty, so showing it would show a blank white rectangle that looks broken;
 * this paints what was logged into the frame instead, styled as the console the
 * pane's label claims it is. Grading never uses this — it reads the buffer.
 *
 * The palette is theme-aware: `consoleRenderer` takes the colours so the frame
 * can match whichever theme the app is in, the way the Python tracks' terminal
 * does. Only the error red is shared — it reads on either background.
 */
export const CONSOLE_STYLE = {
  dark: { bg: "#0d0e17", fg: "#CDD6F4", err: "#FF5F57" },
  light: { bg: "#EEF2EB", fg: "#374151", err: "#FF5F57" },
};

export function consoleRenderer(colors = CONSOLE_STYLE.dark) {
  return `<style>
  html, body { margin: 0; height: 100%; background: ${colors.bg}; }
  body { padding: 10px 14px; box-sizing: border-box; overflow: auto;
         font: 12px/1.55 Consolas, monospace; color: ${colors.fg}; white-space: pre-wrap; }
  .err { color: ${colors.err}; }
</style>
<script>
(function () {
  var errors = [];
  function paint(text, cls) {
    var el = document.createElement("div");
    if (cls) el.className = cls;
    el.textContent = text;
    document.body.appendChild(el);
  }
  // Clears and repaints, so calling it more than once is safe: an error and the
  // ready event both trigger it, and a late error has to be able to repaint.
  function render() {
    if (!document.body) return;
    document.body.textContent = "";
    var printed = window.__webLevelOutput || [];
    for (var i = 0; i < printed.length; i++) paint(printed[i]);
    for (var j = 0; j < errors.length; j++) paint(errors[j], "err");
  }
  // A beginner's script throws often enough that the message has to appear in
  // this pane, not only in devtools they do not know about yet. It is collected
  // rather than painted on the spot because a JavaScript level's page has no
  // markup, so every script lands in <head> and throws before <body> exists —
  // appending at that moment put the line outside the body entirely.
  window.addEventListener("error", function (e) { errors.push(String(e.message)); render(); });
  window.addEventListener("DOMContentLoaded", render);
})();
</script>
`;
}

// The dark form, kept for callers that build the console string directly
// (the tests) and as the default above.
export const CONSOLE_RENDERER = consoleRenderer(CONSOLE_STYLE.dark);

/**
 * Assembles the student's files into one HTML document string.
 *
 * Levels start single-file (`index.html`) and grow into three, so this accepts
 * the whole map and wires up whatever is present. A stylesheet or script the
 * student already linked by hand is left alone — double-injecting would run
 * their script twice, which is a genuinely confusing thing to debug.
 */
export function buildDocument(files, { captureConsole = false, prelude = "" } = {}) {
  const html = files["index.html"] ?? "";
  const css = files["style.css"];
  const js = files["script.js"];

  let out = html;
  if (css && !/<link[^>]+style\.css/i.test(html)) {
    const tag = `<style>\n${css}\n</style>`;
    out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${tag}\n</head>`) : `${tag}\n${out}`;
  }
  if (js && !/<script[^>]+script\.js/i.test(html)) {
    const tag = `<script>\n${js}\n</script>`;
    out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${tag}\n</body>`) : `${out}\n${tag}`;
  }
  // Prepended, not appended: these have to be installed before any of the
  // student's script runs, and their script may be the first thing in the
  // document. `prelude` carries the full-stack track's fetch shim, and goes
  // ahead of the console capture so a page may log inside a fetch callback.
  return (prelude || "") + (captureConsole ? CONSOLE_CAPTURE + out : out);
}
