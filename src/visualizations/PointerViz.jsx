import { useState, useCallback } from "react";
import { ChevronDown, Play, Search } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import { parseSearchStates } from "./searchInterp";
import { runSearchViz } from "./searchTrace";

// Lower-bound pointers are green, upper-bound red, the probe amber, scan
// indices blue/purple, so in binary search low/high visibly bracket the
// active range with mid probing between them.
const POINTER_STYLE = {
  low: "#28CA41", left: "#28CA41", lo: "#28CA41", l: "#28CA41",
  high: "#FF5F57", right: "#FF5F57", hi: "#FF5F57", r: "#FF5F57",
  mid: "#E9B44C", middle: "#E9B44C", m: "#E9B44C",
  i: "#7AA2F7", j: "#BB9AF7",
};
const pointerColor = (name) => POINTER_STYLE[name] || "#7AA2F7";

const COMPARE = "#7AA2F7";
const FOUND = "#28CA41";
const WINDOW = "#BB9AF7";

function Cells({ state }) {
  const items = state?.items || [];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-50 text-center p-4" style={{ color: "var(--text-muted)" }}>
        <Search size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Create an array to watch the search<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>nums = [1, 3, 5, 7]</code></p>
      </div>
    );
  }

  const { pointers = {}, activeRange, window: win, compare, found } = state;
  const compareSet = new Set(compare || []);
  const foundSet = new Set(found || []);
  const inActive = (i) => !activeRange || (i >= activeRange[0] && i <= activeRange[1]);
  const inWindow = (i) => win && i >= win[0] && i <= win[1];

  // Group pointer names by the index they point at, so multiple pointers on
  // the same cell stack neatly above it. (Stale out-of-range probes are
  // already filtered out upstream in the interpreter.)
  const byIndex = {};
  for (const [name, i] of Object.entries(pointers)) {
    (byIndex[i] ||= []).push(name);
  }
  const maxStack = Math.max(1, ...Object.values(byIndex).map((a) => a.length));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-end justify-center gap-1 flex-wrap">
        {items.map((item, i) => {
          const isFound = foundSet.has(i);
          const isCompare = compareSet.has(i);
          const dim = !inActive(i) && !isFound && !isCompare;
          const accent = isFound ? FOUND : isCompare ? COMPARE : inWindow(i) ? WINDOW : "var(--border-strong)";
          const bg = isFound ? FOUND + "30" : isCompare ? COMPARE + "25" : inWindow(i) ? WINDOW + "1A" : "var(--bg)";
          const labels = byIndex[i] || [];
          return (
            <div key={item._id} className="flex flex-col items-center" style={{ opacity: dim ? 0.3 : 1, transition: "opacity 150ms" }}>
              <div className="flex flex-col items-center justify-end gap-0.5" style={{ height: maxStack * 15 + 4 }}>
                {labels.map((name) => (
                  <span key={name} className="text-[9px] font-mono font-bold leading-none" style={{ color: pointerColor(name) }}>
                    {name}<ChevronDown size={9} strokeWidth={3} className="inline" />
                  </span>
                ))}
              </div>
              <div
                className="rounded-md flex items-center justify-center font-mono text-sm font-bold transition-all duration-150"
                style={{
                  width: 34, height: 34,
                  background: bg,
                  border: `2px solid ${accent}`,
                  color: isFound ? FOUND : "var(--text)",
                }}
              >
                {item.value}
              </div>
              <span className="text-[9px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>{i}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Readout({ state }) {
  const vars = state?.vars || {};
  const entries = Object.entries(vars);
  const status = state?.status;

  const LABELS = {
    target: "target", k: "k", current: "sum", window_sum: "window", best: "best", total: "total", sum: "sum",
  };

  return (
    <div className="flex flex-col items-center gap-1.5 mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
      {entries.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {entries.map(([k, v]) => (
            <span key={k} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
              <span style={{ color: "var(--text-muted)" }}>{LABELS[k] || k}=</span>{v}
            </span>
          ))}
        </div>
      )}
      <div className="text-[11px] font-mono font-bold" style={{ color: status?.startsWith("Found") ? FOUND : status?.startsWith("Not") ? "#FF5F57" : "var(--text-muted)", minHeight: 14 }}>
        {status || ""}
      </div>
    </div>
  );
}

export default function PointerViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);
  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = null;
    try {
      states = await runSearchViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseSearchStates(code);
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
      <Cells state={parsed.states[idx]} />
      <Readout state={parsed.states[idx]} />
    </div>
  );
}
