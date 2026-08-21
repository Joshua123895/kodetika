import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowRight, Check, ChevronUp, Link2, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import AnimatedItem from "./AnimatedItem";
import { splitStatements } from "./parseUtils";
import { runLinkedViz } from "./linkedTrace";

// eslint-disable-next-line react-refresh/only-export-components -- exported for unit tests
export function parseLinkedListStates(code) {
  const lines = splitStatements(code);
  const nodes = {};
  const chain = [];
  const pointers = [];
  const states = [];
  let idCounter = 0;

  const makeNode = (varName, val) => {
    return { _id: ++idCounter, var: varName, val };
  };

  const renameNode = (oldVar, newVar) => {
    if (!nodes[oldVar]) return;
    nodes[oldVar].var = newVar;
    nodes[newVar] = nodes[oldVar];
    delete nodes[oldVar];
    for (const c of chain) {
      if (c.from === oldVar) c.from = newVar;
      if (c.to === oldVar) c.to = newVar;
    }
  };

  const displaceVar = (name) => {
    if (nodes[name]) {
      const newName = "_old_" + name + "_" + (++idCounter);
      renameNode(name, newName);
      return newName;
    }
    return null;
  };

  const getNodeId = (varName) => {
    if (nodes[varName]) return nodes[varName]._id;
    const p = pointers.find((x) => x.var === varName);
    return p ? p.targetId : null;
  };

  const findTail = (name) => {
    let cur = name;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const next = chain.find((c) => c.from === cur);
      if (!next) return cur;
      cur = next.to;
    }
    return cur;
  };

  const computeState = (ptrs) => {
    const ordered = [];
    const seenIds = new Set();
    const src = ptrs || pointers;

    const nodeByName = {};
    for (const k of Object.keys(nodes)) {
      nodeByName[k] = nodes[k];
    }
    for (const p of src) {
      if (nodeByName[p.var]) continue;
      for (const k of Object.keys(nodes)) {
        if (nodes[k]._id === p.targetId) {
          nodeByName[p.var] = nodes[k];
          break;
        }
      }
    }

    const incoming = {};
    for (const c of chain) {
      incoming[c.to] = (incoming[c.to] || 0) + 1;
    }

    let head = null;
    for (const name of Object.keys(nodeByName)) {
      if (name.startsWith("_")) continue;
      if (!incoming[name]) { head = name; break; }
    }

    let cur = head;
    while (cur && nodeByName[cur]) {
      const node = nodeByName[cur];
      if (seenIds.has(node._id)) break;
      seenIds.add(node._id);
      ordered.push(node);
      const next = chain.find((c) => c.from === cur);
      cur = next ? next.to : null;
    }

    for (const name of Object.keys(nodeByName)) {
      const node = nodeByName[name];
      if (!seenIds.has(node._id)) {
        seenIds.add(node._id);
        ordered.push(node);
      }
    }

    return { ordered, chain: chain.map((c) => ({ ...c })), pointers: src.map((p) => ({ ...p })) };
  };

  states.push(computeState());

  const getIndent = (s) => s.length - s.trimStart().length;

  const evalWhileCondition = (condLine) => {
    const m = condLine.match(/while\s+(\w+)\.next\s*(!= None)?\s*:/);
    if (!m) return true;
    const varName = m[1];
    const id = getNodeId(varName);
    if (id == null) return false;
    let key = null;
    for (const k of Object.keys(nodes)) {
      if (nodes[k]._id === id) { key = k; break; }
    }
    if (!key) return false;
    return chain.some((c) => c.from === key);
  };

  const execLine = (line) => {
    const t = line.trim();
    if (t.startsWith("#") || t.startsWith("class ") || t.startsWith("def ") || t.startsWith("return")) return false;

    const inlineNode = line.match(/(\w+(?:\.next)+)\s*=\s*Node\s*\(\s*(\d+)\s*\)/);
    if (inlineNode) {
      const leftSide = inlineNode[1];
      const val = inlineNode[2];
      const parts = leftSide.split(".next");
      const baseVar = parts[0];
      const newVar = "_n_" + val + "_" + (++idCounter);
      nodes[newVar] = makeNode(newVar, val);
      nodes[newVar].isNew = true;
      let srcKey = baseVar;
      for (let p = 1; p < parts.length - 1; p++) {
        if (!srcKey || !nodes[srcKey]) break;
        const lnk = chain.find((c) => c.from === srcKey);
        srcKey = lnk ? lnk.to : null;
      }
      if (srcKey && nodes[srcKey] && srcKey !== newVar) {
        chain.push({ from: srcKey, to: newVar });
      }
      states.push(computeState());
      return true;
    }

    const nodeCreate = line.match(/(\w+)\s*=\s*Node\s*\(\s*(\d+)\s*\)/);
    if (nodeCreate) {
      displaceVar(nodeCreate[1]);
      nodes[nodeCreate[1]] = makeNode(nodeCreate[1], nodeCreate[2]);
      states.push(computeState());
      return true;
    }

    const link = line.match(/(\w+)\.next\s*=\s*(\w+)/);
    if (link && nodes[link[1]] && nodes[link[2]]) {
      chain.push({ from: link[1], to: link[2] });
      states.push(computeState());
      return true;
    }

    const ihAssign = line.match(/(\w+)\s*=\s*insert_head\s*\(\s*(\w+)\s*,\s*(\d+)\s*\)/);
    if (ihAssign) {
      const targetVar = ihAssign[1];
      const listVar = ihAssign[2];
      const val = ihAssign[3];
      const displaced = displaceVar(targetVar);
      nodes[targetVar] = makeNode(targetVar, val);
      nodes[targetVar].isNew = true;
      const toLink = (targetVar === listVar) ? (displaced || listVar) : listVar;
      if (toLink && toLink !== targetVar) {
        chain.unshift({ from: targetVar, to: toLink });
      }
      states.push(computeState());
      return true;
    }

    const ihPlain = line.match(/insert_head\s*\(\s*(\w+)\s*,\s*(\d+)\s*\)/);
    if (ihPlain) {
      const listVar = ihPlain[1];
      const val = ihPlain[2];
      const newVar = "_h_" + val + "_" + (++idCounter);
      nodes[newVar] = makeNode(newVar, val);
      nodes[newVar].isNew = true;
      if (nodes[listVar] && listVar !== newVar) {
        chain.unshift({ from: newVar, to: listVar });
      }
      states.push(computeState());
      return true;
    }

    const itAssign = line.match(/(\w+)\s*=\s*insert_tail\s*\(\s*(\w+)\s*,\s*(\d+)\s*\)/);
    if (itAssign) {
      const listVar = itAssign[2];
      const val = itAssign[3];
      const newVar = "_t_" + val + "_" + (++idCounter);
      const tail = findTail(listVar);
      nodes[newVar] = makeNode(newVar, val);
      nodes[newVar].isNew = true;
      chain.push({ from: tail, to: newVar });
      states.push(computeState());
      return true;
    }

    const itPlain = line.match(/insert_tail\s*\(\s*(\w+)\s*,\s*(\d+)\s*\)/);
    if (itPlain) {
      const listVar = itPlain[1];
      const val = itPlain[2];
      const newVar = "_t_" + val + "_" + (++idCounter);
      const tail = findTail(listVar);
      nodes[newVar] = makeNode(newVar, val);
      nodes[newVar].isNew = true;
      chain.push({ from: tail, to: newVar });
      states.push(computeState());
      return true;
    }

    const doDelete = (valToDelete) => {
      let targetKey = null;
      for (const k of Object.keys(nodes)) {
        if (nodes[k].val === valToDelete) { targetKey = k; break; }
      }
      if (!targetKey) return;
      const incomingLink = chain.find((c) => c.to === targetKey);
      const outgoingLink = chain.find((c) => c.from === targetKey);
      if (incomingLink) {
        const idx = chain.indexOf(incomingLink);
        chain.splice(idx, 1);
        if (outgoingLink) {
          chain.push({ from: incomingLink.from, to: outgoingLink.to });
        }
      }
      if (outgoingLink) {
        const idx = chain.indexOf(outgoingLink);
        chain.splice(idx, 1);
      }
      delete nodes[targetKey];
    };

    const delAssign = line.match(/(\w+)\s*=\s*delete_node\s*\(\s*(\w+)\s*,\s*(\d+)\s*\)/);
    if (delAssign) {
      doDelete(delAssign[3]);
      states.push(computeState());
      return true;
    }

    const delPlain = line.match(/delete_node\s*\(\s*(\w+)\s*,\s*(\d+)\s*\)/);
    if (delPlain) {
      doDelete(delPlain[2]);
      states.push(computeState());
      return true;
    }

    const searchCall = line.match(/(\w+\s*=\s*)?search\s*\(\s*(\w+)\s*,\s*(\d+)\s*\)/);
    if (searchCall) {
      const headVar = searchCall[2];
      const searchVal = searchCall[3];
      const headId = getNodeId(headVar);
      if (headId != null) {
        let key = headVar;
        const visited = new Set();
        while (key && nodes[key] && !visited.has(key)) {
          visited.add(key);
          const node = nodes[key];
          const searchPtrs = pointers.map((p) => ({ ...p }));
          const cIdx = searchPtrs.findIndex((p) => p.var === 'c');
          if (cIdx >= 0) searchPtrs[cIdx].targetId = node._id;
          else searchPtrs.push({ var: 'c', targetId: node._id });
          const st = computeState(searchPtrs);
          st.searchTarget = searchVal;
          st.searchMatch = node.val === searchVal;
          states.push(st);
          if (node.val === searchVal) break;
          const link = chain.find((c) => c.from === key);
          key = link ? link.to : null;
        }
      }
      return true;
    }

    const traversal = line.match(/(\w+)\s*=\s*(\w+)\.next/);
    if (traversal) {
      const targetVar = traversal[1];
      const sourceVar = traversal[2];
      const sourceId = getNodeId(sourceVar);
      if (sourceId != null) {
        let key = null;
        for (const k of Object.keys(nodes)) {
          if (nodes[k]._id === sourceId) { key = k; break; }
        }
        if (key) {
          const nextLink = chain.find((c) => c.from === key);
          if (nextLink) {
            const nextNode = nodes[nextLink.to];
            if (nextNode) {
              const existing = pointers.findIndex((p) => p.var === targetVar);
              if (existing >= 0) pointers[existing].targetId = nextNode._id;
              else pointers.push({ var: targetVar, targetId: nextNode._id });
              states.push(computeState());
              return true;
            }
          }
        }
      }
      return false;
    }

    const alias = line.match(/(\w+)\s*=\s*(\w+)/);
    if (alias && alias[1] !== alias[2]) {
      const targetVar = alias[1];
      const sourceVar = alias[2];
      const sourceId = getNodeId(sourceVar);
      if (sourceId != null) {
        displaceVar(targetVar);
        const existing = pointers.findIndex((p) => p.var === targetVar);
        if (existing >= 0) pointers[existing].targetId = sourceId;
        else pointers.push({ var: targetVar, targetId: sourceId });
        states.push(computeState());
        return true;
      }
    }
    return false;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    const indent = getIndent(line);

    if (t.startsWith("while ") && evalWhileCondition(t)) {
      const bodyIndent = indent + 1;
      const bodyLines = [];
      let j = i + 1;
      while (j < lines.length && getIndent(lines[j]) >= bodyIndent) {
        if (getIndent(lines[j]) >= bodyIndent) {
          bodyLines.push(lines[j]);
        }
        j++;
      }
      let maxIter = 20;
      while (evalWhileCondition(t) && maxIter > 0) {
        maxIter--;
        for (const bl of bodyLines) {
          execLine(bl);
        }
      }
      i = j;
    } else {
      const t2 = line.trim();
      if (!t2.startsWith("while ") && !t2.startsWith("for ") && !t2.startsWith("if ") && !t2.startsWith("else") && !t2.startsWith("elif ") && !t2.startsWith("try ") && !t2.startsWith("except ") && !t2.startsWith("finally ") && !t2.startsWith("with ")) {
        if (!execLine(line)) {
          const innerSearch = line.match(/(\w+\s*=\s*)?search\s*\(\s*(\w+)\s*,\s*(\d+)\s*\)/);
          if (innerSearch) execLine(line);
        }
      }
      i++;
    }
  }

  return states;
}

