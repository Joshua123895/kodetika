import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowRight, Play, Rows3 } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import AnimatedItem from "./AnimatedItem";
import { splitStatements } from "./parseUtils";
import { runArrayViz } from "./arrayTrace";

const COLORS = ["#FF5F57", "#E9B44C", "#28CA41", "#7AA2F7", "#BB9AF7", "#FF75A0", "#86E1F9", "#A6E3A1"];

function parseExtendArgs(str) {
  const m = str.match(/\[([^\]]*)\]/);
  if (m) return m[1].split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for unit tests
export function parseArrayStates(code) {
  const lines = splitStatements(code);
  const arrays = {};
  let sliceIdCounter = 0;
  let itemId = 0;
  const states = [];

  const snapshot = () => states.push(JSON.parse(JSON.stringify(arrays)));

  const getIndent = (s) => s.length - s.trimStart().length;

  const execLine = (line) => {
    if (line.trim().startsWith("#")) return;
    const init = line.match(/(\w+)\s*=\s*\[([^\]]*)\]/);
    if (init) {
      const vals = init[2].split(",").map((s) => s.trim()).filter(Boolean);
      arrays[init[1]] = { items: vals.map((v) => ({ value: v, _id: itemId++ })), slices: [] };
      snapshot();
      return;
    }

    // Deliberately ignores the key: the predicate only asks whether this line
    // performs an array operation at all, then takes the first array in scope.
    const name = Object.keys(arrays).find(() => {
      return /\.(append|extend|pop|remove)\s*\(/.test(line) || /\[\s*[^\]]+\s*\]/.test(line);
    });
    if (!name) return;
    const arr = arrays[name];

    const append = line.match(/(\w+)\.append\s*\((.+?)\)/);
    if (append && append[1] === name) {
      arr.items = [...arr.items, { value: append[2].trim(), _id: itemId++ }];
      snapshot();
      return;
    }

    const extend = line.match(/(\w+)\.extend\s*\((.+)\)/);
    if (extend && extend[1] === name) {
      const vals = parseExtendArgs(extend[2]);
      arr.items = [...arr.items, ...vals.map((v) => ({ value: v, _id: itemId++ }))];
      snapshot();
      return;
    }

    const pop = line.match(/(\w+)\.pop\s*\(\s*(\d*)\s*\)/);
    if (pop && pop[1] === name && arr.items.length > 0) {
      const copy = [...arr.items];
      if (pop[2] !== "") { const idx = Number(pop[2]); if (idx >= 0 && idx < copy.length) copy.splice(idx, 1); }
      else { copy.pop(); }
      arr.items = copy;
      snapshot();
      return;
    }

    const remove = line.match(/(\w+)\.remove\s*\((.+?)\)/);
    if (remove && remove[1] === name) {
      const val = remove[2].trim();
      const idx = arr.items.findIndex((item) => item.value === val);
      if (idx >= 0) { const copy = [...arr.items]; copy.splice(idx, 1); arr.items = copy; }
      snapshot();
      return;
    }

    const assign = line.match(/(\w+)\[(-?\d+)\]\s*=\s*(.+)/);
    if (assign && assign[1] === name) {
      const idx = Number(assign[2]);
      const norm = idx < 0 ? arr.items.length + idx : idx;
      if (norm >= 0 && norm < arr.items.length) {
        const copy = [...arr.items];
        copy[norm] = { value: assign[3].trim(), sel: "set", _id: copy[norm]._id };
        arr.items = copy;
      }
      snapshot();
      return;
    }

    const access = line.match(/(\w+)\[([^\]]+)\]/);
    if (access && access[1] === name) {
      const inner = access[2].trim();
      const isSlice = inner.includes(":");
      const len = arr.items.length;

      if (!isSlice && /^-?\d+$/.test(inner)) {
        const norm = Number(inner) < 0 ? len + Number(inner) : Number(inner);
        if (norm >= 0 && norm < len) {
          // Reset every item's sel (not just set the matched one), these are
          // throwaway reads like `print(nums[0])`, not stored sub-arrays, so
          // each new access should show only its own target, not accumulate
          // stale highlighting from a previous unrelated access/slice.
          arr.items = arr.items.map((item, i) => ({ ...item, sel: i === norm ? "idx" : undefined }));
          arr.slices = [];
        }
      } else if (isSlice) {
        const parts = inner.split(":");
        const sA = parts[0] === "" ? undefined : Number(parts[0]);
        const sB = parts[1] === "" ? undefined : Number(parts[1]);
        let step = parts[2] === "" || parts[2] === undefined ? 1 : Number(parts[2]);
        if (step === 0) step = 1;
        const pStart = sA !== undefined ? (sA < 0 ? len + sA : sA) : (step > 0 ? 0 : len - 1);
        const pStop = sB !== undefined ? (sB < 0 ? len + sB : sB) : (step > 0 ? len : -1);
        const idxs = [];
        if (step > 0) { for (let k = pStart; k < pStop; k += step) idxs.push(k); }
        else { for (let k = pStart; k > pStop; k += step) idxs.push(k); }

        const sid = "s" + (sliceIdCounter++);
        // Same reasoning as above: replace (not accumulate) so the legend
        // always matches what's actually highlighted. Without this, printing
        // nums[2:6] then nums[:4] would silently overwrite the first slice's
        // color on indices 2-3 while its legend entry stuck around claiming
        // "4 items" are highlighted when none of them still show that color.
        arr.items = arr.items.map((item, i) => ({ ...item, sel: idxs.includes(i) ? sid : undefined }));
        arr.slices = [{ ids: idxs, label: inner, id: sid }];
      }
      snapshot();
    }
  };

  snapshot();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const indent = getIndent(line);
    const t = line.trim();

    const forMatch = t.match(/for\s+\w+\s+in\s+range\s*\(\s*(\d+)\s*\)\s*:/);
    if (forMatch) {
      const count = Number(forMatch[1]);
      const bodyIndent = indent + 1;
      const bodyLines = [];
      let j = i + 1;
      while (j < lines.length && getIndent(lines[j]) >= bodyIndent) {
        bodyLines.push(lines[j]);
        j++;
      }
      for (let iter = 0; iter < count; iter++) {
        for (const bl of bodyLines) {
          execLine(bl);
        }
      }
      i = j;
    } else {
      execLine(line);
      i++;
    }
  }
  return states;
}

