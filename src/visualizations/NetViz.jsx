import { useState, useCallback } from "react";
import { BrainCircuit, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import { runNetViz } from "./netTrace";

const POS = "#67C587";
const NEG = "#FF5F57";
const NODE = "#7AA2F7";

const W = 250;
const H = 165;

// Edge thickness and color carry the weight: green pulls the output up, red
// pushes it down, and a near-zero weight nearly disappears.
function edgeStyle(w, maxAbs) {
  const t = maxAbs > 0 ? Math.abs(w) / maxAbs : 0;
  return { stroke: w >= 0 ? POS : NEG, strokeWidth: 0.5 + t * 3, opacity: 0.25 + t * 0.6 };
}

// A unit is filled in proportion to how strongly it is activated.
function nodeFill(a) {
  if (a === null || a === undefined) return "var(--bg)";
  const t = Math.max(0, Math.min(1, a));
  return `color-mix(in srgb, ${NODE} ${Math.round(t * 100)}%, var(--bg))`;
}

function Body({ state }) {
  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4" style={{ color: "var(--text-muted)" }}>
        <BrainCircuit size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">
          Run a forward pass to see the network
          <br />
          <code className="text-xs" style={{ color: "var(--text-secondary)" }}>w1 = [[0.5, -0.4], [-0.3, 0.6]]</code>
        </p>
      </div>
    );
  }

  const { w1, w2, h, out, x, inputCount, hiddenCount, error } = state;
  // `h` is built up one unit at a time (h.append(...)), so a snapshot taken
  // mid-loop can be shorter than hiddenCount. Read it defensively.
  const act = (arr, i) => (Array.isArray(arr) && typeof arr[i] === "number" ? arr[i] : null);
  const colX = [34, W / 2, W - 34];
  const yFor = (i, n) => (H * (i + 1)) / (n + 1);
  const maxAbs = Math.max(...w1.flat().map(Math.abs), ...w2.map(Math.abs), 1e-9);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: "auto", display: "block" }}>
        {w1.map((row, j) =>
          row.map((wt, i) => (
            <line
              key={`e1-${j}-${i}`}
              x1={colX[0]}
              y1={yFor(i, inputCount)}
              x2={colX[1]}
              y2={yFor(j, hiddenCount)}
              {...edgeStyle(wt, maxAbs)}
            />
          ))
        )}
        {w2.map((wt, j) => (
          <line key={`e2-${j}`} x1={colX[1]} y1={yFor(j, hiddenCount)} x2={colX[2]} y2={yFor(0, 1)} {...edgeStyle(wt, maxAbs)} />
        ))}

        {Array.from({ length: inputCount }).map((_, i) => (
          <g key={`in${i}`}>
            <circle cx={colX[0]} cy={yFor(i, inputCount)} r="11" fill={nodeFill(act(x, i))} stroke={NODE} strokeWidth="1.5" />
            {act(x, i) !== null && <text x={colX[0]} y={yFor(i, inputCount) + 3} fontSize="8" fill="var(--text)" textAnchor="middle" fontFamily="monospace">{act(x, i)}</text>}
          </g>
        ))}
        {Array.from({ length: hiddenCount }).map((_, j) => (
          <g key={`hd${j}`}>
            <circle cx={colX[1]} cy={yFor(j, hiddenCount)} r="11" fill={nodeFill(act(h, j))} stroke={NODE} strokeWidth="1.5" />
            {act(h, j) !== null && <text x={colX[1]} y={yFor(j, hiddenCount) + 3} fontSize="7" fill="var(--text)" textAnchor="middle" fontFamily="monospace">{act(h, j).toFixed(2)}</text>}
          </g>
        ))}
        <g>
          <circle cx={colX[2]} cy={yFor(0, 1)} r="13" fill={nodeFill(typeof out === "number" ? out : null)} stroke={NODE} strokeWidth="1.5" />
          {typeof out === "number" && <text x={colX[2]} y={yFor(0, 1) + 3} fontSize="8" fill="var(--text)" textAnchor="middle" fontFamily="monospace">{out.toFixed(2)}</text>}
        </g>
      </svg>

      <div className="flex flex-wrap justify-center gap-1.5 mt-2">
        {state.epoch !== null && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", color: "var(--text)" }}>
            <span style={{ color: "var(--text-muted)" }}>epoch=</span>{state.epoch}
          </span>
        )}
        {state.target !== null && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", color: "var(--text)" }}>
            <span style={{ color: "var(--text-muted)" }}>target=</span>{state.target}
          </span>
        )}
        {error !== null && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", color: Math.abs(error) < 0.1 ? POS : "var(--text)" }}>
            <span style={{ color: "var(--text-muted)" }}>err=</span>{error.toFixed(3)}
          </span>
        )}
      </div>

      <div className="text-[11px] font-mono font-bold mt-2 pt-2 w-full text-center" style={{ borderTop: "1px solid var(--border-strong)", color: "var(--text-muted)", minHeight: 14 }}>
        step {state.step + 1} of {state.total}
      </div>
    </div>
  );
}

export default function NetViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);
  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states;
    try {
      states = await runNetViz(code);
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
