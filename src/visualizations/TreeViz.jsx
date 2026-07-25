import { useState, useCallback, useEffect } from "react";
import { Network, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import { splitStatements } from "./parseUtils";
import { runTreeViz } from "./treeTrace";

// eslint-disable-next-line react-refresh/only-export-components -- exported for unit tests
export function parseTreeStates(code) {
  const lines = splitStatements(code);
  const treeVars = {};
  const states = [];
  let anonId = 0;

  const computeState = () => {
    const children = new Set();
    for (const name of Object.keys(treeVars)) {
      if (treeVars[name].left) children.add(treeVars[name].left);
      if (treeVars[name].right) children.add(treeVars[name].right);
    }
    let rootName = null;
    for (const name of Object.keys(treeVars)) {
      if (!children.has(name)) { rootName = name; break; }
    }

    const buildTreeNodes = (rootName) => {
      const node = treeVars[rootName];
      if (!node) return null;
      return {
        name: rootName,
        val: node.val,
        left: node.left ? buildTreeNodes(node.left) : null,
        right: node.right ? buildTreeNodes(node.right) : null,
      };
    };

    const tree = rootName ? buildTreeNodes(rootName) : null;
    return { treeVars: { ...treeVars }, tree, rootName };
  };

  const getIndent = (s) => s.length - s.trimStart().length;

  function applySubs(text, subs) {
    if (!subs) return text;
    let r = text;
    for (const [k, v] of Object.entries(subs)) {
      r = r.replace(new RegExp(`\\b${k}\\b`, "g"), v);
    }
    return r;
  }

  function collectBlock(allLines, startIdx, blockIndent) {
    const block = [];
    let j = startIdx;
    while (j < allLines.length && getIndent(allLines[j]) >= blockIndent) {
      block.push(allLines[j]);
      j++;
    }
    return { lines: block, nextIdx: j };
  }

  // Standard BST insert, simulated directly rather than interpreted from
  // the student's actual `insert_bst` body, the same "trust the
  // recognized call shape" approach LinkedListViz already uses for
  // insert_head/insert_tail/delete_node/search, since real recursive
  // evaluation with return-value threading is out of reach for this
  // line-based parser.
  function bstInsert(rootName, value) {
    if (!treeVars[rootName]) {
      treeVars[rootName] = { val: String(value), left: null, right: null };
      return;
    }
    let curName = rootName;
    while (true) {
      const node = treeVars[curName];
      const childKey = Number(value) < Number(node.val) ? "left" : "right";
      if (node[childKey]) { curName = node[childKey]; continue; }
      const newVar = `_bst_${value}_${++anonId}`;
      treeVars[newVar] = { val: String(value), left: null, right: null };
      node[childKey] = newVar;
      return;
    }
  }

  function execLine(rawLine) {
    const t = rawLine.trim();
    if (t.startsWith("#") || t.startsWith("class ") || t.startsWith("def ") || /\bself\./.test(t)) return;

    // Matches both a bare `root = TreeNode(1)` and a dotted assignment like
    // `root.left = TreeNode(2)` or `root.left.right = TreeNode(4)`, the
    // dotted path is resolved and linked as a child instead of being
    // (mis)parsed as a brand new top-level variable named "left"/"right".
    const init = t.match(/^([\w.]+)\s*=\s*(?:TreeNode|Node)\s*\(\s*(\d+)\s*\)$/);
    if (init) {
      const path = init[1].split(".");
      const val = init[2];
      if (path.length === 1) {
        treeVars[path[0]] = { val, left: null, right: null };
        states.push(computeState());
      } else {
        const attr = path[path.length - 1];
        if (attr === "left" || attr === "right") {
          let curName = path[0];
          for (let k = 1; k < path.length - 1 && curName; k++) {
            curName = treeVars[curName] ? treeVars[curName][path[k]] : null;
          }
          if (curName && treeVars[curName]) {
            const newVar = `_${path.join("_")}_${++anonId}`;
            treeVars[newVar] = { val, left: null, right: null };
            treeVars[curName][attr] = newVar;
            states.push(computeState());
          }
        }
      }
      return;
    }

    const link = t.match(/^(\w+)\.(left|right)\s*=\s*(\w+)$/);
    if (link && treeVars[link[1]] && treeVars[link[3]]) {
      treeVars[link[1]][link[2]] = link[3];
      states.push(computeState());
      return;
    }

    const bstCall = t.match(/^(\w+)\s*=\s*insert_bst\s*\(\s*\w+\s*,\s*(.+?)\s*\)$/);
    if (bstCall) {
      bstInsert(bstCall[1], bstCall[2]);
      states.push(computeState());
    }
  }

  states.push(computeState());

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const indent = getIndent(line);
    const t = line.trim();

    const lMatch = t.match(/^for\s+(\w+)\s+in\s+\[([^\]]*)\]\s*:$/);
    if (lMatch) {
      const vName = lMatch[1];
      const values = lMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
      const bodyIndent = indent + 1;
      const { lines: bodyLines, nextIdx } = collectBlock(lines, i + 1, bodyIndent);
      for (const val of values) {
        for (const bl of bodyLines) execLine(applySubs(bl, { [vName]: val }));
      }
      i = nextIdx;
      continue;
    }

    execLine(line);
    i++;
  }

  return states;
}

