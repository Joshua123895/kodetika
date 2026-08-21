import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowRight, Braces, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import AnimatedItem from "./AnimatedItem";
import { splitStatements } from "./parseUtils";
import { runHashViz } from "./hashTrace";

const isBucketTable = (entry) => !!entry && !Array.isArray(entry) && Array.isArray(entry.buckets);

// Strips the transient `accessed`/`added`/`updated` badges from every dict
// (and every bucket table) so each new read/write only highlights the key
// touched *this* step, instead of every key ever touched staying lit for
// the rest of the animation.
function clearFlags(hashes) {
  const cleared = {};
  for (const name of Object.keys(hashes)) {
    const entry = hashes[name];
    if (isBucketTable(entry)) {
      cleared[name] = {
        size: entry.size,
        buckets: entry.buckets.map((b) => b.map((p) => ({ key: p.key, val: p.val }))),
      };
    } else {
      cleared[name] = entry.map((pair) => ({ key: pair.key, val: pair.val }));
    }
  }
  return cleared;
}

function extractPairs(body) {
  const pairs = [];
  const pairRe = /["']([^"']*)["']\s*:\s*([^,}]+)/g;
  let m;
  while ((m = pairRe.exec(body)) !== null) {
    pairs.push({ key: m[1], val: m[2].trim() });
  }
  return pairs;
}

// A deterministic, illustrative hash, NOT Python's real hash(), which is
// randomized per process and can't be reproduced here. This exists purely
// to place keys into consistent buckets so re-inserting the same key
// visibly lands in the same slot (letting collision/update behavior show
// correctly), not to predict what a real Python run would print.
function illustrativeBucketIndex(key, size) {
  let h = 0;
  const str = String(key);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return ((h % size) + size) % size;
}

