import { traceRun, TRACE_START, TRACE_END } from "./traceRun";

// Runs the student's real search/two-pointer/sliding-window code and captures
// the target function's local variables after every line (via sys.settrace),
// so the animation shows their actual pointers moving — whatever they named
// them, however they wrote the loop. Falls back to searchInterp.js if the code
// can't be traced.

// The def that gets called by the driver (the last defined-function call).
function detectCalledFn(code) {
  const defs = [...code.matchAll(/^\s*def\s+(\w+)\s*\(/gm)].map((m) => m[1]);
  if (defs.length === 0) return null;
  let last = null;
  const callRe = /(\w+)\s*\(/g;
  let m;
  while ((m = callRe.exec(code)) !== null) {
    if (defs.includes(m[1])) last = m[1];
  }
  return last || defs[defs.length - 1];
}

export function buildSearchHarness(code) {
  const fn = detectCalledFn(code);
  if (!fn) return null;
  const indented = code.split("\n").map((l) => "    " + l).join("\n");
  const harness = `import json, sys
_SNAPS = []
_TARGET = ${JSON.stringify(fn)}
def _tr(frame, event, arg):
    if frame.f_code.co_name != _TARGET:
        return None
    if event == 'line':
        _loc = {}
        for _k, _v in list(frame.f_locals.items()):
            if isinstance(_v, bool) or isinstance(_v, (int, float, str)):
                _loc[_k] = _v
            elif isinstance(_v, list) and len(_v) <= 100:
                try:
                    if all(isinstance(_x, (int, float, str, bool)) for _x in _v):
                        _loc[_k] = list(_v)
                except Exception:
                    pass
        _SNAPS.append(_loc)
    elif event == 'return':
        _SNAPS.append({"__return__": arg if isinstance(arg, (int, float, str, bool)) else None})
    return _tr
sys.settrace(_tr)
try:
${indented}
except Exception:
    pass
sys.settrace(None)
print("${TRACE_START}" + json.dumps(_SNAPS) + "${TRACE_END}")
`;
  return { harness, fn };
}

const POINTER_NAMES = new Set([
  "low", "high", "mid", "middle", "left", "right", "l", "r", "lo", "hi",
  "i", "j", "start", "end", "p", "q", "first", "last",
]);

export function searchTraceToStates(snaps) {
  if (!Array.isArray(snaps) || snaps.length === 0) return [];

  // The array is the longest list value seen across snapshots.
  let arrKey = null;
  let arrLen = 0;
  for (const s of snaps) {
    for (const [k, v] of Object.entries(s)) {
      if (Array.isArray(v) && v.length > arrLen) { arrKey = k; arrLen = v.length; }
    }
  }
  if (!arrKey) return [];

  const states = [];
  let ret;
  let labelled = false;
  for (const s of snaps) {
    // A __return__ snapshot ends one call. Label the state that call just
    // produced, so a run that searches more than once marks each outcome
    // where it happens instead of only the last one.
    if ("__return__" in s) {
      ret = s.__return__;
      if (applyOutcome(states[states.length - 1], ret)) labelled = true;
      continue;
    }
    const arr = Array.isArray(s[arrKey]) ? s[arrKey] : [];
    const items = arr.map((v, i) => ({ value: String(v), _id: i }));
    const pointers = {};
    const vars = {};
    for (const [k, v] of Object.entries(s)) {
      if (k === arrKey) continue;
      if (POINTER_NAMES.has(k) && Number.isInteger(v) && v >= 0 && v < arr.length) {
        pointers[k] = v;
      } else if (typeof v !== "object") {
        vars[k] = v;
      }
    }
    const lo = pick(pointers, ["low", "lo", "left", "l", "start"]);
    const hi = pick(pointers, ["high", "hi", "right", "r", "end"]);
    const activeRange = lo !== undefined && hi !== undefined ? [Math.min(lo, hi), Math.max(lo, hi)] : null;
    const compare = [];
    for (const p of ["mid", "middle", "i", "j"]) if (pointers[p] !== undefined) compare.push(pointers[p]);
    states.push({ items, pointers, activeRange, compare, vars, status: null, found: [] });
  }

  // Fallback for traces that never emit a __return__ snapshot: label the last
  // state from whatever return value was seen.
  if (!labelled) applyOutcome(states[states.length - 1], ret);
  return states;
}

// Describe one call's return value on the state it produced. Returns whether
// anything was written, so the caller knows a label was applied.
function applyOutcome(state, ret) {
  if (!state) return false;
  const n = state.items.length;
  if (typeof ret === "number" && Number.isInteger(ret) && ret >= 0 && ret < n) {
    state.status = `Found at index ${ret}`;
    state.found = [ret];
  } else if (ret === -1 || ret === false || ret === null) {
    state.status = "Not found";
  } else if (ret !== undefined) {
    state.status = `result = ${ret}`;
  } else {
    return false;
  }
  return true;
}

function pick(obj, names) {
  for (const n of names) if (obj[n] !== undefined) return obj[n];
  return undefined;
}

export async function runSearchViz(code) {
  const built = buildSearchHarness(code);
  if (!built) return null;
  const snaps = await traceRun(built.harness);
  const states = searchTraceToStates(snaps);
  return states.length > 1 ? states : null;
}
