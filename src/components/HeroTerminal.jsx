import { useEffect, useMemo, useRef, useState } from "react";

// The hero used to describe the product in a sentence. This shows it instead:
// the same editor chrome the level pages use, typing real Python and printing
// the real answer. Nothing here executes — the output is written alongside each
// snippet, because booting Pyodide on the landing page would cost ~20MB and
// several seconds for a decoration.

const SNIPPETS = [
  { code: 'squares = [n * n for n in range(6)]\nprint(squares)', out: '[0, 1, 4, 9, 16, 25]' },
  { code: 'def greet(name: str) -> str:\n    return f"Hello, {name}!"\n\nprint(greet("world"))', out: 'Hello, world!' },
  { code: 'nums = [5, 2, 9, 1]\nprint(sorted(nums, reverse=True))', out: '[9, 5, 2, 1]' },
  { code: 'word = "step into code"\nprint(word.title().replace(" ", ""))', out: 'StepIntoCode' },
];

const TYPE_MS = 34;
const HOLD_MS = 2100;

// Minimal Python colouring. A real highlighter would mean pulling CodeMirror
// into the landing bundle for four hard-coded snippets.
//
// One combined regex, one pass. Running the rules in sequence over the string
// you are building does not work: the keyword rule emits
// <span style="color:#BB9AF7">, and the string rule then matches the quoted
// colour inside that attribute and paints its own markup.
//
// Order is significant — comments and strings come first so a keyword sitting
// inside a string is left alone.
const RULES = [
  { src: "#[^\\n]*", color: "#6B7280" },
  // Closed string, or one still being typed (the demo types character by
  // character, so the closing quote arrives late).
  { src: "f?\"(?:[^\"\\\\\\n]|\\\\.)*\"|f?'(?:[^'\\\\\\n]|\\\\.)*'|f?\"[^\"\\n]*$|f?'[^'\\n]*$", color: "#6AAE6F" },
  { src: "\\b(?:def|return|for|in|range|print|sorted|reverse|True|False|None|str|int|len)\\b", color: "#BB9AF7" },
  { src: "\\b\\d+(?:\\.\\d+)?\\b", color: "#E9B44C" },
];
const COMBINED = new RegExp(RULES.map((r) => `(${r.src})`).join("|"), "gm");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function paint(text) {
  let html = "";
  let last = 0;
  for (const m of text.matchAll(COMBINED)) {
    html += esc(text.slice(last, m.index));
    const groupIndex = m.slice(1).findIndex((g) => g !== undefined);
    const color = RULES[groupIndex]?.color;
    html += color ? `<span style="color:${color}">${esc(m[0])}</span>` : esc(m[0]);
    last = m.index + m[0].length;
  }
  return html + esc(text.slice(last));
}

export default function HeroTerminal() {
  const reduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(reduced ? SNIPPETS[0].code : "");
  const [showOut, setShowOut] = useState(reduced);
  const timers = useRef([]);

  useEffect(() => {
    if (reduced) return undefined;
    const snippet = SNIPPETS[index];
    let char = 0;
    const clearAll = () => { timers.current.forEach(clearTimeout); timers.current = []; };

    const tick = () => {
      char++;
      setTyped(snippet.code.slice(0, char));
      if (char < snippet.code.length) {
        timers.current.push(setTimeout(tick, TYPE_MS));
      } else {
        timers.current.push(setTimeout(() => setShowOut(true), 260));
        timers.current.push(setTimeout(() => {
          setShowOut(false);
          setTyped("");
          setIndex((i) => (i + 1) % SNIPPETS.length);
        }, HOLD_MS + 260));
      }
    };
    // Scheduled rather than called straight from the effect body: a synchronous
    // setState here would cascade an extra render on every snippet change.
    timers.current.push(setTimeout(() => { setTyped(""); setShowOut(false); }, 0));
    timers.current.push(setTimeout(tick, 260));
    return clearAll;
  }, [index, reduced]);

  const snippet = SNIPPETS[index];

  return (
    <div
      className="rounded-2xl overflow-hidden w-full"
      style={{ background: "var(--bg-card)", border: "2px solid var(--border-strong)", boxShadow: "0 18px 40px -24px rgba(0,0,0,0.55)" }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid var(--border-strong)" }}>
        <span className="w-3 h-3 rounded-full" style={{ background: "#FF5F57" }} />
        <span className="w-3 h-3 rounded-full" style={{ background: "#E9B44C" }} />
        <span className="w-3 h-3 rounded-full" style={{ background: "#6AAE6F" }} />
        <span className="ml-2 text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>main.py</span>
      </div>

      <div className="px-4 py-3" style={{ minHeight: 132 }}>
        <pre className="text-[13px] leading-6 font-mono m-0" style={{ whiteSpace: "pre-wrap", color: "var(--text)" }}>
          <span dangerouslySetInnerHTML={{ __html: paint(typed) }} />
          {!reduced && (
            <span
              className="inline-block align-middle hero-caret"
              style={{ width: 7, height: 15, background: "#6AAE6F", marginLeft: 1 }}
            />
          )}
        </pre>
      </div>

      <div className="px-4 py-2.5" style={{ borderTop: "1px solid var(--border-strong)", background: "var(--bg-surface)", minHeight: 42 }}>
        <div className="text-[11px] font-bold mb-0.5" style={{ color: "var(--text-muted)" }}>OUTPUT</div>
        <pre
          className="text-[13px] font-mono m-0 transition-opacity duration-300"
          style={{ color: "#6AAE6F", opacity: showOut ? 1 : 0, whiteSpace: "pre-wrap" }}
        >
          {snippet.out}
        </pre>
      </div>
    </div>
  );
}

