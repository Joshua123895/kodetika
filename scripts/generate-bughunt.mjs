// Generates the Bug Hunt puzzle deck.
//
// Each puzzle is one line of a working solution, replaced so the program still
// looks plausible but no longer behaves. The hard part is that ~11% of such
// edits are EQUIVALENT — they compile, run, and print the right answer anyway —
// and no static rule can tell those from real bugs. So every candidate is
// executed against real CPython and kept only if its behaviour actually changed.
//
// This runs offline rather than in the browser for three reasons:
//   1. Some mutations hang. In the browser a timeout makes pyodideWorkerClient
//      terminate and discard the worker, forcing a ~20MB Pyodide re-download.
//   2. The wasted round trips (equivalent mutants) would be paid by the player.
//   3. The expected outputs were certified against CPython by tests/levels.test.js,
//      so mutants should be judged by the same interpreter.
//
// Because the generator records what the broken program actually prints, the
// game itself needs no Python at runtime at all.
//
//   npm run generate:bughunt            write src/data/bughunt.json
//   npm run generate:bughunt -- --report dry run, print the operator table

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { load as loadYaml } from "js-yaml";
import { runnableSource, srcHash } from "../src/data/levelSource.js";
import { norm } from "../src/utils/outputMatcher.js";

const REPORT_ONLY = process.argv.includes("--report");
const TRACKS_DIR = join(process.cwd(), "src", "data", "tracks");
const OUT = join(process.cwd(), "src", "data", "bughunt.json");
const TIMEOUT_MS = 5000;

function findPython() {
  for (const cmd of ["python", "python3", "py"]) {
    const r = spawnSync(cmd, ["--version"], { timeout: 5000 });
    if (!r.error && r.status === 0) return cmd;
  }
  throw new Error("Python not found.");
}
const PY = findPython();

/** Runs a program on stdin — no temp dir needed. */
function run(code) {
  const r = spawnSync(PY, ["-"], { input: code, encoding: "utf-8", timeout: TIMEOUT_MS });
  return {
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    timedOut: r.error?.code === "ETIMEDOUT" || r.signal === "SIGTERM",
  };
}

// --- mutation operators ----------------------------------------------------
// Each rewrites exactly ONE line. Nothing may touch two lines, or the "only one
// thing is wrong" promise breaks.

const swap = (line, a, b) => {
  if (line.includes(a)) return line.replace(a, b);
  if (line.includes(b)) return line.replace(b, a);
  return null;
};

const OPERATORS = [
  { id: "cmp", fn: (l) => swap(l, " < ", " > ") },
  { id: "cmp_eq", fn: (l) => swap(l, " <= ", " < ") || swap(l, " >= ", " > ") },
  { id: "cmp_neq", fn: (l) => swap(l, " == ", " != ") },
  { id: "arith", fn: (l) => swap(l, " + ", " - ") },
  { id: "arith_mul", fn: (l) => (l.includes(" * ") ? l.replace(" * ", " + ") : null) },
  { id: "arith_div", fn: (l) => (l.includes(" // ") ? l.replace(" // ", " / ") : null) },
  { id: "aug", fn: (l) => swap(l, "+=", "-=") },
  { id: "range_bound", fn: (l) => {
      const m = l.match(/range\(([^)]*)\)/);
      if (!m) return null;
      const args = m[1].split(",");
      const last = args[args.length - 1].trim();
      if (!/^-?\d+$/.test(last)) return null;
      args[args.length - 1] = " " + String(Number(last) - 1);
      return l.replace(m[0], `range(${args.join(",").trim()})`);
    } },
  { id: "index", fn: (l) => {
      const m = l.match(/\[(-?\d+)\]/);
      if (!m) return null;
      const n = Number(m[1]);
      return l.replace(m[0], `[${n === -1 ? 0 : n + 1}]`);
    } },
  { id: "bool_op", fn: (l) => swap(l, " and ", " or ") },
  { id: "list_op", fn: (l) => (l.includes(".append(") ? l.replace(".append(", ".insert(0, ") : null) },
  { id: "sort_dir", fn: (l) => (l.includes(".sort()") ? l.replace(".sort()", ".sort(reverse=True)") : null) },
  { id: "sorted_dir", fn: (l) => {
      const m = l.match(/sorted\(([a-zA-Z_][\w.]*)\)/);
      return m ? l.replace(m[0], `sorted(${m[1]}, reverse=True)`) : null;
    } },
  { id: "int_lit", fn: (l) => {
      // Change a standalone integer literal that is not part of a range() or an
      // index, both of which have their own operators.
      if (/range\(|\[\s*-?\d+\s*\]/.test(l)) return null;
      const m = l.match(/(?<![\w.])(\d+)(?![\w.])/);
      return m ? l.replace(m[0], String(Number(m[1]) + 1)) : null;
    } },
];

function isCodeLine(line) {
  const t = line.trim();
  return t.length > 0 && !t.startsWith("#");
}

function classify(r) {
  if (/SyntaxError|IndentationError|TabError/.test(r.stderr)) return "SYNTAX";
  if (r.stderr.trim()) return "RUNTIME";
  return "SILENT";
}

// --- corpus ----------------------------------------------------------------