// Each subtree is laid out independently (leaves at x=0, a lone child offset
// half a slot so left/right stays visually distinguishable instead of a
// dead-vertical line, two children centered over their midpoint), then two
// sibling subtrees are merged by shifting the right one just far enough that
// its leftmost node clears the left subtree's rightmost node by NODE_SPACING.
// Tracking each subtree's [minX, maxX] footprint (not just its root's x) is
// what makes this safe: two single-child branches that are mirror images of
// each other (e.g. inserting [5, 3, 7, 2, 8] into a BST, where 3's only child
// is on its left and 7's only child is on its right) would otherwise land
// their parent nodes on the exact same x and render on top of each other;
// offsetting by a fixed half-slot alone doesn't see that collision coming.
const NODE_SPACING = 46;
const ROW_HEIGHT = 50;

function shiftSubtree(node, dx) {
  if (!node) return;
  node.x += dx;
  shiftSubtree(node.left, dx);
  shiftSubtree(node.right, dx);
}

// eslint-disable-next-line react-refresh/only-export-components -- shared with TraversalViz
export function layoutTree(root) {
  let maxDepth = 0;

  function visit(node, depth) {
    if (!node) return null;
    maxDepth = Math.max(maxDepth, depth);
    const left = visit(node.left, depth + 1);
    const right = visit(node.right, depth + 1);
    const y = depth * ROW_HEIGHT + 25;
    // `name` is carried through so callers (e.g. traversal highlighting) can
    // map a laid-out node back to its source identity; the tree renderer
    // itself only reads val/x/y/left/right and ignores it.
    if (left && right) {
      const gap = NODE_SPACING - (right.minX - left.maxX);
      if (gap > 0) {
        shiftSubtree(right.node, gap);
        right.minX += gap;
        right.maxX += gap;
      }
      const x = (left.node.x + right.node.x) / 2;
      return { node: { name: node.name, val: node.val, x, y, left: left.node, right: right.node }, minX: left.minX, maxX: right.maxX };
    }
    if (left) {
      const x = left.node.x + NODE_SPACING / 2;
      return { node: { name: node.name, val: node.val, x, y, left: left.node, right: null }, minX: left.minX, maxX: Math.max(left.maxX, x) };
    }
    if (right) {
      const x = right.node.x - NODE_SPACING / 2;
      return { node: { name: node.name, val: node.val, x, y, left: null, right: right.node }, minX: Math.min(right.minX, x), maxX: right.maxX };
    }
    return { node: { name: node.name, val: node.val, x: 0, y, left: null, right: null }, minX: 0, maxX: 0 };
  }

  const result = visit(root, 0);
  const positioned = result ? result.node : null;
  const rootX = positioned ? positioned.x : 0;
  // The tree can lean further to one side of the root than the other (e.g. a
  // deep left subtree with a lone right leaf). Sizing the viewBox symmetrically
  // around the root's own x, rather than around the overall footprint, keeps
  // the root lined up with the "root" name label above it, which is centered
  // independently via flexbox.
  const halfSpan = result
    ? Math.max(rootX - result.minX, result.maxX - rootX, NODE_SPACING / 2)
    : NODE_SPACING / 2;

  return {
    positioned,
    rootX,
    halfSpan,
    height: maxDepth * ROW_HEIGHT + 50,
  };
}

function TreeNodeBox({ node }) {
  if (!node) return null;
  const r = 18;

  return (
    <g>
      {node.left && (
        <>
          <line x1={node.x} y1={node.y + r} x2={node.left.x} y2={node.left.y - r} stroke="var(--border-strong)" strokeWidth={1.5} />
          <TreeNodeBox node={node.left} />
        </>
      )}
      {node.right && (
        <>
          <line x1={node.x} y1={node.y + r} x2={node.right.x} y2={node.right.y - r} stroke="var(--border-strong)" strokeWidth={1.5} />
          <TreeNodeBox node={node.right} />
        </>
      )}
      <circle cx={node.x} cy={node.y} r={r} fill="#7AA2F715" stroke="#7AA2F7" strokeWidth={2} style={{ animation: "viz-in 0.25s ease-out both" }} />
      <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="middle" fill="var(--text)" fontSize={12} fontFamily="monospace" fontWeight="bold">{node.val}</text>
    </g>
  );
}

