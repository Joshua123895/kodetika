import { useState, useCallback } from "react";
import { TrendingUp, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import { runRegressionViz } from "./regressionTrace";

const POINT = "#7AA2F7";
const LINE = "#E9B44C";
const RESID = "#FF5F57";

const W = 260;
const H = 160;
const PAD = 22;

function Plot({ state }) {
  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4" style={{ color: "var(--text-muted)" }}>
        <TrendingUp size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">
          Fit a line to watch it settle
          <br />
          <code className="text-xs" style={{ color: "var(--text-secondary)" }}>y = w * x + b</code>
        </p>
      </div>
    );
  }

  const { points, w, b, residuals, loss } = state;
  const xsAll = points.map((p) => p.x);
  const ysAll = points.map((p) => p.y).concat(residuals.map((r) => r.fit));
  const xLo = Math.min(...xsAll);
  const xHi = Math.max(...xsAll);
  const yLo = Math.min(...ysAll);
  const yHi = Math.max(...ysAll);
  const xPad = (xHi - xLo) * 0.15 || 1;
  const yPad = (yHi - yLo) * 0.15 || 1;
  const x0 = xLo - xPad;
  const x1 = xHi + xPad;
  const y0 = yLo - yPad;
  const y1 = yHi + yPad;

  const sx = (v) => PAD + ((v - x0) / (x1 - x0)) * (W - 2 * PAD);
  const sy = (v) => H - PAD - ((v - y0) / (y1 - y0)) * (H - 2 * PAD);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: "auto", display: "block" }}>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border-strong)" strokeWidth="1" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--border-strong)" strokeWidth="1" />
        {residuals.map((r, i) => (
          <line key={`r${i}`} x1={sx(r.x)} y1={sy(r.y)} x2={sx(r.x)} y2={sy(r.fit)} stroke={RESID} strokeWidth="1" opacity="0.5" />
        ))}
        <line x1={sx(x0)} y1={sy(w * x0 + b)} x2={sx(x1)} y2={sy(w * x1 + b)} stroke={LINE} strokeWidth="2" />
        {points.map((p, i) => (
          <circle key={`p${i}`} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill={POINT} />
        ))}
      </svg>

      <div className="flex flex-wrap justify-center gap-1.5 mt-2">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <span style={{ color: "var(--text-muted)" }}>w=</span>{w.toFixed(3)}
        </span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <span style={{ color: "var(--text-muted)" }}>b=</span>{b.toFixed(3)}
        </span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <span style={{ color: "var(--text-muted)" }}>mse=</span>{loss.toFixed(3)}
        </span>
      </div>

      <div className="text-[11px] font-mono font-bold mt-2 pt-2 w-full text-center" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)", minHeight: 14 }}>
        step {state.step + 1} of {state.total}
      </div>
    </div>
  );
}

export default function RegressionViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);
  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = [];
    try {
      states = await runRegressionViz(code);
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
