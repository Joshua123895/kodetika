import { traceRun, TRACE_START, TRACE_END } from "./traceRun";

// Runs the student's actual sorting code and captures every list read/write,
// then turns that into the bar animation. Because it executes their real
// Python (in Pyodide), it handles ANY way they wrote the algorithm — optimized
// bubble sort with a `swapped` flag, odd variable names, early `break`, etc. —
// which the pattern-matching interpreter in sortInterp.js could not.

// Find the sort function to call and the array literal to feed it.
export function detectSortTarget(code) {
  const defs = [...code.matchAll(/^\s*def\s+(\w+)\s*\(/gm)].map((m) => m[1]);
  if (defs.length === 0) return null;
  const nums = (s) => s.split(",").map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));

  // Inline literal: e.g. print(bubble_sort([5, 2, 9, 1, 5, 6]))
  const inlineCall = code.match(/(\w+)\s*\(\s*\[\s*(-?\d+(?:\s*,\s*-?\d+)*)\s*\]\s*\)/);
  if (inlineCall && defs.includes(inlineCall[1])) {
    return { fn: inlineCall[1], array: nums(inlineCall[2]) };
  }
  // Named array: nums = [..]  then  sort_fn(nums)
  const arrDef = code.match(/(\w+)\s*=\s*\[\s*(-?\d+(?:\s*,\s*-?\d+)*)\s*\]/);
  if (arrDef) {
    const array = nums(arrDef[2]);
    const call = code.match(new RegExp(`(\\w+)\\s*\\(\\s*${arrDef[1]}\\s*\\)`));
    if (call && defs.includes(call[1])) return { fn: call[1], array };
    return { fn: defs[0], array };
  }
  return null;
}

export function buildSortHarness(code) {
  const target = detectSortTarget(code);
  if (!target || target.array.length === 0) return null;
  // The student's code runs first (its own driver print is harmless). Then we
  // re-run the detected sort on an instrumented copy of the array so every
  // in-place read/write is recorded.
  const harness = `import json
${code}

_VT = []
class _VL(list):
    def __getitem__(self, _i):
        _r = list.__getitem__(self, _i)
        if isinstance(_i, int):
            _VT.append([0, _i, list(self)])
        return _r
    def __setitem__(self, _i, _v):
        list.__setitem__(self, _i, _v)
        if isinstance(_i, int):
            _VT.append([1, _i, list(self)])

_va = _VL(${JSON.stringify(target.array)})
try:
    ${target.fn}(_va)
except Exception:
    pass
print("${TRACE_START}" + json.dumps(_VT) + "${TRACE_END}")
`;
  return { harness, array: target.array };
}

// Trace events are [op, index, arraySnapshot] with op 0=read, 1=write.
// Reads are paired into "compare" frames (the dominant arr[j] vs arr[j+1]
// shape); consecutive writes are merged into one "swap"/"write" frame.
export function sortTraceToStates(trace, initialArray) {
  const mk = (arr) => arr.map((v, i) => ({ value: String(v), _id: i }));
  const states = [{ items: mk(initialArray), highlight: null }];
  let readBuf = [];
  let writeBuf = null;

  const flushReads = () => {
    if (readBuf.length === 0) return;
    const indices = [...new Set(readBuf.map((r) => r[1]))];
    states.push({ items: mk(readBuf[readBuf.length - 1][2]), highlight: { type: "compare", indices } });
    readBuf = [];
  };
  const flushWrites = () => {
    if (!writeBuf) return;
    const indices = [...writeBuf.indices];
    states.push({ items: mk(writeBuf.arr), highlight: { type: indices.length >= 2 ? "swap" : "write", indices } });
    writeBuf = null;
  };

  for (const ev of trace) {
    if (ev[0] === 0) {
      flushWrites();
      readBuf.push(ev);
      if (readBuf.length === 2) flushReads();
    } else {
      flushReads();
      if (!writeBuf) writeBuf = { indices: new Set(), arr: ev[2] };
      writeBuf.indices.add(ev[1]);
      writeBuf.arr = ev[2];
    }
  }
  flushReads();
  flushWrites();
  return states;
}

// ---------------------------------------------------------------------------
// Out-of-place sorts.
//
// The instrumented-list harness above only sees integer-indexed reads and
// writes on one list object, which is exactly what an in-place sort does.
// Recursive sorts that build new lists — the usual quick sort and merge sort —
// slice (not an int index), append to plain lists, and recurse on those, so
// nothing is recorded and the panel sits still. For those, trace the real
// execution at line level instead and animate the lists as they are built.