function VizBody({ state, ghostVars = {} }) {
  const { treeVars, tree, rootName } = state;
  const names = Object.keys(treeVars);

  if (names.length === 0 && Object.keys(ghostVars).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-50 text-center p-4" style={{ color: "var(--text-muted)" }}>
        <Network size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Create tree nodes to see them<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>root = Node(5)</code></p>
      </div>
    );
  }

  const { positioned, rootX, halfSpan, height: svgHeight } = tree ? layoutTree(tree) : { positioned: null, rootX: 0, halfSpan: NODE_SPACING / 2, height: 40 };
  // Extra margin so the outermost circles' radius + stroke don't get clipped
  // by the viewBox edges.
  const pad = 22;
  const viewMinX = rootX - halfSpan - pad;
  const viewWidth = (halfSpan + pad) * 2;

  return (
    <div className="flex flex-col items-center">
      {tree && (
        <>
          <div className="text-xs font-bold mb-2" style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}>
            {rootName}
          </div>
          <svg
            viewBox={`${viewMinX} 0 ${viewWidth} ${svgHeight}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: "100%", height: "auto", maxWidth: viewWidth, display: "block" }}
          >
            <TreeNodeBox node={positioned} />
          </svg>
        </>
      )}
      {Object.keys(ghostVars).length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 justify-center">
          {Object.values(ghostVars).map((node) => (
            <div
              key={node.var}
              className="rounded-lg px-3 py-1.5 text-center font-mono text-xs font-bold"
              style={{
                animation: "viz-out 0.2s ease-in both",
                background: "var(--bg)",
                border: "2px solid var(--border)",
                color: "var(--text-muted)",
                opacity: 0.5,
              }}
            >
              <div>{node.val}</div>
              <div className="text-[9px] font-normal" style={{ color: "var(--text-muted)" }}>{node.var}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TreeViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);
  const [ghostVars, setGhostVars] = useState({});
  const [prevState, setPrevState] = useState(null);

  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = null;
    try {
      states = await runTreeViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseTreeStates(code);
    setParsed({ code, states });
    playback.configure(states);
    setLoading(false);
    return states;
  }, [code, parsed, playback]);

  const currentState = parsed
    ? parsed.states[Math.max(0, Math.min(playback.step, parsed.states.length - 1))]
    : null;

  // Derive which vars just disappeared by comparing against the previously
  // rendered state, right here during render rather than in a useEffect,
  // React's documented pattern for adjusting state when a derived value
  // changes (tracked with useState, not a ref: refs can't be read during
  // render). The 300ms auto-clear below is the only genuine side effect
  // (a timer), so that's the only piece left in an effect.
  if (parsed && currentState !== prevState) {
    const oldState = prevState;
    setPrevState(currentState);
    if (oldState) {
      const prevVars = Object.keys(oldState.treeVars || {});
      const curVars = new Set(Object.keys(currentState.treeVars || {}));
      const removed = {};
      for (const v of prevVars) {
        if (!curVars.has(v)) removed[v] = oldState.treeVars[v];
      }
      setGhostVars(removed);
    }
  }

  useEffect(() => {
    if (Object.keys(ghostVars).length === 0) return;
    const timer = setTimeout(() => setGhostVars({}), 300);
    return () => clearTimeout(timer);
  }, [ghostVars]);

  const handleToggle = useCallback(async () => {
    if (playback.playing) {
      playback.pause();
      return;
    }
    await ensureParsed();
    playback.play();
  }, [playback, ensureParsed]);

  const handleStep = useCallback(async () => {
    await ensureParsed();
    playback.stepForward();
  }, [playback, ensureParsed]);

  if (!parsed) {
    return (
      <div className="flex items-center justify-center h-full min-h-50">
        <button
          onClick={handleToggle}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 text-xs px-4 py-2 rounded font-bold hover:brightness-110 active:brightness-90 active:scale-[0.98] disabled:opacity-60"
          style={{
            background: "#6AAE6F",
            color: "#fff",
          }}
        >
          {loading ? "running…" : (<><Play size={12} strokeWidth={3} fill="currentColor" /> Run</>)}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <VizControls
        onToggle={handleToggle}
        onStep={handleStep}
        onPrev={playback.stepBackward}
        playing={playback.playing}
        step={playback.step}
        total={playback.total}
      />
      <VizBody state={currentState} ghostVars={ghostVars} />
    </div>
  );
}
