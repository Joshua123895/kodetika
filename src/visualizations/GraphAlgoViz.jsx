import { useState, useCallback } from "react";
import { Network, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import { parseGraphAlgoStates, ALGO_LABEL } from "./graphAlgoInterp";
import { runGraphViz } from "./graphTrace";

const CURRENT = "#E9B44C";
const VISITED = "#28CA41";
const PENDING = "#7AA2F7";

function circularLayout(vertices, cx, cy, radius) {
  const n = vertices.length;
  return vertices.map((v, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return { name: v, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

function VizBody({ state }) {
  if (!state || state.vertices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-50 text-center p-4" style={{ color: "var(--text-muted)" }}>
        <Network size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Build a graph and run an algorithm<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>graph = {}</code></p>
      </div>
    );
  }

  const { vertices, edges, algo, weighted, current, visited, values, order, total } = state;
  const size = 200;
  const cx = size / 2, cy = size / 2 - 6;
  const radius = vertices.length <= 4 ? 58 : 68;
  const layout = circularLayout(vertices, cx, cy, radius);
  const pos = Object.fromEntries(layout.map((v) => [v.name, v]));
  const visitedSet = new Set(visited);

  const colorFor = (name) => (name === current ? CURRENT : visitedSet.has(name) ? VISITED : PENDING);
  const fmt = (v) => (Number.isFinite(v) ? v : "∞");

  return (
    <div className="flex flex-col items-center">
      <div className="text-[11px] font-bold mb-1" style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}>
        {ALGO_LABEL[algo] || ""}
      </div>
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: 240, display: "block" }}>
        {edges.map((e, i) => {
          const a = pos[e.from], b = pos[e.to];
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--border-strong)" strokeWidth={1.25} opacity={0.55} />
              {weighted && (
                <text x={mx} y={my - 2} textAnchor="middle" fontSize={8} fontFamily="monospace" fill="var(--text-muted)">{e.weight}</text>
              )}
            </g>
          );
        })}
        {layout.map((v) => {
          const c = colorFor(v.name);
          const badge = values[v.name];
          return (
            <g key={v.name}>
              <circle cx={v.x} cy={v.y} r={15} fill={c + (v.name === current ? "35" : visitedSet.has(v.name) ? "22" : "12")} stroke={c} strokeWidth={v.name === current ? 3 : 2} style={{ transition: "fill 150ms, stroke 150ms" }} />
              <text x={v.x} y={v.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontFamily="monospace" fontWeight="bold" fill="var(--text)">{v.name}</text>
              {algo === "dijkstra" && badge !== undefined && (
                <text x={v.x} y={v.y + 26} textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight="bold" fill={c}>{fmt(badge)}</text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center justify-center gap-1 mt-1 pt-2 w-full" style={{ borderTop: "1px solid var(--border-strong)" }}>
        <span className="text-[10px] mr-1" style={{ color: "var(--text-muted)" }}>{algo === "dijkstra" ? "finalized:" : algo === "prim" ? "added:" : "order:"}</span>
        {order.length === 0 && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>-</span>}
        {order.map((v, i) => {
          const isLast = i === order.length - 1;
          return (
            <span key={i} className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: (isLast ? CURRENT : VISITED) + "20", color: isLast ? CURRENT : VISITED }}>
              {v}
            </span>
          );
        })}
      </div>
      {algo === "prim" && total !== null && (
        <div className="text-[11px] font-mono font-bold mt-1" style={{ color: VISITED }}>MST total: {total}</div>
      )}
    </div>
  );
}

export default function GraphAlgoViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);

  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = null;
    try {
      states = await runGraphViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseGraphAlgoStates(code);
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
