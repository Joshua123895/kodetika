import { traceRun, TRACE_START, TRACE_END } from "./traceRun";

// Shared harness for the two geometry visualizations (k-means and k-NN).
// The gradient harness only captures flat numeric lists, but these levels work
// with lists of coordinate PAIRS, so this one serializes both shapes.
//
// Like the gradient harness it wraps the program in `_run()` (sys.settrace emits
// no line events for the already-running module frame) and watches every frame
// rather than one named function.
const NAMES = ["points", "centroids", "query", "labels", "k"];

export function buildPointsHarness(code) {
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
        if len(items) == 0 or len(items) > 200:
            return None
        if all(_num(x) for x in items):
            return list(items)
        out = []
        for x in items:
            if isinstance(x, (list, tuple)) and 2 <= len(x) <= 4 and all(_num(y) for y in x):
                out.append([float(y) for y in x])
            else:
                return None
        return out
    return None

def _tr(frame, event, arg):
    if event != 'line' or len(_SNAPS) >= 4000:
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

const isPairs = (v) => Array.isArray(v) && v.length > 0 && Array.isArray(v[0]) && v[0].length >= 2;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Which centroid each point belongs to. Derived rather than captured: the
// grouping is a pure function of the points and the centroids, so there is no
// need to make the student store it under a particular name.
export function assignPoints(points, centroids) {
  return points.map((p) => {
    let best = 0;
    for (let c = 1; c < centroids.length; c++) {
      if (dist(p, centroids[c]) < dist(p, centroids[best])) best = c;
    }
    return best;
  });
}

export function kmeansTraceToStates(snaps) {
  if (!Array.isArray(snaps) || snaps.length === 0) return [];
  let points = null;
  for (const s of snaps) {
    if (isPairs(s.points)) {
      points = s.points;
      break;
    }
  }
  if (!points) return [];

  // One state per distinct centroid configuration, in the order it was held.
  const configs = [];
  let last = null;
  for (const s of snaps) {
    if (!isPairs(s.centroids)) continue;
    const key = JSON.stringify(s.centroids);
    if (key === last) continue;
    configs.push(s.centroids);
    last = key;
  }
  if (configs.length === 0) return [];

  return configs.map((centroids, i) => ({
    points,
    centroids,
    assign: assignPoints(points, centroids),
    step: i,
    total: configs.length,
  }));
}

export function knnTraceToStates(snaps) {
  if (!Array.isArray(snaps) || snaps.length === 0) return [];
  let points = null;
  let labels = null;
  let query = null;
  let k = 1;
  for (const s of snaps) {
    if (points === null && isPairs(s.points)) points = s.points;
    if (labels === null && Array.isArray(s.labels) && !isPairs(s.labels)) labels = s.labels;
    if (query === null && Array.isArray(s.query) && !isPairs(s.query) && s.query.length >= 2) query = s.query;
    if (typeof s.k === "number") k = s.k;
  }
  if (!points || !query) return [];
  if (!labels) labels = points.map(() => 0);

  const measured = points.map((p, i) => ({ i, d: dist(query, p), label: labels[i] }));
  const order = [...measured].sort((a, b) => a.d - b.d);
  const kk = Math.max(1, Math.min(k, points.length));
  const nearest = order.slice(0, kk).map((m) => m.i);

  // Reveal one distance per step, then a final frame with the k nearest chosen.
  const states = points.map((_, i) => ({
    points,
    labels,
    query,
    k: kk,
    distances: measured.map((m) => m.d),
    revealed: i + 1,
    nearest: [],
    winner: null,
    step: i,
    total: points.length + 1,
  }));

  const votes = {};
  for (const idx of nearest) votes[labels[idx]] = (votes[labels[idx]] || 0) + 1;
  let winner = null;
  let bestCount = -1;
  for (const key of Object.keys(votes).sort()) {
    if (votes[key] > bestCount) {
      bestCount = votes[key];
      winner = key;
    }
  }

  states.push({
    points,
    labels,
    query,
    k: kk,
    distances: measured.map((m) => m.d),
    revealed: points.length,
    nearest,
    winner,
    step: points.length,
    total: points.length + 1,
  });
  return states;
}

export async function runKmeansViz(code) {
  return kmeansTraceToStates(await traceRun(buildPointsHarness(code)));
}

export async function runKnnViz(code) {
  return knnTraceToStates(await traceRun(buildPointsHarness(code)));
}
