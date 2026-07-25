import { useState, useCallback, useEffect, useRef } from "react";
import { List, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import AnimatedItem from "./AnimatedItem";
import { splitStatements } from "./parseUtils";
import { runQueueViz } from "./queueTrace";

// eslint-disable-next-line react-refresh/only-export-components -- exported for unit tests
export function parseQueueStates(code) {
  const lines = splitStatements(code);
  const queues = {};
  let itemId = 0;
  const states = [];
  const functions = {};

  const snapshot = () => states.push(JSON.parse(JSON.stringify(queues)));
  const getIndent = (s) => s.length - s.trimStart().length;

  const execLine = (line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.startsWith("class ") || /\bself\./.test(trimmed)) return;
    const init = line.match(/(\w+)\s*=\s*\[\s*\]/);
    if (init) {
      queues[init[1]] = [];
      snapshot();
      return;
    }

    const initDeque = line.match(/(\w+)\s*=\s*deque\(\s*\)/);
    if (initDeque) {
      queues[initDeque[1]] = [];
      snapshot();
      return;
    }

    const initCtor = line.match(/(\w+)\s*=\s*\w+\s*\([^)]*\)/);
    if (initCtor) {
      queues[initCtor[1]] = [];
      snapshot();
      return;
    }

    const enq = line.match(/(\w+)\.(?:append|enqueue|appendleft)\s*\((.+?)\)/);
    if (enq && queues[enq[1]] !== undefined) {
      const isLeft = enq[0].includes("appendleft");
      const item = { val: enq[2], side: isLeft ? "left" : "right", _id: itemId++ };
      queues[enq[1]] = isLeft ? [item, ...queues[enq[1]]] : [...queues[enq[1]], item];
      snapshot();
      return;
    }

    const deq = line.match(/(\w+)\.(?:pop|dequeue|popleft)\s*\(\s*(\d*)\s*\)/);
    if (deq && queues[deq[1]] !== undefined) {
      const copy = [...queues[deq[1]]];
      const opName = deq[0].match(/\.(\w+)\s*\(/)[1];
      if (opName === "popleft" || opName === "dequeue" || deq[2] === "0") {
        copy.shift();
      } else {
        copy.pop();
      }
      queues[deq[1]] = copy;
      snapshot();
    }
  };

  function applySubs(text, subs) {
    if (!subs) return text;
    let r = text;
    for (const [k, v] of Object.entries(subs)) {
      r = r.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
    }
    return r;
  }

  function evalCondition(cond, st) {
    const c = cond.trim();
    const notEmpty = c.match(/^not\s+(\w+)\.is_empty\s*\(\s*\)$/);
    if (notEmpty) {
      const q = st[notEmpty[1]];
      return q && q.length > 0;
    }
    const simpleVar = c.match(/^(\w+)$/);
    if (simpleVar) {
      const v = st[simpleVar[1]];
      return v && v.length > 0;
    }
    const notMatch = c.match(/^not\s+(\w+)$/);
    if (notMatch) {
      const v = st[notMatch[1]];
      return !v || v.length === 0;
    }
    const lenMatch = c.match(/^len\s*\(\s*(\w+)\s*\)\s*==\s*0$/);
    if (lenMatch) {
      const v = st[lenMatch[1]];
      return !v || v.length === 0;
    }
    const eqMatch = c.match(/^(["'])((?:(?!\1).)*)\1\s*==\s*(["'])((?:(?!\3).)*)\3$/);
    if (eqMatch) return eqMatch[2] === eqMatch[4];
    return false;
  }

  function evalWhileCondition(cond, subs) {
    const c = applySubs(cond, subs);
    const notEmpty = c.match(/^not\s+(\w+)\.is_empty\s*\(\s*\)$/);
    if (notEmpty) {
      const q = queues[notEmpty[1]];
      return q && q.length > 0;
    }
    const simpleVar = c.match(/^(\w+)$/);
    if (simpleVar) {
      const v = queues[simpleVar[1]];
      return v && v.length > 0;
    }
    return evalCondition(cond, queues);
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

  function processBlock(blockLines, subs) {
    let returned = false;
    let idx = 0;
    while (idx < blockLines.length && !returned) {
      const line = blockLines[idx];
      const indent = getIndent(line);
      const t = line.trim();
      const pt = applySubs(t, subs);

      if (pt.startsWith("#") || pt.startsWith("class ") || /\bself\./.test(pt)) { idx++; continue; }

      const defMatch = pt.match(/def\s+(\w+)\s*\(([^)]*)\)\s*:/);
      if (defMatch) {
        const fName = defMatch[1];
        const fParams = defMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
        const fBodyIndent = indent + 1;
        const { lines: fBody, nextIdx: fNext } = collectBlock(blockLines, idx + 1, fBodyIndent);
        functions[fName] = { params: fParams, bodyLines: fBody, bodyIndent: fBodyIndent };
        idx = fNext;
        continue;
      }

      if (pt.startsWith("return ")) { returned = true; idx++; continue; }

      if (pt.startsWith("if ") || pt.startsWith("elif ")) {
        const condStr = pt.replace(/^(if|elif)\s+/, "").replace(/:$/, "").trim();
        const result = evalCondition(condStr, queues);
        const blockIndent = indent + 1;
        idx++;
        const { lines: trueBlock, nextIdx: tbNext } = collectBlock(blockLines, idx, blockIndent);
        if (result) processBlock(trueBlock, subs);
        idx = tbNext;

        let handled = result;
        while (idx < blockLines.length) {
          const nT = applySubs(blockLines[idx].trim(), subs);
          const nI = getIndent(blockLines[idx]);
          if (nI !== indent) break;
          if (nT.startsWith("elif ")) {
            const elCond = nT.replace(/^elif\s+/, "").replace(/:$/, "").trim();
            const elResult = evalCondition(elCond, queues);
            idx++;
            const { lines: elBlock, nextIdx: elNext } = collectBlock(blockLines, idx, blockIndent);
            if (!handled && elResult) {
              processBlock(elBlock, subs);
              handled = true;
            }
            idx = elNext;
          } else if (nT.startsWith("else:")) {
            idx++;
            const { lines: elseBlock, nextIdx: esNext } = collectBlock(blockLines, idx, blockIndent);
            if (!handled) processBlock(elseBlock, subs);
            idx = esNext;
            break;
          } else { break; }
        }
        continue;
      }

      if (pt.startsWith("else:")) {
        const blockIndent = indent + 1;
        idx++;
        const { lines: elseBlock, nextIdx: esNext } = collectBlock(blockLines, idx, blockIndent);
        processBlock(elseBlock, subs);
        idx = esNext;
        continue;
      }

      const whileMatch = pt.match(/while\s+(.+?)\s*:/);
      if (whileMatch) {
        const condition = whileMatch[1].trim();
        const bodyIndent = indent + 1;
        const { lines: bodyLines, nextIdx: bNext } = collectBlock(blockLines, idx + 1, bodyIndent);
        idx = bNext;
        let maxIter = 100;
        while (evalWhileCondition(condition, subs) && maxIter > 0) {
          maxIter--;
          processBlock(bodyLines, subs);
        }
        continue;
      }

      const rMatch = pt.match(/for\s+(\w+)\s+in\s+range\s*\(\s*(\d+)\s*\)\s*:/);
      const lMatch = pt.match(/for\s+(\w+)\s+in\s+\[([^\]]*)\]\s*:/);
      const sMatch = pt.match(/for\s+(\w+)\s+in\s+"([^"]*)"\s*:/);
      const sMatch2 = pt.match(/for\s+(\w+)\s+in\s+'([^']*)'\s*:/);

      if (rMatch) {
        const vName = rMatch[1], count = Number(rMatch[2]);
        const bodyIndent = indent + 1;
        const { lines: bodyLines, nextIdx: bNext } = collectBlock(blockLines, idx + 1, bodyIndent);
        idx = bNext;
        for (let iter = 0; iter < count; iter++) {
          const newSubs = { ...subs, [vName]: String(iter) };
          processBlock(bodyLines, newSubs);
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
          const newSubs = { ...subs, [vName]: val };
          processBlock(bodyLines, newSubs);
        }
        continue;
      }

      if (sMatch || sMatch2) {
        const m = sMatch || sMatch2;
        const vName = m[1];
        const str = m[2];
        const bodyIndent = indent + 1;
        const { lines: bodyLines, nextIdx: bNext } = collectBlock(blockLines, idx + 1, bodyIndent);
        idx = bNext;
        for (const ch of str) {
          const newSubs = { ...subs, [vName]: JSON.stringify(ch) };
          processBlock(bodyLines, newSubs);
        }
        continue;
      }

      const funcCall = pt.match(/(?:print\s*\(\s*)?(\w+)\s*\(\s*"([^"]*)"\s*\)\s*(?:\)\s*)?/);
      if (funcCall && functions[funcCall[1]]) {
        const f = functions[funcCall[1]];
        const arg = funcCall[2];
        if (f.params.length > 0) {
          const newSubs = { ...subs, [f.params[0]]: JSON.stringify(arg) };
          processBlock(f.bodyLines, newSubs);
        }
        idx++;
        continue;
      }

      const funcCallQ = pt.match(/(?:print\s*\(\s*)?(\w+)\s*\(\s*'([^']*)'\s*\)\s*(?:\)\s*)?/);
      if (funcCallQ && functions[funcCallQ[1]]) {
        const f = functions[funcCallQ[1]];
        const arg = funcCallQ[2];
        if (f.params.length > 0) {
          const newSubs = { ...subs, [f.params[0]]: JSON.stringify(arg) };
          processBlock(f.bodyLines, newSubs);
        }
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

function VizBody({ queues, ghosts = {} }) {
  const names = Object.keys(queues);
  const allNames = [...new Set([...names, ...Object.keys(ghosts)])];

  if (allNames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4" style={{ color: "var(--text-muted)" }}>
        <List size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Create a queue to see it<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>q = []</code></p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {allNames.map((name) => {
        const items = queues[name] || [];
        const ghostEntries = ghosts[name] || [];

        const merged = [];
        let gi = 0;
        for (let ci = 0; ci < items.length; ci++) {
          while (gi < ghostEntries.length && ghostEntries[gi].index <= ci + gi) {
            merged.push({ item: ghostEntries[gi].item, ghost: true });
            gi++;
          }
          merged.push({ item: items[ci], ghost: false });
        }
        while (gi < ghostEntries.length) {
          merged.push({ item: ghostEntries[gi].item, ghost: true });
          gi++;
        }

        const firstRealIdx = merged.findIndex((e) => !e.ghost);

        return (
          <div key={name} className="w-full">
            <div className="text-xs font-bold mb-2 text-center" style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}>
              {name}
            </div>
            <div className="flex items-center justify-center gap-0 max-w-full overflow-x-auto">
              <div className="text-xs mr-1 shrink-0" style={{ color: "#28CA41" }}>front</div>
              <div className="flex shrink-0" style={{ direction: "ltr" }}>
                {merged.length === 0 && (
                  <div className="text-xs px-4 py-3 rounded-lg" style={{ background: "var(--bg)", border: "2px dashed var(--border-strong)", color: "var(--text-muted)" }}>empty</div>
                )}
                {merged.map((entry, i) => {
                  const isGhost = entry.ghost;
                  const isFront = !isGhost && i === firstRealIdx;
                  if (isGhost) {
                    return (
                      <AnimatedItem key={`ghost-${entry.item._id}`} leaving>
                        <div
                          className="px-3 py-2 text-center font-mono text-sm font-bold mx-[1px] first:rounded-l-lg last:rounded-r-lg"
                          style={{
                            background: "var(--bg)",
                            border: "2px solid var(--border-strong)",
                            color: "var(--text-muted)",
                            opacity: 0.6,
                            borderLeft: i > 0 ? "none" : "2px solid var(--border-strong)",
                          }}
                        >
                          {entry.item.val}
                        </div>
                      </AnimatedItem>
                    );
                  }
                  return (
                    <AnimatedItem key={entry.item._id}>
                      <div
                        className="px-3 py-2 text-center font-mono text-sm font-bold mx-[1px] first:rounded-l-lg last:rounded-r-lg"
                        style={{
                          background: isFront ? "#28CA4120" : "var(--bg)",
                          border: "2px solid" + (isFront ? "#28CA41" : "var(--border-strong)"),
                          color: "var(--text)",
                          borderLeft: i > 0 ? "none" : "2px solid " + (isFront ? "#28CA41" : "var(--border-strong)"),
                        }}
                      >
                        {entry.item.val}
                      </div>
                    </AnimatedItem>
                  );
                })}
              </div>
              <div className="text-xs ml-1 shrink-0" style={{ color: "#FF5F57" }}>rear</div>
            </div>
            <div className="text-[10px] text-center mt-1" style={{ color: "var(--text-muted)" }}>
              {items.length} item{items.length !== 1 ? "s" : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function QueueViz({ code }) {
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
      states = await runQueueViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseQueueStates(code);
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
      const prevItems = prev[name] || [];
      const curItems = cur[name] || [];
      const curIds = new Set(curItems.map((i) => i._id));
      const removed = [];
      for (let ri = 0; ri < prevItems.length; ri++) {
        if (!curIds.has(prevItems[ri]._id)) {
          removed.push({ item: prevItems[ri], index: ri });
        }
      }
      if (removed.length > 0) g[name] = removed;
    }
    if (Object.keys(g).length > 0) {
      setGhosts(g);
      ghostTimerRef.current = setTimeout(() => { setGhosts({}); ghostTimerRef.current = null; }, 300);
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

  const handleReset = useCallback(() => {
    playback.reset();
    setParsed(null);
    setGhosts({});
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
      <VizBody queues={parsed.states[idx]} ghosts={ghosts} />
    </div>
  );
}