function VizBody({ list, ghostOrdered = [] }) {
  const { ordered, chain, pointers = [], searchTarget, searchMatch } = list;

  if (ordered.length === 0 && ghostOrdered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4" style={{ color: "var(--text-muted)" }}>
        <Link2 size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Create some nodes to see them<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>a = Node(5)</code></p>
      </div>
    );
  }

  const allNodes = [...ordered, ...ghostOrdered];
  const children = chain.reduce((acc, link) => {
    if (!acc[link.from]) acc[link.from] = [];
    acc[link.from].push(link.to);
    return acc;
  }, {});

  const hasNext = (varName) => children[varName] && children[varName].length > 0;

  const pointerMap = {};
  for (const p of pointers) {
    if (!pointerMap[p.targetId]) pointerMap[p.targetId] = [];
    pointerMap[p.targetId].push(p.var);
  }

  const isPointed = (node) => pointerMap[node._id] && pointerMap[node._id].length > 0;

  return (
    <div className="flex flex-col items-center">
      {searchTarget != null && (
        <div className="text-[10px] font-mono mb-1" style={{ color: "var(--text-muted)" }}>
          Search for <span style={{ color: "#E9B44C", fontWeight: "bold" }}>{searchTarget}</span>
          {searchMatch ? <span className="inline-flex items-center gap-1" style={{ color: "#6AAE6F", marginLeft: 6 }}><Check size={11} strokeWidth={3} /> Found</span> : null}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-1 p-2">
        {allNodes.map((node) => {
          const isGhost = node._ghost;
          const pointed = isPointed(node);
          const isSearchMatch = searchMatch && pointed && node.val === searchTarget;
          return (
            <AnimatedItem key={node._id} leaving={isGhost}>
              <div className="flex items-center gap-0">
                <div
                  className="rounded-lg px-3 py-2 text-center font-mono text-sm font-bold min-w-[48px]"
                  style={{
                    background: isGhost ? "var(--bg)" : isSearchMatch ? "#6AAE6F30" : pointed ? "#E9B44C20" : "#7AA2F715",
                    border: "2px solid " + (isGhost ? "var(--border-strong)" : isSearchMatch ? "#6AAE6F" : node.isNew ? "#E9B44C" : pointed ? "#E9B44C" : "#7AA2F7"),
                    color: isGhost ? "var(--text-muted)" : "var(--text)",
                    opacity: isGhost ? 0.5 : 1,
                  }}
                >
                  <div>{node.val}</div>
                  <div className="text-[9px] font-normal mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {node.var}
                  </div>
                  {pointed && pointerMap[node._id].map((pv) => (
                    <div key={pv} className="text-[8px] font-normal leading-tight" style={{ color: isSearchMatch ? "#6AAE6F" : "#E9B44C" }}>
                      {isSearchMatch ? <Check size={9} strokeWidth={3} className="inline" /> : <ChevronUp size={9} strokeWidth={3} className="inline" />} {pv}
                    </div>
                  ))}
                </div>
                {!isGhost && hasNext(node.var) && (
                  <div className="mx-1" style={{ color: "var(--text-muted)" }}>
                    <ArrowRight size={16} strokeWidth={2.5} />
                  </div>
                )}
              </div>
            </AnimatedItem>
          );
        })}
      </div>
    </div>
  );
}

export default function LinkedListViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);
  const [ghostOrdered, setGhostOrdered] = useState([]);
  const prevRef = useRef(null);
  const ghostTimerRef = useRef(null);

  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = null;
    try {
      states = await runLinkedViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseLinkedListStates(code);
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

    const curIds = new Set(cur.ordered.map((n) => n._id));
    const removed = prev.ordered.filter((n) => !curIds.has(n._id));

    if (removed.length > 0) {
      setGhostOrdered(removed.map((n) => ({ ...n, _ghost: true })));
      ghostTimerRef.current = setTimeout(() => { setGhostOrdered([]); ghostTimerRef.current = null; }, 300);
    } else {
      setGhostOrdered([]);
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
      <VizBody list={parsed.states[idx]} ghostOrdered={ghostOrdered} />
    </div>
  );
}
