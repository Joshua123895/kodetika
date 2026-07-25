import { useState, useCallback, useEffect, useRef } from "react";
import { Network, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import { splitStatements } from "./parseUtils";
import { runGraphDSViz } from "./graphDSTrace";

const COLORS = ["#FF5F57", "#E9B44C", "#28CA41", "#7AA2F7", "#BB9AF7", "#FF75A0", "#86E1F9", "#A6E3A1"];

// eslint-disable-next-line react-refresh/only-export-components -- exported for unit tests
export function parseGraphStates(code) {
  const lines = splitStatements(code);
  let graphName = null;
  const vertices = new Set();
  const edges = [];
  const states = [];

  const snapshot = () => {
    states.push({ vertices: [...vertices], edges: [...edges], graphName });
  };

  // Reads an adjacency-list dict literal's body (e.g. `0: [1,2], 1: [...]`
  // or `"A": ["B","C"], ...`) and registers each key as a vertex and each
  // entry in its list as a directed edge.
  const addAdjList = (varName, body) => {
    graphName = varName;
    const entryRe = /["']?(\w+)["']?\s*:\s*\[([^\]]*)\]/g;
    let m;
    while ((m = entryRe.exec(body)) !== null) {
      const key = m[1];
      vertices.add(key);
      const neighbors = m[2]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      for (const n of neighbors) {
        vertices.add(n);
        edges.push({ from: key, to: n });
      }
    }
  };

  snapshot();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("#")) { i++; continue; }

    const emptyInit = line.match(/(\w+)\s*=\s*\{\s*\}/);
    if (emptyInit) {
      graphName = emptyInit[1];
      snapshot();
      i++;
      continue;
    }

    const dictStart = line.match(/(\w+)\s*=\s*\{/);
    if (dictStart) {
      // Collect lines until the braces balance, so a dict literal spanning
      // multiple lines (common for adjacency lists) is read as one unit.
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
      addAdjList(dictStart[1], inner);
      snapshot();
      i = j + 1;
      continue;
    }

    const addV = line.match(/add_vertex\s*\(\s*(\w+)\s*,\s*['\"]?(\w+)['\"]?\s*\)/);
    if (addV) {
      vertices.add(addV[2]);
      snapshot();
      i++;
      continue;
    }

    const addE = line.match(/add_edge\s*\(\s*(\w+)\s*,\s*['\"]?(\w+)['\"]?\s*,\s*['\"]?(\w+)['\"]?\s*\)/);
    if (addE) {
      edges.push({ from: addE[2], to: addE[3] });
      vertices.add(addE[2]);
      vertices.add(addE[3]);
      snapshot();
      i++;
      continue;
    }

    const dictAdd = line.match(/(\w+)\[['\"]?(\w+)['\"]?\]\s*=\s*\[/);
    if (dictAdd && graphName) {
      vertices.add(dictAdd[2]);
      snapshot();
      i++;
      continue;
    }

    const dictAppend = line.match(/(\w+)\[['\"]?(\w+)['\"]?\]\.append\s*\(\s*['\"]?(\w+)['\"]?\s*\)/);
    if (dictAppend && dictAppend[1] === graphName) {
      edges.push({ from: dictAppend[2], to: dictAppend[3] });
      vertices.add(dictAppend[2]);
      vertices.add(dictAppend[3]);
      snapshot();
    }
    i++;
  }

  return states;
}

function getCircularLayout(vertices, cx, cy, radius) {
  return vertices.map((v, i) => {
    const angle = (2 * Math.PI * i) / vertices.length - Math.PI / 2;
    return { name: v, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

function VizBody({ graph, ghostVertices = [], ghostEdges = [] }) {
  if (graph.vertices.length === 0 && ghostVertices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4" style={{ color: "var(--text-muted)" }}>
        <Network size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
        <p className="text-xs">Create a graph to see it<br /><code className="text-xs" style={{ color: "var(--text-secondary)" }}>g = {}</code></p>
      </div>
    );
  }

  const allVertices = [...graph.vertices, ...ghostVertices];
  const cx = 90, cy = 90, radius = 65;
  const layout = graph.vertices.length > 0 ? getCircularLayout(graph.vertices, cx, cy, radius) : [];
  const vertexMap = layout.reduce((acc, v) => { acc[v.name] = v; return acc; }, {});

  return (
    <div className="flex flex-col items-center">
      <svg width={180} height={180} viewBox="0 0 180 180" style={{ maxWidth: "100%" }}>
        {graph.edges.map((e, i) => {
          const from = vertexMap[e.from];
          const to = vertexMap[e.to];
          if (!from || !to) return null;
          return (
            <line
              key={`e${i}`}
              x1={from.x} y1={from.y}
              x2={to.x} y2={to.y}
              stroke="var(--border-strong)"
              strokeWidth={1.5}
              opacity={0.6}
            />
          );
        })}
        {ghostEdges.map((e, i) => {
          return (
            <line
              key={`ge${i}`}
              x1={cx} y1={cy}
              x2={cx} y2={cy}
              stroke="var(--border)"
              strokeWidth={1}
              opacity={0}
              style={{ animation: "viz-out 0.2s ease-in both" }}
            />
          );
        })}
        {layout.map((v, i) => (
          <g key={v.name}>
            <circle cx={v.x} cy={v.y} r={18} fill={COLORS[i % COLORS.length] + "20"} stroke={COLORS[i % COLORS.length]} strokeWidth={2} style={{ animation: "viz-in 0.25s ease-out both" }} />
            <text x={v.x} y={v.y + 1} textAnchor="middle" dominantBaseline="middle" fill="var(--text)" fontSize={11} fontFamily="monospace" fontWeight="bold">{v.name}</text>
          </g>
        ))}
        {ghostVertices.map((v, i) => (
          <g key={`g${v}`}>
            <circle cx={cx + (i + 1) * 20} cy={cy} r={18} fill="var(--bg)" stroke="var(--border)" strokeWidth={2} style={{ animation: "viz-out 0.2s ease-in both" }} opacity={0.5} />
            <text x={cx + (i + 1) * 20} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill="var(--text-muted)" fontSize={11} fontFamily="monospace" fontWeight="bold">{v}</text>
          </g>
        ))}
      </svg>
      <div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
        {graph.vertices.length} vert{graph.vertices.length !== 1 ? "ices" : "ex"}, {graph.edges.length} edge{graph.edges.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

export default function GraphViz({ code }) {
  const playback = usePlayback();
  const [parsed, setParsed] = useState(null);
  const [ghostVertices, setGhostVertices] = useState([]);
  const [ghostEdges, setGhostEdges] = useState([]);
  const prevRef = useRef(null);
  const ghostTimerRef = useRef(null);

  const [loading, setLoading] = useState(false);

  const ensureParsed = useCallback(async () => {
    if (parsed && parsed.code === code) return parsed.states;
    setLoading(true);
    let states = null;
    try {
      states = await runGraphDSViz(code);
    } catch {
      // instrumentation failed; fall through to the interpreter below
    }
    if (!states || states.length <= 1) states = parseGraphStates(code);
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

    const prevV = new Set(prev.vertices);
    const curV = new Set(cur.vertices);
    const removedV = prev.vertices.filter((v) => !curV.has(v));

    const prevE = new Set((prev.edges || []).map((e) => `${e.from}->${e.to}`));
    const curE = new Set((cur.edges || []).map((e) => `${e.from}->${e.to}`));
    const removedE = (prev.edges || []).filter((e) => !curE.has(`${e.from}->${e.to}`));

    if (removedV.length > 0 || removedE.length > 0) {
      setGhostVertices(removedV);
      setGhostEdges(removedE);
      ghostTimerRef.current = setTimeout(() => {
        setGhostVertices([]);
        setGhostEdges([]);
        ghostTimerRef.current = null;
      }, 300);
    } else {
      setGhostVertices([]);
      setGhostEdges([]);
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
    setGhostVertices([]);
    setGhostEdges([]);
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
      <VizBody graph={parsed.states[idx]} ghostVertices={ghostVertices} ghostEdges={ghostEdges} />
    </div>
  );
}
