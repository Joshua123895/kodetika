import { traceRun, TRACE_START, TRACE_END } from "./traceRun";

// Animates gradient descent from the student's REAL executed Python.
//
// Two things make this harness different from buildSettraceHarness:
//  1. The whole program is wrapped in `_run()`. sys.settrace only emits line
//     events for frames ENTERED AFTER it is set, so module-level code (which is
//     where these levels put their training loop) would otherwise be invisible.
//  2. It does NOT filter to a single function name. The loop may sit at the top
//     level (The Update Step, Convergence) or inside a helper such as
//     `train(lr, steps)` (The Learning Rate), so every frame is watched and the
//     interesting scalars are picked out wherever they live.
const SCALARS = ["w", "b", "lr", "loss", "step", "steps"];
const SERIES = ["xs", "ys"];

export function buildGradientHarness(code) {
  const indented = code
    .split("\n")
    .map((l) => "        " + l)
    .join("\n");
  return `import json, sys

_SNAPS = []
_SCALARS = ${JSON.stringify(SCALARS)}
_SERIES = ${JSON.stringify(SERIES)}

def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)

def _tr(frame, event, arg):
    if event != 'line' or len(_SNAPS) >= 4000:
        return _tr
    loc = frame.f_locals
    snap = {}
    for k in _SCALARS:
        v = loc.get(k)
        if _num(v):
            snap[k] = v
    for k in _SERIES:
        v = loc.get(k)
        if isinstance(v, list) and 0 < len(v) <= 200 and all(_num(x) for x in v):
            snap[k] = list(v)
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

// Mean squared error of y = w*x on the captured data, so the curve the student
// is descending is computed from their own numbers.
export function lossAt(xs, ys, w) {
  if (!xs || !ys || xs.length === 0) return 0;
  const n = Math.min(xs.length, ys.length);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i] - w * xs[i];
    total += r * r;
  }
  return total / n;
}

export function gradientTraceToStates(snaps) {
  if (!Array.isArray(snaps) || snaps.length === 0) return [];

  // The dataset: first snapshot that carries both series.
  let xs = null;
  let ys = null;
  for (const s of snaps) {
    if (Array.isArray(s.xs) && Array.isArray(s.ys)) {
      xs = s.xs;
      ys = s.ys;
      break;
    }
  }
  if (!xs || !ys) return [];

  // One state per DISTINCT value of w, in the order it was held. A line event
  // fires for every line in scope, so the same w repeats many times; collapsing
  // runs turns that into one animation step per actual update.
  const steps = [];
  let last = null;
  for (const s of snaps) {
    if (!Object.prototype.hasOwnProperty.call(s, "w")) continue;
    const w = s.w;
    if (!Number.isFinite(w)) continue;
    if (last !== null && Math.abs(w - last) < 1e-12) continue;
    steps.push({ w, lr: s.lr });
    last = w;
  }
  if (steps.length === 0) return [];

  // Curve domain: wide enough to hold every visited w plus the minimum, but
  // clamped so one diverging run (The Learning Rate reaches ~1300) cannot
  // flatten the interesting part into a horizontal line.
  const visited = steps.map((s) => s.w);
  const spread = Math.max(...visited.map(Math.abs), 3);
  const half = Math.min(spread * 1.2, 8);
  const lo = -half;
  const hi = half;
  const curve = [];
  const SAMPLES = 80;
  for (let i = 0; i <= SAMPLES; i++) {
    const w = lo + ((hi - lo) * i) / SAMPLES;
    curve.push({ w, loss: lossAt(xs, ys, w) });
  }

  return steps.map((s, i) => ({
    xs,
    ys,
    curve,
    lo,
    hi,
    w: s.w,
    lr: s.lr,
    loss: lossAt(xs, ys, s.w),
    step: i,
    total: steps.length,
    offCurve: s.w < lo || s.w > hi,
    trail: steps.slice(0, i + 1).map((p) => ({ w: p.w, loss: lossAt(xs, ys, p.w) })),
  }));
}

export async function runGradientViz(code) {
  const snaps = await traceRun(buildGradientHarness(code));
  return gradientTraceToStates(snaps);
}
