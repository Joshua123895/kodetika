import { useState, useCallback } from "react";
import { TrendingDown, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import { runGradientViz } from "./gradientTrace";

const CURVE = "#7AA2F7";
const POINT = "#E9B44C";
const TRAIL = "#BB9AF7";
const MIN = "#28CA41";

const W = 260;
const H = 150;
const PAD = 18;

function Plot({ state }) {
  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4" style={{ color: "var(--text-muted)" }}>
        <TrendingDown size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">
          Run a training loop to watch it descend
          <br />
          <code className="text-xs" style={{ color: "var(--text-secondary)" }}>w = w - lr * gradient(w)</code>
        </p>
      </div>
    );
  }

  const { curve, lo, hi, w, loss, trail, offCurve } = state;
  // Use the robust cap computed in the trace, not the curve's own maximum: the
  // arms of a quadratic bowl are enormous and would flatten everything else.
  const maxLoss = state.yMax || Math.max(...curve.map((p) => p.loss), 1e-9);
  const sx = (val) => PAD + ((val - lo) / (hi - lo)) * (W - 2 * PAD);
  const sy = (val) => H - PAD - (Math.min(val, maxLoss) / maxLoss) * (H - 2 * PAD);
  // A point can be inside the horizontal domain but above the vertical cap.
  const offTop = loss > maxLoss;

  const path = curve.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.w).toFixed(1)},${sy(p.loss).toFixed(1)}`).join(" ");
  // Lowest sampled point of the curve: where training is trying to arrive.
  const best = curve.reduce((a, b) => (b.loss < a.loss ? b : a), curve[0]);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: "auto", display: "block" }}>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border-strong)" strokeWidth="1" />
        <line x1={sx(best.w)} y1={PAD} x2={sx(best.w)} y2={H - PAD} stroke={MIN} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        <path d={path} fill="none" stroke={CURVE} strokeWidth="2" />
        {trail.slice(0, -1).map((p, i) => (
          <circle key={i} cx={sx(p.w)} cy={sy(p.loss)} r="2.5" fill={TRAIL} opacity="0.45" />
        ))}
        {!offCurve && !offTop && <circle cx={sx(w)} cy={sy(loss)} r="5" fill={POINT} stroke="var(--bg)" strokeWidth="1.5" />}
        <text x={PAD} y={H - 4} fontSize="8" fill="var(--text-muted)" fontFamily="monospace">{lo.toFixed(1)}</text>
        <text x={W - PAD} y={H - 4} fontSize="8" fill="var(--text-muted)" fontFamily="monospace" textAnchor="end">{hi.toFixed(1)}</text>
        <text x={PAD} y={PAD - 6} fontSize="8" fill="var(--text-muted)" fontFamily="monospace">loss</text>
      </svg>

      <div className="flex flex-wrap justify-center gap-1.5 mt-2">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <span style={{ color: "var(--text-muted)" }}>w=</span>{w.toFixed(3)}
        </span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <span style={{ color: "var(--text-muted)" }}>loss=</span>{loss.toFixed(3)}
        </span>
        {state.lr !== undefined && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
            <span style={{ color: "var(--text-muted)" }}>lr=</span>{state.lr}
          </span>
        )}
      </div>

      <div className="text-[11px] font-mono font-bold mt-2 pt-2 w-full text-center" style={{ borderTop: "1px solid var(--border)", color: offCurve || offTop ? "#FF5F57" : "var(--text-muted)", minHeight: 14 }}>
        {offCurve || offTop ? "off the chart" : `step ${state.step + 1} of ${state.total}`}
      </div>
    </div>
  );
}

export default function GradientViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);
  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = [];
    try {
      states = await runGradientViz(code);
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
      <Plot state={parsed.states[idx]} />
    </div>
  );
}
