import { useState, useCallback } from "react";
import { ListTree, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import { layoutTree } from "./TreeViz";
import { parseTraversalStates, TRAVERSAL_LABEL } from "./treeTraversalInterp";
import { runTraversalViz } from "./treeTraversalTrace";

const CURRENT = "#E9B44C"; // node being visited right now
const VISITED = "#28CA41"; // already visited
const PENDING = "#7AA2F7"; // not yet reached

function NodeSVG({ node, visitedSet, currentName }) {
  if (!node) return null;
  const r = 18;
  const isCurrent = node.name === currentName;
  const isVisited = visitedSet.has(node.name);
  const color = isCurrent ? CURRENT : isVisited ? VISITED : PENDING;

  return (
    <g>
      {node.left && (
        <>
          <line x1={node.x} y1={node.y + r} x2={node.left.x} y2={node.left.y - r} stroke="var(--border-strong)" strokeWidth={1.5} />
          <NodeSVG node={node.left} visitedSet={visitedSet} currentName={currentName} />
        </>
      )}
      {node.right && (
        <>
          <line x1={node.x} y1={node.y + r} x2={node.right.x} y2={node.right.y - r} stroke="var(--border-strong)" strokeWidth={1.5} />
          <NodeSVG node={node.right} visitedSet={visitedSet} currentName={currentName} />
        </>
      )}
      <circle
        cx={node.x} cy={node.y} r={r}
        fill={color + (isCurrent ? "35" : isVisited ? "22" : "12")}
        stroke={color}
        strokeWidth={isCurrent ? 3 : 2}
        style={{ transition: "fill 150ms, stroke 150ms" }}
      />
      <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="middle" fill="var(--text)" fontSize={12} fontFamily="monospace" fontWeight="bold">{node.val}</text>
    </g>
  );
}

function VizBody({ state }) {
  if (!state || !state.tree) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-50 text-center p-4" style={{ color: "var(--text-muted)" }}>
        <ListTree size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Build a tree and traverse it<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>root = TreeNode(2)</code></p>
      </div>
    );
  }

  const { positioned, rootX, halfSpan, height } = layoutTree(state.tree);
  const pad = 22;
  const viewMinX = rootX - halfSpan - pad;
  const viewWidth = (halfSpan + pad) * 2;
  const visitedSet = new Set(state.visited);

  return (
    <div className="flex flex-col items-center">
      <div className="text-[11px] font-bold mb-1" style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}>
        {TRAVERSAL_LABEL[state.type] || ""}
      </div>
      <svg
        viewBox={`${viewMinX} 0 ${viewWidth} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", maxWidth: viewWidth, display: "block" }}
      >
        <NodeSVG node={positioned} visitedSet={visitedSet} currentName={state.currentName} />
      </svg>
      <div className="flex flex-wrap items-center justify-center gap-1 mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <span className="text-[10px] mr-1" style={{ color: "var(--text-muted)" }}>visited:</span>
        {state.sequence.length === 0 && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>-</span>}
        {state.sequence.map((v, i) => {
          const isLast = i === state.sequence.length - 1;
          return (
            <span
              key={i}
              className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded"
              style={{
                background: (isLast ? CURRENT : VISITED) + "20",
                color: isLast ? CURRENT : VISITED,
              }}
            >
              {v}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function TraversalViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);

  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = null;
    try {
      states = await runTraversalViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseTraversalStates(code);
    setParsed({ code, states });
    playback.configure(states);
    setLoading(false);
    return states;
  }, [code, parsed, playback]);

  const handleToggle = useCallback(async () => {
    if (playback.playing) { playback.pause(); return; }
    await ensureParsed();
    playback.play();
  }, [playback, ensureParsed]);

  const handleStep = useCallback(async () => { await ensureParsed(); playback.stepForward(); }, [playback, ensureParsed]);

  if (!parsed) {
    return (
      <div className="flex items-center justify-center h-full min-h-50">
        <button
          onClick={handleToggle}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 text-xs px-4 py-2 rounded font-bold hover:brightness-110 active:brightness-90 active:scale-[0.98] disabled:opacity-60"
          style={{ background: "#6AAE6F", color: "#fff" }}
        >
          {loading ? "running…" : (<><Play size={12} strokeWidth={3} fill="currentColor" /> Run</>)}
        </button>
      </div>
    );
  }

  const idx = Math.max(0, Math.min(playback.step, parsed.states.length - 1));
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
      <VizBody state={parsed.states[idx]} />
    </div>
  );
}
