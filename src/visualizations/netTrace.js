import { traceRun, TRACE_START, TRACE_END } from "./traceRun";

// Animates a small neural network from the student's REAL executed Python.
//
// The network is drawn from whatever the program actually holds: `w1` (a list
// of per-unit weight lists), `w2` (the output weights), the biases, and the
// live activations `h` and `out`. Because those names are read from the frame
// rather than assumed, a level that only does a forward pass and a level that
// trains for 6000 epochs both animate with the same harness.
const NAMES = ["w1", "w2", "b1", "b2", "h", "out", "x", "d_out", "d_h", "epoch", "target"];

export function buildNetHarness(code) {
  const indented = code
    .split("\n")
    .map((l) => "        " + l)
    .join("\n");
  return `import json, sys

_SNAPS = []
_NAMES = ${JSON.stringify(NAMES)}

def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)

def _ser(v):
    if _num(v):
        return v
    if isinstance(v, (list, tuple)):
        items = list(v)
        if len(items) == 0 or len(items) > 64:
            return None
        if all(_num(x) for x in items):
            return [float(x) for x in items]
        out = []
        for x in items:
            if isinstance(x, (list, tuple)) and len(x) <= 16 and all(_num(y) for y in x):
                out.append([float(y) for y in x])
            else:
                return None
        return out
    return None

def _tr(frame, event, arg):
    # The forward function usually ends with a return of sigmoid(out), so the
    # variable named out still holds the PRE-activation sum. Capture the
    # returned value instead, but only from a frame that has the hidden
    # activations in scope, so the many sigmoid() returns are ignored.
    if event == 'return' and _num(arg) and 'h' in frame.f_locals:
        _SNAPS.append({"out": float(arg)})
        return _tr
    if event != 'line' or len(_SNAPS) >= 3000:
        return _tr
    loc = frame.f_locals
    snap = {}
    for k in _NAMES:
        if k in loc:
            s = _ser(loc[k])
            if s is not None:
                snap[k] = s
    if snap:
        _SNAPS.append(snap)
    return _tr

def _run():
${indented}

sys.settrace(_tr)
try:
    _run()
except Exception:
    pass
sys.settrace(None)
print("${TRACE_START}" + json.dumps(_SNAPS) + "${TRACE_END}")
`;
}

const isMatrix = (v) => Array.isArray(v) && v.length > 0 && Array.isArray(v[0]);
const isVec = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number");

export function netTraceToStates(snaps) {
  if (!Array.isArray(snaps) || snaps.length === 0) return [];

  // Carry the most recent value of each field forward: a line event only shows
  // the names bound in that frame, so a snapshot may contain h but not w1.
  const cur = {};
  const frames = [];
  for (const s of snaps) {
    if (isMatrix(s.w1)) cur.w1 = s.w1;
    if (isVec(s.w2)) cur.w2 = s.w2;
    if (isVec(s.b1)) cur.b1 = s.b1;
    if (typeof s.b2 === "number") cur.b2 = s.b2;
    if (isVec(s.h)) cur.h = s.h;
    if (typeof s.out === "number") cur.out = s.out;
    if (isVec(s.x)) cur.x = s.x;
    if (typeof s.epoch === "number") cur.epoch = s.epoch;
    if (typeof s.target === "number") cur.target = s.target;
    if (!cur.w1 || !cur.w2) continue;
    frames.push({
      w1: cur.w1,
      w2: cur.w2,
      b1: cur.b1 || cur.w1.map(() => 0),
      b2: cur.b2 ?? 0,
      h: cur.h || null,
      out: cur.out ?? null,
      x: cur.x || null,
      epoch: cur.epoch ?? null,
      target: cur.target ?? null,
    });
  }
  if (frames.length === 0) return [];

  // Collapse consecutive identical frames, then sample so a 6000-epoch run
  // stays watchable while keeping the first and last.
  const distinct = [];
  let lastKey = null;
  for (const f of frames) {
    const key = JSON.stringify([f.w1, f.w2, f.b1, f.b2, f.h, f.out, f.x]);
    if (key === lastKey) continue;
    distinct.push(f);
    lastKey = key;
  }
  const MAX = 50;
  let kept = distinct;
  if (distinct.length > MAX) {
    kept = [];
    for (let i = 0; i < MAX - 1; i++) {
      kept.push(distinct[Math.floor((i * (distinct.length - 1)) / (MAX - 1))]);
    }
    kept.push(distinct[distinct.length - 1]);
  }

  return kept.map((f, i) => ({
    ...f,
    inputCount: f.w1[0] ? f.w1[0].length : 0,
    hiddenCount: f.w1.length,
    step: i,
    total: kept.length,
    error: f.out !== null && f.target !== null ? f.out - f.target : null,
  }));
}

export async function runNetViz(code) {
  return netTraceToStates(await traceRun(buildNetHarness(code)));
}
