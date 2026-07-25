import { useState, useCallback, useEffect, useRef } from "react";
import { Play, Triangle } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import AnimatedItem from "./AnimatedItem";
import { splitStatements } from "./parseUtils";
import { runHeapViz } from "./heapTrace";

const cmp = (a, b) => Number(a.value) - Number(b.value);

function siftUp(arr, start) {
  const a = [...arr];
  let idx = start;
  while (idx > 0) {
    const parent = (idx - 1) >> 1;
    if (cmp(a[parent], a[idx]) > 0) {
      [a[parent], a[idx]] = [a[idx], a[parent]];
      idx = parent;
    } else break;
  }
  return a;
}

function siftDown(arr, start) {
  const a = [...arr];
  const n = a.length;
  let idx = start;
  while (true) {
    let smallest = idx;
    const l = 2 * idx + 1, r = 2 * idx + 2;
    if (l < n && cmp(a[l], a[smallest]) < 0) smallest = l;
    if (r < n && cmp(a[r], a[smallest]) < 0) smallest = r;
    if (smallest === idx) break;
    [a[smallest], a[idx]] = [a[idx], a[smallest]];
    idx = smallest;
  }
  return a;
}

function heapifyArr(arr) {
  let a = [...arr];
  for (let i = Math.floor(a.length / 2) - 1; i >= 0; i--) a = siftDown(a, i);
  return a;
}

// Real heapq semantics: new item goes to the end, then sifts up, this is
// what makes the visualized array match what `print(heap)` actually shows,
// instead of just displaying insertion order.
function heapPush(arr, value, itemId) {
  const a = [...arr, { value: String(value), _id: itemId }];
  return siftUp(a, a.length - 1);
}