function SelBox({ item, i }) {
  const isIdx = item.sel === "idx";
  const isSet = item.sel === "set";
  const isSlice = item.sel && item.sel !== "idx" && item.sel !== "set";

  let color = "var(--bg)";
  let borderColor = "var(--border-strong)";
  let textColor = "var(--text)";
  let shadow = "none";
  let scale = 1;
  let extraTop = null;

  if (isIdx) {
    color = "#7AA2F720"; borderColor = "#7AA2F7"; textColor = "#7AA2F7"; shadow = "0 0 8px rgba(122,162,247,0.25)"; scale = 1.05;
  } else if (isSet) {
    color = "#E9B44C20"; borderColor = "#E9B44C"; textColor = "#E9B44C"; shadow = "0 0 8px rgba(233,180,76,0.25)"; scale = 1.05;
  } else if (isSlice) {
    const c = COLORS[Number(item.sel.slice(1)) % COLORS.length];
    color = c + "18"; borderColor = c; textColor = c; shadow = "none"; scale = 1;
    extraTop = <div className="h-0.5 rounded-full mb-0.5" style={{ background: c, width: 28 }} />;
  }

  return (
    <div className="flex flex-col items-center">
      {extraTop}
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center font-mono text-sm font-bold transition-all duration-200"
        style={{
          background: color,
          border: `2px solid ${borderColor}`,
          color: textColor,
          boxShadow: shadow,
          transform: `scale(${scale})`,
        }}
      >
        {item.value}
      </div>
      {i !== undefined && (
        <div className="text-[10px] mt-1 font-mono" style={{ color: "var(--text-muted)" }}>
          {i}
        </div>
      )}
    </div>
  );
}

