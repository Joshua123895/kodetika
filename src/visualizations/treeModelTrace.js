import { traceRun, TRACE_START, TRACE_END } from "./traceRun";

// Draws the decision tree the student's program actually holds, and lights up
// the path a sample takes through it.
//
// Unlike the other ML harnesses this one serializes a NESTED dict (the tree),
// so it uses a small recursive serializer capped by depth rather than the flat
// list handling the others share. `node` is captured too, which is how the walk
// in Tree Prediction is followed one hop at a time.
export function buildTreeModelHarness(code) {
  const indented = code
    .split("\n")
    .map((l) => "        " + l)
    .join("\n");
  return `import json, sys

_SNAPS = []

def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)

def _tree(v, depth=0):
    if depth > 8 or not isinstance(v, dict):
        return None
    out = {}
    for k in ("feature", "threshold", "leaf"):
        if k in v and _num(v[k]):
            out[k] = v[k]
    for k in ("left", "right"):
        if k in v:
            child = _tree(v[k], depth + 1)
            if child is None:
                return None
            out[k] = child
    if not out:
        return None
    return out

def _sample(v):
    if isinstance(v, (list, tuple)) and 0 < len(v) <= 16 and all(_num(x) for x in v):
        return [float(x) for x in v]
    return None

def _tr(frame, event, arg):
    if event != 'line' or len(_SNAPS) >= 3000:
        return _tr
    loc = frame.f_locals
    snap = {}
    for name in ("tree", "node"):
        if name in loc:
            t = _tree(loc[name])
            if t is not None:
                snap[name] = t
    for name in ("sample", "s"):
        if name in loc:
            sm = _sample(loc[name])
            if sm is not None:
                snap["sample"] = sm
                break
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

// Lay the tree out on a grid: x by in-order position, y by depth.
export function layoutTree(root) {
  const nodes = [];
  const edges = [];
  let nextX = 0;

  function walk(node, depth, path) {
    const isLeaf = Object.prototype.hasOwnProperty.call(node, "leaf");
    if (isLeaf) {
      const n = { x: nextX++, depth, node, path, leaf: true };
      nodes.push(n);
      return n;
    }
    const left = node.left ? walk(node.left, depth + 1, path + "L") : null;
    const self = { x: nextX++, depth, node, path, leaf: false };
    nodes.push(self);
    const right = node.right ? walk(node.right, depth + 1, path + "R") : null;
    if (left) {
      self.x = (left.x + (right ? right.x : left.x)) / 2;
      edges.push({ from: self, to: left });
    }
    if (right) edges.push({ from: self, to: right });
    return self;
  }

  if (!root) return { nodes: [], edges: [], width: 0, depth: 0 };
  walk(root, 0, "");
  const width = Math.max(...nodes.map((n) => n.x), 0);
  const depth = Math.max(...nodes.map((n) => n.depth), 0);
  return { nodes, edges, width, depth };
}

// The route a sample takes, as a string of L/R turns.
export function pathFor(root, sample) {
  if (!root || !sample) return null;
  let node = root;
  let path = "";
  let guard = 0;
  while (node && !Object.prototype.hasOwnProperty.call(node, "leaf") && guard++ < 32) {
    const goLeft = sample[node.feature] < node.threshold;
    path += goLeft ? "L" : "R";
    node = goLeft ? node.left : node.right;
  }
  return { path, leaf: node && node.leaf !== undefined ? node.leaf : null };
}

export function treeModelTraceToStates(snaps) {
  if (!Array.isArray(snaps) || snaps.length === 0) return [];
  let tree = null;
  for (const s of snaps) {
    if (s.tree) {
      tree = s.tree;
      break;
    }
  }
  if (!tree) return [];

  const layout = layoutTree(tree);

  // One state per distinct sample walked. Levels that only build a tree still
  // get a single state showing its structure.
  const samples = [];
  let last = null;
  for (const s of snaps) {
    if (!s.sample) continue;
    const key = JSON.stringify(s.sample);
    if (key === last) continue;
    samples.push(s.sample);
    last = key;
  }

  if (samples.length === 0) {
    return [{ tree, layout, sample: null, path: null, leaf: null, step: 0, total: 1 }];
  }
  return samples.map((sample, i) => {
    const r = pathFor(tree, sample);
    return {
      tree,
      layout,
      sample,
      path: r ? r.path : null,
      leaf: r ? r.leaf : null,
      step: i,
      total: samples.length,
    };
  });
}

export async function runTreeModelViz(code) {
  return treeModelTraceToStates(await traceRun(buildTreeModelHarness(code)));
}