// Real extract-min: swap the root with the last element (both still present,
// so the swap itself is a visible frame), then drop that displaced root value
// and sift the new root down, not just "drop the front", which would
// silently desync from real heapq as soon as a push interleaves with pops.
// Returning the swapped array separately (instead of only the final result)
// lets the caller snapshot the swap before the displaced item disappears,
// so the animation actually shows what heappop does instead of jumping
// straight to the end result.
function heapPopSteps(arr) {
  if (arr.length <= 1) return { swapped: null, popped: [] };
  const a = [...arr];
  const last = a.length - 1;
  [a[0], a[last]] = [a[last], a[0]];
  const popped = siftDown(a.slice(0, last), 0);
  return { swapped: a, popped };
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for unit tests
export function parseHeapStates(code) {
  const lines = splitStatements(code);
  let heap = null;
  let itemId = 0;
  const states = [];
  const functions = {};

  const snapshot = () => states.push(heap === null ? null : [...heap]);
  const getIndent = (s) => s.length - s.trimStart().length;

  function applySubs(text, subs) {
    if (!subs) return text;
    let r = text;
    for (const [k, v] of Object.entries(subs)) {
      r = r.replace(new RegExp(`\\b${k}\\b`, "g"), v);
    }
    return r;
  }

  function collectBlock(allLines, startIdx, blockIndent) {
    const block = [];
    let j = startIdx;
    while (j < allLines.length && getIndent(allLines[j]) >= blockIndent) {
      block.push(allLines[j]);
      j++;
    }
    return { lines: block, nextIdx: j };
  }

  const execLine = (rawLine) => {
    const line = rawLine;
    if (line.trim().startsWith("#") || line.trim().startsWith("class ") || /\bself\./.test(line)) return;

    const init = line.match(/(\w+)\s*=\s*\[\s*\]/);
    if (init) {
      heap = [];
      snapshot();
      return;
    }

    const init2 = line.match(/(\w+)\s*=\s*\[([^\]]+)\]\s*$/);
    if (init2 && !init2[0].includes("heapq.") && !init2[0].includes(".append")) {
      const vals = init2[2].split(",").map((s) => s.trim()).filter(Boolean);
      heap = vals.map((v) => ({ value: v, _id: itemId++ }));
      snapshot();
      return;
    }

    const push = line.match(/heapq\.heappush\s*\(\s*\w+\s*,\s*(.+?)\s*\)/);
    if (push && heap !== null) {
      heap = heapPush(heap, push[1], itemId++);
      snapshot();
      return;
    }

    const listCompPop = line.match(/\[\s*heapq\.heappop\s*\(\s*\w+\s*\)\s*for\s+\w+\s+in\s+range\s*\(\s*len\s*\(\s*\w+\s*\)\s*\)\s*\]/);
    if (listCompPop && heap !== null) {
      const count = heap.length;
      for (let k = 0; k < count; k++) {
        const { swapped, popped } = heapPopSteps(heap);
        if (swapped) { heap = swapped; snapshot(); }
        heap = popped;
        snapshot();
      }
      return;
    }

    const pop = line.match(/heapq\.heappop\s*\(\s*\w+\s*\)/);
    if (pop && heap !== null && heap.length > 0) {
      const { swapped, popped } = heapPopSteps(heap);
      if (swapped) { heap = swapped; snapshot(); }
      heap = popped;
      snapshot();
      return;
    }

    const heapify = line.match(/heapq\.heapify\s*\(\s*\w+\s*\)/);
    if (heapify && heap !== null) {
      heap = heapifyArr(heap);
      snapshot();
    }
  };

  function processBlock(blockLines, subs) {
    let returned = false;
    let idx = 0;
    while (idx < blockLines.length && !returned) {
      const line = blockLines[idx];
      const indent = getIndent(line);
      const t = line.trim();
      const pt = applySubs(t, subs);

      if (pt.startsWith("#") || pt.startsWith("class ") || pt.startsWith("import ") || pt.startsWith("from ") || /\bself\./.test(pt)) { idx++; continue; }

      const defMatch = pt.match(/def\s+(\w+)\s*\(([^)]*)\)\s*:/);
      if (defMatch) {
        const fName = defMatch[1];
        const fParams = defMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
        const fBodyIndent = indent + 1;
        const { lines: fBody, nextIdx: fNext } = collectBlock(blockLines, idx + 1, fBodyIndent);
        functions[fName] = { params: fParams, bodyLines: fBody };
        idx = fNext;
        continue;
      }

      if (pt.startsWith("return ")) {
        const retList = pt.match(/^return\s+(\[.*\])$/);
        if (retList) execLine(retList[1]);
        returned = true;
        idx++;
        continue;
      }

      const whileMatch = pt.match(/while\s+(\w+)\s*:/);
      if (whileMatch) {
        const bodyIndent = indent + 1;
        const { lines: bodyLines, nextIdx: bNext } = collectBlock(blockLines, idx + 1, bodyIndent);
        idx = bNext;
        let maxIter = 100;
        while (heap !== null && heap.length > 0 && maxIter > 0) {
          maxIter--;
          processBlock(bodyLines, subs);
        }
        continue;
      }

      const rMatch = pt.match(/for\s+(\w+)\s+in\s+range\s*\(\s*(\d+)\s*\)\s*:/);
      const lMatch = pt.match(/for\s+(\w+)\s+in\s+\[([^\]]*)\]\s*:/);
      if (rMatch) {
        const vName = rMatch[1], count = Number(rMatch[2]);
        const bodyIndent = indent + 1;
        const { lines: bodyLines, nextIdx: bNext } = collectBlock(blockLines, idx + 1, bodyIndent);
        idx = bNext;
        for (let iter = 0; iter < count; iter++) {
          processBlock(bodyLines, { ...subs, [vName]: String(iter) });
        }
        continue;
      }
      if (lMatch) {
        const vName = lMatch[1];
        const values = lMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
        const bodyIndent = indent + 1;
        const { lines: bodyLines, nextIdx: bNext } = collectBlock(blockLines, idx + 1, bodyIndent);
        idx = bNext;
        for (const val of values) {
          processBlock(bodyLines, { ...subs, [vName]: val });
        }
        continue;
      }

      const call = pt.match(/(\w+)\s*\(\s*\[([^\]]*)\]\s*\)/);
      if (call && functions[call[1]]) {
        const f = functions[call[1]];
        execLine(`__heaplit__ = [${call[2]}]`);
        processBlock(f.bodyLines, subs);
        idx++;
        continue;
      }

      execLine(applySubs(line, subs));
      idx++;
    }
    return returned;
  }

  snapshot();
  processBlock(lines, null);
  return states;
}