function VizBody({ arrays, ghosts = {} }) {
  const names = Object.keys(arrays);
  if (names.length === 0 && Object.keys(ghosts).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4" style={{ color: "var(--text-muted)" }}>
        <Rows3 size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Create an array to see it here<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>nums = [1, 2, 3]</code></p>
      </div>
    );
  }

  const allNames = [...new Set([...names, ...Object.keys(ghosts)])];

  return (
    <div className="flex flex-col items-center gap-6">
      {allNames.map((name) => {
        const { items = [], slices = [] } = arrays[name] || {};
        const ghostItems = ghosts[name] || [];
        const activeSlices = slices.filter((s) => s.ids.length > 0);

        return (
          <div key={name} className="w-full">
            <div className="text-xs font-bold mb-2 text-center" style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}>
              {name}
            </div>

            {activeSlices.length > 0 && (
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mb-2">
                {activeSlices.map((slice) => {
                  const c = COLORS[Number(slice.id.slice(1)) % COLORS.length];
                  return (
                    <div key={slice.id} className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: c }}>
                      <span className="w-2 h-0.5 rounded-full inline-block" style={{ background: c }} />
                      {slice.label}
                      <ArrowRight size={11} strokeWidth={2.5} style={{ color: "var(--text-muted)" }} />
                      <span style={{ color: "var(--text-muted)" }}>{slice.ids.length} items</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-1">
              {items.length === 0 && ghostItems.length === 0 && (
                <div className="text-xs px-4 py-3 rounded-lg" style={{ background: "var(--bg)", border: "2px dashed var(--border-strong)", color: "var(--text-muted)" }}>empty</div>
              )}
              {items.map((item, i) => (
                <AnimatedItem key={item._id}>
                  <SelBox item={item} i={i} />
                </AnimatedItem>
              ))}
              {ghostItems.map((item) => (
                <AnimatedItem key={`ghost-${item._id}`} leaving>
                  <SelBox item={item} />
                </AnimatedItem>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ArrayViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);
  const [ghosts, setGhosts] = useState({});
  const prevRef = useRef(null);
  const ghostTimerRef = useRef(null);

  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = null;
    try {
      states = await runArrayViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseArrayStates(code);
    setParsed({ code, states });
    playback.configure(states);
    setLoading(false);
    return states;
  }, [code, parsed, playback]);

  useEffect(() => {
    if (!parsed || playback.step < 0) return;

    const cur = parsed.states[Math.min(playback.step, parsed.states.length - 1)];
    const prev = prevRef.current;
    prevRef.current = cur;

    if (!prev) return;

    if (ghostTimerRef.current) clearTimeout(ghostTimerRef.current);

    const g = {};
    for (const name of Object.keys(prev)) {
      const prevItems = prev[name]?.items || [];
      const curItems = cur[name]?.items || [];
      const curIds = new Set(curItems.map((i) => i._id));
      const removed = prevItems.filter((i) => !curIds.has(i._id));
      if (removed.length > 0) g[name] = removed;
    }

    if (Object.keys(g).length > 0) {
      // The playback clock is an external system: this effect reacts to a step
      // landing by flashing what just disappeared for 300ms. Deriving it during
      // render would restart the fade on every unrelated re-render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGhosts(g);
      ghostTimerRef.current = setTimeout(() => {
        setGhosts({});
        ghostTimerRef.current = null;
      }, 300);
    } else {
      setGhosts({});
    }
  }, [parsed, playback.step]);

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
          style={{
            background: "#6AAE6F",
            color: "#fff",
          }}
        >
          {loading ? "running…" : (<><Play size={12} strokeWidth={3} fill="currentColor" /> Run</>)}
        </button>
      </div>
    );
  }

  const idx = Math.max(0, Math.min(playback.step, parsed.states.length - 1));
  const currentState = parsed.states[idx];

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
      <VizBody arrays={currentState} ghosts={ghosts} />
    </div>
  );
}
