import { useState, useCallback } from "react";
import { GitBranch, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import AnimatedItem from "./AnimatedItem";
import { parseBacktrackStates, BACKTRACK_LABEL } from "./backtrackInterp";
import { runBacktrackViz } from "./backtrackTrace";

const CHOOSE = "#7AA2F7";
const SOLUTION = "#28CA41";
const PRUNE = "#FF5F57";

function actionColor(state) {
  if (state.justFound) return SOLUTION;
  if (state.pruned) return PRUNE;
  if (/^backtrack|^skip/.test(state.action)) return "var(--text-muted)";
  return CHOOSE;
}

function Chips({ values, color, dim }) {
  if (values.length === 0) {
    return <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>[ ]</span>;
  }
  return (
    <div className="flex gap-0.5">
      {values.map((v, i) => (
        <span
          key={i}
          className="text-[10px] font-mono font-bold rounded px-1 py-0.5"
          style={{ background: color + (dim ? "12" : "22"), color: dim ? "var(--text-muted)" : color, border: `1px solid ${color}${dim ? "40" : ""}` }}
        >
          {v}
        </span>
      ))}
    </div>
  );
}

function VizBody({ state }) {
  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-50 text-center p-4" style={{ color: "var(--text-muted)" }}>
        <GitBranch size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Explore a decision tree<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>backtrack(0, [])</code></p>
      </div>
    );
  }

  const { problem, current, action, solutions, justFound } = state;
  const aColor = actionColor(state);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-[11px] font-bold" style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}>
        {BACKTRACK_LABEL[problem] || ""}
      </div>

      {/* current partial being built */}
      <div className="flex flex-col items-center gap-1 w-full">
        <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>building</span>
        <div className="flex items-center justify-center min-h-[24px] px-3 py-1 rounded-lg" style={{ background: "var(--bg)", border: `2px solid ${justFound ? SOLUTION : aColor}` }}>
          <Chips values={current} color={justFound ? SOLUTION : aColor} />
        </div>
        <div className="text-[10px] font-mono font-bold" style={{ color: aColor, minHeight: 13 }}>{action}</div>
      </div>

      {/* collected solutions */}
      <div className="flex flex-col items-center gap-1 w-full pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          solutions · {solutions.length}
        </span>
        <div className="flex flex-wrap justify-center gap-1 max-h-24 overflow-y-auto">
          {solutions.map((sol, i) => {
            const isLatest = justFound && i === solutions.length - 1;
            return (
              <AnimatedItem key={i}>
                <div className="rounded px-1 py-0.5" style={{ background: isLatest ? SOLUTION + "25" : "var(--bg)", border: `1px solid ${isLatest ? SOLUTION : "var(--border)"}` }}>
                  <Chips values={sol.length === 0 ? [] : sol} color={SOLUTION} dim={!isLatest} />
                </div>
              </AnimatedItem>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function BacktrackViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);

  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = null;
    try {
      states = await runBacktrackViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseBacktrackStates(code);
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