function loadLevels() {
  const out = [];
  for (const file of readdirSync(TRACKS_DIR).filter((f) => f.endsWith(".yaml")).sort()) {
    const track = loadYaml(readFileSync(join(TRACKS_DIR, file), "utf-8"));
    let id = 0;
    for (const ch of track.chapters || []) {
      for (const lvl of ch.levels || []) {
        id++;
        // `web` is skipped explicitly rather than relying on the `tests` filter
        // below: a web level's source is HTML, and feeding it to CPython would
        // "generate" a puzzle whose bug is that the whole file is a SyntaxError.
        // `req` levels need a framework seeded beside them and a driver appended
        // after them; this generator runs bare source through CPython.
        if (!lvl.sol || lvl.files || lvl.game || lvl.web || lvl.sql || lvl.req || ch.lib) continue;
        if (!Array.isArray(lvl.tests) || lvl.tests.length !== 1) continue;
        const t = lvl.tests[0];
        const expected = typeof t === "string" ? t : t.exp;
        const hasInput = typeof t === "object" && t.in !== undefined;
        if (expected === undefined || hasInput) continue;

        const src = runnableSource(track.slug, lvl);
        const exp = norm(expected);
        if (!exp) continue;
        const codeLines = src.split("\n").filter(isCodeLine).length;
        // Too few clickable lines makes it a coin flip; too many is a slog.
        if (codeLines < 5 || codeLines > 25) continue;

        out.push({ slug: track.slug, id, name: lvl.name, src, exp, difficulty: track.difficulty || 1 });
      }
    }
  }
  return out;
}

// --- main ------------------------------------------------------------------

const levels = loadLevels();
console.log(`eligible levels: ${levels.length}  (python: ${PY})`);

const stats = { equivalent: 0, hang: 0, flaky: 0, blank: 0, SILENT: 0, RUNTIME: 0, SYNTAX: 0, baselineFail: 0 };
const perOperator = {};
const puzzles = [];

for (const level of levels) {
  // Confirm the unmutated program really produces the recorded output, and does
  // so deterministically. Anything set/dict-ordered would make a mutant's
  // recorded output unreliable.
  const b1 = run(level.src);
  const b2 = run(level.src);
  if (norm(b1.stdout) !== level.exp || b1.stdout !== b2.stdout) {
    stats.baselineFail++;
    continue;
  }

  const lines = level.src.split("\n");
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isCodeLine(lines[i])) continue;
    for (const op of OPERATORS) {
      let replaced = null;
      try { replaced = op.fn(lines[i]); } catch { replaced = null; }
      if (replaced && replaced !== lines[i]) candidates.push({ i, text: replaced, op: op.id });
    }
  }

  const accepted = [];
  for (const c of candidates.slice(0, 14)) {
    const mutated = lines.slice();
    mutated[c.i] = c.text;
    const code = mutated.join("\n");

    const r = run(code);
    perOperator[c.op] ??= { tried: 0, kept: 0, equivalent: 0 };
    perOperator[c.op].tried++;

    if (r.timedOut) { stats.hang++; continue; }
    if (norm(r.stdout) === level.exp && !r.stderr.trim()) {
      stats.equivalent++; perOperator[c.op].equivalent++; continue;
    }
    const cls = classify(r);
    // "prints nothing" is indistinguishable from "never ran" for the player.
    if (cls === "SILENT" && !norm(r.stdout)) { stats.blank++; continue; }

    const r2 = run(code);
    if (r2.stdout !== r.stdout) { stats.flaky++; continue; }

    stats[cls]++;
    perOperator[c.op].kept++;
    accepted.push({ ...c, cls, actual: norm(r.stdout) });
  }

  if (!accepted.length) continue;

  // Prefer a silently-wrong program: a crash or a syntax error is far easier to
  // spot than code that runs and quietly does the wrong thing.
  const rank = { SILENT: 0, RUNTIME: 1, SYNTAX: 2 };
  accepted.sort((a, b) => rank[a.cls] - rank[b.cls]);
  const chosen = accepted[0];

  puzzles.push({
    t: level.slug,
    l: level.id,
    n: level.name,
    h: srcHash(level.src),
    i: chosen.i,
    s: chosen.text,
    a: [chosen.i],
    c: chosen.cls,
    w: chosen.actual,
    d: chosen.cls === "SYNTAX" ? 1 : level.difficulty,
    o: chosen.op,
  });
}

// Syntax errors are the easiest class to spot; keep them a garnish.
const syntax = puzzles.filter((p) => p.c === "SYNTAX");
const others = puzzles.filter((p) => p.c !== "SYNTAX");
const syntaxCap = Math.floor(others.length * 0.18);
const deck = [...others, ...syntax.slice(0, syntaxCap)].sort(
  (a, b) => a.t.localeCompare(b.t) || a.l - b.l || a.i - b.i
);

console.log("\n--- outcomes ---");
console.table(stats);
console.log("\n--- per operator ---");
console.table(perOperator);
console.log(`\npuzzles: ${deck.length}  (silent ${deck.filter(p=>p.c==="SILENT").length}, runtime ${deck.filter(p=>p.c==="RUNTIME").length}, syntax ${deck.filter(p=>p.c==="SYNTAX").length})`);

if (REPORT_ONLY) {
  console.log("\n--report: nothing written.");
} else {
  writeFileSync(OUT, JSON.stringify({ version: 1, puzzles: deck }, null, 0) + "\n");
  console.log(`\nwrote ${OUT} (${(JSON.stringify(deck).length / 1024).toFixed(1)} kB raw)`);
}
