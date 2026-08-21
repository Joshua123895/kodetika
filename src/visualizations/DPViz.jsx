import { useState, useCallback } from "react";
import { Grid3x3, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import { parseDPStates, DP_LABEL } from "./dpInterp";
import { runDPViz } from "./dpTrace";

const CURRENT = "#E9B44C"; // cell being computed
const DEP = "#7AA2F7";     // the two cells it depends on
const FILLED = "#28CA41";  // already computed

function VizBody({ state }) {
  if (!state || !state.cells || state.cells.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-50 text-center p-4" style={{ color: "var(--text-muted)" }}>
        <Grid3x3 size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Fill a DP table to see it<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>table = [0] * (n + 1)</code></p>
      </div>
    );
  }

  const { cells, current, deps, formula, result, type } = state;
  const depSet = new Set(deps);

  return (
    <div className="flex flex-col items-center">
      <div className="text-[11px] font-bold mb-2" style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}>
        {DP_LABEL[type] || ""}
      </div>

      <div className="flex flex-wrap justify-center gap-1">
        {cells.map((cell) => {
          const isCurrent = cell.index === current;
          const isDep = depSet.has(cell.index);
          const isFilled = cell.value !== null;
          const color = isCurrent ? CURRENT : isDep ? DEP : isFilled ? FILLED : "var(--border-strong)";
          return (
            <div key={cell.index} className="flex flex-col items-center">
              <div
                className="rounded flex items-center justify-center font-mono font-bold transition-all duration-150"
                style={{
                  minWidth: 30, height: 26, padding: "0 3px",
                  fontSize: 10,
                  background: isCurrent ? CURRENT + "35" : isDep ? DEP + "25" : isFilled ? FILLED + "18" : "var(--bg)",
                  border: `1.5px solid ${isFilled || isCurrent ? color : "var(--border-strong)"}`,
                  color: isFilled ? "var(--text)" : "var(--text-muted)",
                }}
              >
                {cell.value === null ? "" : cell.value}
              </div>
              <span className="text-[8px] font-mono mt-0.5" style={{ color: isCurrent ? CURRENT : "var(--text-muted)" }}>{cell.index}</span>
            </div>
          );
        })}
      </div>

      <div className="text-[11px] font-mono mt-2 pt-2 w-full text-center" style={{ borderTop: "1px solid var(--border-strong)", color: current !== null ? CURRENT : "var(--text-muted)", minHeight: 15 }}>
        {formula || ""}
      </div>
      {result !== null && result !== undefined && (
        <div className="text-[11px] font-mono font-bold mt-1" style={{ color: FILLED }}>result = {result}</div>
      )}
    </div>
  );
}

export default function DPViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);

  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = null;
    try {
      states = await runDPViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseDPStates(code);
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
