import { useState, useCallback } from "react";
import { Network, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import { runTreeModelViz } from "./treeModelTrace";

const ACTIVE = "#E9B44C";
const LEAF = "#67C587";
const IDLE = "#5a6070";

const W = 250;
const H = 175;
const PAD = 20;

function Body({ state }) {
  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4" style={{ color: "var(--text-muted)" }}>
        <Network size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">
          Build a tree to see its structure
          <br />
          <code className="text-xs" style={{ color: "var(--text-secondary)" }}>{'{"feature": 0, "threshold": 2.5, ...}'}</code>
        </p>
      </div>
    );
  }

  const { layout, sample, path, leaf } = state;
  const { nodes, edges, width, depth } = layout;
  const sx = (x) => PAD + (width > 0 ? (x / width) * (W - 2 * PAD) : (W - 2 * PAD) / 2);
  const sy = (d) => PAD + (depth > 0 ? (d / depth) * (H - 2 * PAD - 14) : 0);

  // A node is on the taken route when its path is a prefix of the sample's.
  const onPath = (p) => path !== null && path.startsWith(p);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: "auto", display: "block" }}>
        {edges.map((e, i) => {
          const lit = onPath(e.to.path);
          return (
            <line
              key={`e${i}`}
              x1={sx(e.from.x)}
              y1={sy(e.from.depth)}
              x2={sx(e.to.x)}
              y2={sy(e.to.depth)}
              stroke={lit ? ACTIVE : IDLE}
              strokeWidth={lit ? 2 : 1}
              opacity={lit ? 0.95 : 0.4}
            />
          );
        })}
        {nodes.map((n, i) => {
          const lit = onPath(n.path);
          const color = n.leaf ? (lit ? LEAF : IDLE) : lit ? ACTIVE : IDLE;
          return (
            <g key={`n${i}`}>
              {n.leaf ? (
                <rect x={sx(n.x) - 10} y={sy(n.depth) - 8} width="20" height="16" rx="4" fill="var(--bg)" stroke={color} strokeWidth={lit ? 2 : 1.5} />
              ) : (
                <circle cx={sx(n.x)} cy={sy(n.depth)} r="11" fill="var(--bg)" stroke={color} strokeWidth={lit ? 2 : 1.5} />
              )}
              <text x={sx(n.x)} y={sy(n.depth) + 3} fontSize="7" fill={lit ? "var(--text)" : "var(--text-muted)"} textAnchor="middle" fontFamily="monospace">
                {n.leaf ? n.node.leaf : `x${n.node.feature}`}
              </text>
              {!n.leaf && (
                <text x={sx(n.x)} y={sy(n.depth) - 14} fontSize="6.5" fill="var(--text-muted)" textAnchor="middle" fontFamily="monospace">
                  &lt;{n.node.threshold}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap justify-center gap-1.5 mt-2">
        {sample && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", color: "var(--text)" }}>
            [{sample.join(", ")}]
          </span>
        )}
        {path && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: `1px solid ${ACTIVE}`, color: "var(--text)" }}>
            {path.split("").join("→")}
          </span>
        )}
      </div>

      <div className="text-[11px] font-mono font-bold mt-2 pt-2 w-full text-center" style={{ borderTop: "1px solid var(--border-strong)", color: leaf !== null ? LEAF : "var(--text-muted)", minHeight: 14 }}>
        {leaf !== null ? `class ${leaf}` : `${nodes.length} nodes, depth ${depth}`}
      </div>
    </div>
  );
}

export default function TreeModelViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);
  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states;
    try {
      states = await runTreeModelViz(code);
    } catch {
      states = [];
    }
    setParsed({ code, states });
    playback.configure(states);
    setLoading(false);
    return states;
  }, [code, parsed, playback]);

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
      <div className="flex items-center justify-center h-full min-h-[200px]">
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
      <Body state={parsed.states[idx]} />
    </div>
  );
}