function HeapTree({ items, x, y, level, index, totalWidth }) {
  if (index >= items.length) return null;
  const r = 16;
  const xOff = totalWidth / Math.pow(2, level + 2);
  const leftIdx = 2 * index + 1;
  const rightIdx = 2 * index + 2;
  const leftX = x - xOff;
  const rightX = x + xOff;
  const childY = y + 45;

  return (
    <g>
      {leftIdx < items.length && (
        <>
          <line x1={x} y1={y + r} x2={leftX} y2={childY - r} stroke="var(--border-strong)" strokeWidth={1} />
          <HeapTree items={items} x={leftX} y={childY} level={level + 1} index={leftIdx} totalWidth={totalWidth} />
        </>
      )}
      {rightIdx < items.length && (
        <>
          <line x1={x} y1={y + r} x2={rightX} y2={childY - r} stroke="var(--border-strong)" strokeWidth={1} />
          <HeapTree items={items} x={rightX} y={childY} level={level + 1} index={rightIdx} totalWidth={totalWidth} />
        </>
      )}
      <circle cx={x} cy={y} r={r} fill="#BB9AF715" stroke="#BB9AF7" strokeWidth={2} style={{ animation: "viz-in 0.25s ease-out both" }} />
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fill="var(--text)" fontSize={11} fontFamily="monospace" fontWeight="bold">{items[index].value}</text>
    </g>
  );
}

function VizBody({ items, ghostItems = [] }) {
  if (items === null && ghostItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4" style={{ color: "var(--text-muted)" }}>
        <Triangle size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Create a heap to see it<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>heap = []</code></p>
      </div>
    );
  }

  const allItems = items || [];
  const displayItems = [...allItems, ...ghostItems];
  const depth = Math.ceil(Math.log2(displayItems.length + 1));
  const svgWidth = Math.max(180, Math.pow(2, depth) * 30);
  const svgHeight = depth * 45 + 30;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-1">
        {allItems.map((item) => (
          <AnimatedItem key={item._id}>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold"
              style={{
                background: "var(--bg)",
                border: "2px solid #BB9AF7",
                color: "var(--text)",
              }}
            >
              {item.value}
            </div>
          </AnimatedItem>
        ))}
        {ghostItems.map((item) => (
          <AnimatedItem key={`ghost-${item._id}`} leaving>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold"
              style={{
                background: "var(--bg)",
                border: "2px solid #BB9AF7",
                color: "var(--text-muted)",
                opacity: 0.5,
              }}
            >
              {item.value}
            </div>
          </AnimatedItem>
        ))}
      </div>
      {displayItems.length > 1 && (
        <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ maxWidth: "100%" }}>
          <HeapTree items={displayItems} x={svgWidth / 2} y={20} level={0} index={0} totalWidth={svgWidth} />
        </svg>
      )}
      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        {allItems.length} element{allItems.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

export default function HeapViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);
  const [ghostItems, setGhostItems] = useState([]);
  const prevRef = useRef(null);
  const ghostTimerRef = useRef(null);

  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = null;
    try {
      states = await runHeapViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseHeapStates(code);
    setParsed({ code, states });
    playback.configure(states);
    setLoading(false);
    return states;
  }, [code, parsed, playback]);

  useEffect(() => {
    if (!parsed || playback.step < 0) return;
    const cur = parsed.states[Math.min(playback.step, parsed.states.length - 1)] || [];
    const prev = prevRef.current;
    prevRef.current = cur;
    if (!prev) return;
    if (ghostTimerRef.current) clearTimeout(ghostTimerRef.current);
    const curIds = new Set(cur.map((i) => i._id));
    const removed = prev.filter((i) => !curIds.has(i._id));
    if (removed.length > 0) {
      setGhostItems(removed);
      ghostTimerRef.current = setTimeout(() => { setGhostItems([]); ghostTimerRef.current = null; }, 300);
    } else {
      setGhostItems([]);
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

  const handleReset = useCallback(() => {
    playback.reset();
    setParsed(null);
    setGhostItems([]);
    prevRef.current = null;
  }, [playback]);

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
      <VizBody items={parsed.states[idx]} ghostItems={ghostItems} />
    </div>
  );
}
