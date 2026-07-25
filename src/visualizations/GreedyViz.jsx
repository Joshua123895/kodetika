import { useState, useCallback } from "react";
import { ChevronDown, Play, Zap } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import AnimatedItem from "./AnimatedItem";
import { parseGreedyStates, GREEDY_LABEL } from "./greedyInterp";
import { runGreedyViz } from "./greedyTrace";

const KEPT = "#28CA41";
const CURRENT = "#E9B44C";
const SKIPPED = "#FF5F57";
const REACH = "#7AA2F7";

function ActivityBody({ state }) {
  const { activities, current, kept, count } = state;
  if (activities.length === 0) return null;
  const maxEnd = Math.max(...activities.map((a) => a[1]), 1);
  const keptSet = new Set(kept);
  const width = 220;

  return (
    <div className="flex flex-col gap-1 w-full">
      {activities.map((a, i) => {
        const [s, e] = a;
        const isCurrent = i === current;
        const isKept = keptSet.has(i);
        const color = isCurrent ? CURRENT : isKept ? KEPT : "var(--border-strong)";
        const left = (s / maxEnd) * width;
        const barWidth = Math.max(4, ((e - s) / maxEnd) * width);
        return (
          <div key={i} className="flex items-center gap-1">
            <span className="text-[8px] font-mono w-6 text-right" style={{ color: "var(--text-muted)" }}>{s}</span>
            <div style={{ width, position: "relative", height: 12 }}>
              <div
                className="rounded transition-all duration-150"
                style={{
                  position: "absolute", left, width: barWidth, height: 10, top: 1,
                  background: isKept ? color + "40" : isCurrent ? color + "30" : "var(--bg)",
                  border: `1.5px solid ${color}`,
                  opacity: !isKept && !isCurrent ? 0.4 : 1,
                }}
              />
            </div>
            <span className="text-[8px] font-mono" style={{ color: "var(--text-muted)" }}>{e}</span>
          </div>
        );
      })}
      <div className="text-[11px] font-mono font-bold mt-1 text-center" style={{ color: KEPT }}>selected: {count}</div>
    </div>
  );
}

function CoinsBody({ state }) {
  const { amount, remaining, picked, currentCoin } = state;
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
        amount: <span style={{ color: "var(--text)" }}>{amount}</span> · remaining: <span style={{ color: remaining === 0 ? KEPT : CURRENT }}>{remaining}</span>
      </div>
      <div className="flex flex-wrap justify-center gap-1 min-h-[30px]">
        {picked.length === 0 && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>-</span>}
        {picked.map((coin, i) => {
          const isLast = i === picked.length - 1;
          return (
            <AnimatedItem key={i}>
              <div
                className="rounded-full flex items-center justify-center font-mono text-[10px] font-bold"
                style={{ width: 28, height: 28, background: (isLast ? CURRENT : KEPT) + "25", border: `2px solid ${isLast ? CURRENT : KEPT}`, color: isLast ? CURRENT : KEPT }}
              >
                {coin}
              </div>
            </AnimatedItem>
          );
        })}
      </div>
      {currentCoin !== null && <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>using coin {currentCoin}</div>}
    </div>
  );
}

function JumpBody({ state }) {
  const { nums, index, farthest, stuck, result, run } = state;
  if (!nums || nums.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>run {run} · [{nums.join(", ")}]</div>
      <div className="flex justify-center gap-1">
        {nums.map((n, i) => {
          const isCurrent = i === index;
          const inReach = i <= farthest;
          const color = isCurrent ? (stuck ? SKIPPED : CURRENT) : inReach ? REACH : "var(--border-strong)";
          return (
            <div key={i} className="flex flex-col items-center">
              <div style={{ height: 12 }}>{isCurrent && <span className="text-[8px] font-mono font-bold" style={{ color }}>i<ChevronDown size={8} strokeWidth={3} className="inline" /></span>}</div>
              <div
                className="rounded flex items-center justify-center font-mono text-[10px] font-bold transition-all duration-150"
                style={{ width: 26, height: 26, background: inReach ? color + "20" : "var(--bg)", border: `1.5px solid ${color}` }}
              >
                {n}
              </div>
              <span className="text-[8px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>{i}</span>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>farthest reachable: <span style={{ color: REACH, fontWeight: "bold" }}>{farthest}</span></div>
      {result !== null && (
        <div className="text-[11px] font-mono font-bold" style={{ color: result ? KEPT : SKIPPED }}>{result ? "reachable! → True" : "stuck → False"}</div>
      )}
    </div>
  );
}

function VizBody({ state }) {
  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-50 text-center p-4" style={{ color: "var(--text-muted)" }}>
        <Zap size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Make a greedy choice at each step<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>farthest = max(farthest, ...)</code></p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="text-[11px] font-bold" style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}>
        {GREEDY_LABEL[state.problem] || ""}
      </div>
      {state.problem === "activity" && <ActivityBody state={state} />}
      {state.problem === "coins" && <CoinsBody state={state} />}
      {state.problem === "jump" && <JumpBody state={state} />}
    </div>
  );
}

export default function GreedyViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);

  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = null;
    try {
      states = await runGreedyViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseGreedyStates(code);
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
