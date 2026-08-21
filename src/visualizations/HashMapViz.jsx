import { useState, useCallback } from "react";
import { ArrowRight, Braces, ChevronDown, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import AnimatedItem from "./AnimatedItem";
import { parseHashMapStates } from "./hashMapInterp";
import { runHashMapViz } from "./hashMapTrace";

const ADDED = "#28CA41";
const UPDATED = "#E9B44C";
const FOUND = "#28CA41";
const POINTER = "#7AA2F7";

function statusColor(status) {
  return status === "added" ? ADDED : status === "updated" ? UPDATED : null;
}

function ArrayRow({ items, ptr, found }) {
  const foundSet = new Set(found || []);
  return (
    <div className="flex items-end justify-center gap-1 flex-wrap mb-3">
      {items.map((item, i) => {
        const isPtr = i === ptr;
        const isFound = foundSet.has(i);
        const color = isFound ? FOUND : isPtr ? POINTER : "var(--border-strong)";
        return (
          <div key={item._id} className="flex flex-col items-center">
            <div style={{ height: 12 }}>
              {isPtr && <span className="text-[9px] font-mono font-bold" style={{ color: POINTER }}>i<ChevronDown size={9} strokeWidth={3} className="inline" /></span>}
            </div>
            <div
              className="rounded-md flex items-center justify-center font-mono text-xs font-bold transition-all duration-150"
              style={{
                width: 30, height: 30,
                background: isFound ? FOUND + "30" : isPtr ? POINTER + "20" : "var(--bg)",
                border: `2px solid ${color}`,
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
  );
}

function VizBody({ state }) {
  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-50 text-center p-4" style={{ color: "var(--text-muted)" }}>
        <Braces size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Build a hash map to see it<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>freq = {}</code></p>
      </div>
    );
  }

  const { array, arrayPtr, dict, status, found } = state;

  return (
    <div className="flex flex-col items-center">
      {array && <ArrayRow items={array} ptr={arrayPtr} found={found} />}

      <div className="flex flex-col gap-1 w-full items-center">
        {dict.length === 0 ? (
          <div className="text-xs text-center py-2 px-4 rounded-lg" style={{ background: "var(--bg)", border: "2px dashed var(--border-strong)", color: "var(--text-muted)" }}>
            empty map
          </div>
        ) : (
          dict.map((pair) => {
            const c = statusColor(pair.status);
            return (
              <AnimatedItem key={pair.key}>
                <div
                  className="flex items-center gap-2 px-3 py-1 rounded-lg font-mono text-xs transition-all duration-150"
                  style={{
                    background: c ? c + "18" : "var(--bg)",
                    border: "1.5px solid " + (c || "var(--border-strong)"),
                    color: "var(--text)",
                  }}
                >
                  <span style={{ color: "#BB9AF7" }}>{pair.key}</span>
                  <ArrowRight size={11} strokeWidth={2.5} style={{ color: "var(--text-muted)" }} />
                  <span style={{ color: "#28CA41" }}>{pair.val}</span>
                  {pair.status && <span className="text-[9px]" style={{ color: c }}>{pair.status}</span>}
                </div>
              </AnimatedItem>
            );
          })
        )}
      </div>

      <div className="text-[11px] font-mono font-bold mt-2 pt-2 w-full text-center" style={{ borderTop: "1px solid var(--border-strong)", color: status?.startsWith("Found") ? FOUND : "var(--text-muted)", minHeight: 14 }}>
        {status || `${dict.length} ${dict.length === 1 ? "entry" : "entries"}`}
      </div>
    </div>
  );
}

export default function HashMapViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);

  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = null;
    try {
      states = await runHashMapViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseHashMapStates(code);
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