// Record every flat numeric list local, for every user-defined function, at
// every line. Recursion is included: each depth has its own locals, and a name
// holding a different list than last seen is what makes a frame.
export function buildOutOfPlaceHarness(code) {
  const defs = [...code.matchAll(/^\s*def\s+(\w+)\s*\(/gm)].map((m) => m[1]);
  if (defs.length === 0) return null;
  const indented = code.split("\n").map((l) => "    " + l).join("\n");
  return `import json, sys

_SNAPS = []
_FNS = set(${JSON.stringify(defs)})

def _flat(v):
    if not isinstance(v, list) or len(v) > 64:
        return None
    for _x in v:
        if isinstance(_x, bool) or not isinstance(_x, (int, float)):
            return None
    return list(v)

def _tr(frame, event, arg):
    if frame.f_code.co_name not in _FNS:
        return None
    if event == 'line':
        _loc = []
        for _k, _v in list(frame.f_locals.items()):
            _f = _flat(_v)
            if _f is not None:
                _loc.append([_k, _f])
        if _loc:
            _SNAPS.append(_loc)
    elif event == 'return':
        _f = _flat(arg)
        if _f is not None:
            _SNAPS.append([["__return__", _f]])
    return _tr

sys.settrace(_tr)
try:
${indented}
except Exception:
    pass
sys.settrace(None)
print("${TRACE_START}" + json.dumps(_SNAPS[:4000]) + "${TRACE_END}")
`;
}

// Turn per-line local snapshots into frames: one whenever a name holds a list
// it was not holding before. Appends are highlighted at the new element so the
// partition/merge being assembled is visible.
export function outOfPlaceTraceToStates(snaps, initialArray) {
  const mk = (arr) => arr.map((v, i) => ({ value: String(v), _id: i }));
  const states = [{ items: mk(initialArray), highlight: null }];
  const lastByName = new Map();
  // Returning from recursion re-exposes the parent's locals, which would
  // otherwise ping-pong the view between a parent list and its child. Keeping
  // the few most recently drawn lists and skipping repeats collapses that
  // back into forward progress.
  const recent = [initialArray.join(",")];
  const remember = (key) => {
    recent.push(key);
    if (recent.length > 3) recent.shift();
  };

  for (const snap of snaps) {
    for (const [name, value] of snap) {
      const key = value.join(",");
      if (lastByName.get(name) === key) continue;
      const prev = lastByName.get(name);
      lastByName.set(name, key);

      // An empty working list is a reset, not something worth a frame.
      if (value.length === 0) continue;
      // Don't redraw a list that is already on screen or just left it.
      if (recent.includes(key)) continue;

      const grewByOne =
        prev !== undefined && prev.split(",").length === value.length - 1 && key.startsWith(prev === "" ? "" : prev + ",");
      states.push({
        items: mk(value),
        highlight: grewByOne
          ? { type: "write", indices: [value.length - 1] }
          : { type: "compare", indices: [] },
      });
      remember(key);
    }
  }
  return states;
}

export async function runOutOfPlaceSortViz(code) {
  const target = detectSortTarget(code);
  const harness = buildOutOfPlaceHarness(code);
  if (!harness) return null;
  const snaps = await traceRun(harness);
  if (!Array.isArray(snaps) || snaps.length === 0) return null;
  return outOfPlaceTraceToStates(snaps, target ? target.array : []);
}

// Returns animation states from real execution, or null if the code can't be
// instrumented this way (caller then falls back to the JS interpreter).
export async function runSortViz(code) {
  const built = buildSortHarness(code);
  if (!built) return null;

  let states = null;
  try {
    const trace = await traceRun(built.harness);
    if (Array.isArray(trace) && trace.length > 0) {
      states = sortTraceToStates(trace, built.array);
    }
  } catch {
    // harness failed to run; the out-of-place attempt below may still work
  }

  // An out-of-place sort produces almost no indexed reads/writes, so a couple
  // of frames means "nothing actually moved" rather than a finished animation.
  if (!states || states.length < 3) {
    try {
      const alt = await runOutOfPlaceSortViz(code);
      if (alt && alt.length > (states ? states.length : 0)) return alt;
    } catch {
      // fall through to whatever the in-place attempt managed
    }
  }
  return states;
}