// Scans the whole file (not just what's executed so far) for `class X:`
// bodies that assign `self.buckets`, treating those as bucket-based hash
// table classes so a later `X()` constructor call can be recognized.
function findBucketClasses(lines) {
  const sizes = {};
  let currentClass = null;
  let classIndent = null;
  let pendingSize = 10;
  for (const line of lines) {
    if (!line.trim()) continue;
    const cm = line.match(/^(\s*)class\s+(\w+)\s*:/);
    if (cm) {
      currentClass = cm[2];
      classIndent = cm[1].length;
      pendingSize = 10;
      continue;
    }
    if (currentClass === null) continue;
    const indent = line.length - line.trimStart().length;
    if (indent <= classIndent) { currentClass = null; continue; }
    const sizeMatch = line.match(/def\s+__init__\s*\([^)]*\bsize\s*=\s*(\d+)/);
    if (sizeMatch) pendingSize = Number(sizeMatch[1]);
    if (/self\.buckets\b/.test(line)) sizes[currentClass] = pendingSize;
  }
  return sizes;
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for unit tests
export function parseHashStates(code) {
  const lines = splitStatements(code);
  const bucketClassSizes = findBucketClasses(lines);
  let hashes = {};
  const states = [];

  const snapshot = () => states.push(JSON.parse(JSON.stringify(hashes)));

  snapshot();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("#")) { i++; continue; }

    const ctor = line.match(/(\w+)\s*=\s*(\w+)\s*\(\s*(\d*)\s*\)/);
    if (ctor && bucketClassSizes[ctor[2]] !== undefined) {
      const size = ctor[3] ? Number(ctor[3]) : bucketClassSizes[ctor[2]];
      hashes = clearFlags(hashes);
      hashes[ctor[1]] = { size, buckets: Array.from({ length: size }, () => []) };
      snapshot();
      i++;
      continue;
    }

    const insertCall = line.match(/(\w+)\.insert\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/);
    if (insertCall && isBucketTable(hashes[insertCall[1]])) {
      const table = hashes[insertCall[1]];
      const key = insertCall[2].trim().replace(/^['"]|['"]$/g, "");
      const val = insertCall[3].trim();
      const idx = illustrativeBucketIndex(key, table.size);
      hashes = clearFlags(hashes);
      const bucket = [...hashes[insertCall[1]].buckets[idx]];
      const existing = bucket.findIndex((p) => p.key === key);
      if (existing >= 0) bucket[existing] = { key, val, updated: true };
      else bucket.push({ key, val, added: true });
      const buckets = [...hashes[insertCall[1]].buckets];
      buckets[idx] = bucket;
      hashes[insertCall[1]] = { size: table.size, buckets };
      snapshot();
      i++;
      continue;
    }

    const getCall = line.match(/(\w+)\.get\s*\(\s*(.+?)\s*\)/);
    if (getCall && isBucketTable(hashes[getCall[1]])) {
      const table = hashes[getCall[1]];
      const key = getCall[2].trim().replace(/^['"]|['"]$/g, "");
      const idx = illustrativeBucketIndex(key, table.size);
      hashes = clearFlags(hashes);
      const buckets = hashes[getCall[1]].buckets.map((b, bi) =>
        bi === idx ? b.map((p) => ({ ...p, accessed: p.key === key })) : b
      );
      hashes[getCall[1]] = { size: table.size, buckets };
      snapshot();
      i++;
      continue;
    }

    const init = line.match(/(\w+)\s*=\s*\{\s*\}/);
    if (init) {
      hashes = clearFlags(hashes);
      hashes[init[1]] = [];
      snapshot();
      i++;
      continue;
    }

    // Dict literal, single- or multi-line (e.g. one key per line, a common
    // style the parser used to silently ignore because it only ever looked
    // at one physical line at a time). Collect lines until braces balance.
    const dictStart = line.match(/(\w+)\s*=\s*\{/);
    if (dictStart && !dictStart[0].includes("(")) {
      let depth = 0;
      let started = false;
      let body = "";
      let j = i;
      for (; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === "{") { depth++; started = true; }
          else if (ch === "}") depth--;
        }
        body += lines[j] + "\n";
        if (started && depth === 0) break;
      }
      const inner = body.slice(body.indexOf("{") + 1, body.lastIndexOf("}"));
      const pairs = extractPairs(inner);
      hashes = clearFlags(hashes);
      hashes[dictStart[1]] = pairs;
      snapshot();
      i = j + 1;
      continue;
    }

    const assign = line.match(/(\w+)\[('?[^\]]+?'?)\]\s*=\s*(.+)/);
    if (assign && hashes[assign[1]] && !isBucketTable(hashes[assign[1]])) {
      const key = assign[2].replace(/^['"]|['"]$/g, "");
      const val = assign[3].trim();
      hashes = clearFlags(hashes);
      const copy = [...hashes[assign[1]]];
      const existing = copy.findIndex((p) => p.key === key);
      if (existing >= 0) {
        copy[existing] = { key, val, updated: true };
      } else {
        copy.push({ key, val, added: true });
      }
      hashes[assign[1]] = copy;
      snapshot();
      i++;
      continue;
    }

    const access = line.match(/(\w+)\[('?[^\]]+?'?)\]/);
    if (access && hashes[access[1]] && !isBucketTable(hashes[access[1]])) {
      const key = access[2].replace(/^['"]|['"]$/g, "");
      hashes = clearFlags(hashes);
      hashes[access[1]] = hashes[access[1]].map((p) => ({
        ...p,
        accessed: p.key === key,
      }));
      snapshot();
    }
    i++;
  }

  return states;
}

function pairHighlight(pair) {
  return pair.accessed ? "#7AA2F7" : pair.added ? "#28CA41" : pair.updated ? "#E9B44C" : null;
}

function PairRow({ pair, ghost = false }) {
  const highlight = ghost ? null : pairHighlight(pair);
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-xs"
      style={{
        background: ghost ? "var(--bg)" : highlight ? highlight + "15" : "var(--bg)",
        border: "1.5px solid " + (ghost ? "var(--border-strong)" : highlight || "var(--border-strong)"),
        color: ghost ? "var(--text-muted)" : "var(--text)",
        opacity: ghost ? 0.5 : 1,
      }}
    >
      <span style={{ color: ghost ? "var(--text-muted)" : "#BB9AF7" }}>{pair.key}</span>
      <ArrowRight size={11} strokeWidth={2.5} style={{ color: "var(--text-muted)" }} />
      <span style={{ color: ghost ? "var(--text-muted)" : "#28CA41" }}>{pair.val}</span>
      {!ghost && pair.accessed && <span className="text-[9px]" style={{ color: "#7AA2F7" }}>read</span>}
      {!ghost && pair.added && <span className="text-[9px]" style={{ color: "#28CA41" }}>added</span>}
      {!ghost && pair.updated && <span className="text-[9px]" style={{ color: "#E9B44C" }}>updated</span>}
    </div>
  );
}

function BucketTable({ name, table }) {
  const { size, buckets } = table;
  const filled = buckets.reduce((n, b) => n + b.length, 0);
  return (
    <div className="w-full">
      <div className="text-xs font-bold mb-2 text-center" style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}>
        {name} <span className="text-[10px] font-normal">({size} buckets)</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {buckets.map((bucket, bi) => (
          <div key={bi} className="rounded-lg p-1.5" style={{ border: "1.5px solid var(--border-strong)", background: "var(--bg)" }}>
            <div className="text-[9px] mb-1" style={{ color: "var(--text-muted)" }}>#{bi}</div>
            {bucket.length === 0 ? (
              <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>-</div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {bucket.map((pair) => {
                  const highlight = pairHighlight(pair);
                  return (
                    <AnimatedItem key={pair.key}>
                      <div
                        className="text-[10px] font-mono px-1 py-0.5 rounded truncate"
                        style={{ background: highlight ? highlight + "20" : "transparent", color: highlight || "var(--text)" }}
                        title={`${pair.key} → ${pair.val}`}
                      >
                        {pair.key}→{pair.val}
                      </div>
                    </AnimatedItem>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="text-[10px] text-center mt-1" style={{ color: "var(--text-muted)" }}>
        {filled} entr{filled === 1 ? "y" : "ies"} across {size} buckets
      </div>
    </div>
  );
}

function VizBody({ hashes, ghosts = {} }) {
  const names = Object.keys(hashes);
  const allNames = [...new Set([...names, ...Object.keys(ghosts)])];

  if (allNames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4" style={{ color: "var(--text-muted)" }}>
        <Braces size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Create a dict to see it<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>d = {}</code></p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {allNames.map((name) => {
        const entry = hashes[name];
        if (isBucketTable(entry)) {
          return <BucketTable key={name} name={name} table={entry} />;
        }

        const items = entry || [];
        const ghostItems = ghosts[name] || [];

        return (
          <div key={name} className="w-full">
            <div className="text-xs font-bold mb-2 text-center" style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}>
              {name}
            </div>
            <div className="flex flex-col gap-1">
              {items.length === 0 && ghostItems.length === 0 && (
                <div className="text-xs text-center py-3 rounded-lg" style={{ background: "var(--bg)", border: "2px dashed var(--border-strong)", color: "var(--text-muted)" }}>empty</div>
              )}
              {items.map((pair) => (
                <AnimatedItem key={pair.key}>
                  <PairRow pair={pair} />
                </AnimatedItem>
              ))}
              {ghostItems.map((pair) => (
                <AnimatedItem key={`ghost-${pair.key}`} leaving>
                  <PairRow pair={pair} ghost />
                </AnimatedItem>
              ))}
            </div>
            <div className="text-[10px] text-center mt-1" style={{ color: "var(--text-muted)" }}>
              {items.length} entr{items.length === 1 ? "y" : "ies"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function HashViz({ code }) {
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
      states = await runHashViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseHashStates(code);
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
      const prevEntry = prev[name];
      const curEntry = cur[name];
      // Bucket tables never shrink in these lessons (no delete), so skip
      // the plain-array ghost diff for them rather than risk a crash.
      if (isBucketTable(prevEntry) || isBucketTable(curEntry)) continue;
      const prevItems = prevEntry || [];
      const curItems = curEntry || [];
      const curKeys = new Set(curItems.map((i) => i.key));
      const removed = prevItems.filter((i) => !curKeys.has(i.key));
      if (removed.length > 0) g[name] = removed;
    }
    if (Object.keys(g).length > 0) {
      // The playback clock is an external system: this effect reacts to a step
      // landing by flashing what just disappeared for 300ms. Deriving it during
      // render would restart the fade on every unrelated re-render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <VizBody hashes={parsed.states[idx]} ghosts={ghosts} />
    </div>
  );
}
