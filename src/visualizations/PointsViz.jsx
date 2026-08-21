import { useState, useCallback } from "react";
import { Target, MapPin, Play } from "lucide-react";
import usePlayback from "./usePlayback";
import VizControls from "./VizControls";
import { runKmeansViz, runKnnViz } from "./pointsTrace";

const CLUSTER = ["#7AA2F7", "#E9B44C", "#BB9AF7", "#67C587"];
const QUERY = "#FF5F57";
const DIM = "#5a6070";

const W = 250;
const H = 175;
const PAD = 18;

// Not a hook: plain helper. Named without the `use` prefix so React tooling
// does not treat it as one (it is called after an early return).
function makeScale(all) {
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const px = (x1 - x0) * 0.15 || 1;
  const py = (y1 - y0) * 0.15 || 1;
  return {
    sx: (v) => PAD + ((v - (x0 - px)) / (x1 + px - (x0 - px))) * (W - 2 * PAD),
    // y is flipped so larger values sit higher, the usual convention for a plot
    sy: (v) => H - PAD - ((v - (y0 - py)) / (y1 + py - (y0 - py))) * (H - 2 * PAD),
  };
}

function Empty({ icon: Icon, text, code }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4" style={{ color: "var(--text-muted)" }}>
      <Icon size={36} strokeWidth={1.5} className="mb-3 opacity-30" />
      <p className="text-xs">
        {text}
        <br />
        <code className="text-xs" style={{ color: "var(--text-secondary)" }}>{code}</code>
      </p>
    </div>
  );
}

function KmeansBody({ state }) {
  if (!state) return <Empty icon={Target} text="Move some centroids to watch clusters form" code="centroids = [[0.0, 0.0], [3.0, 3.0]]" />;
  const { points, centroids, assign } = state;
  const { sx, sy } = makeScale([...points, ...centroids]);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: "auto", display: "block" }}>
        {points.map((p, i) => (
          <line key={`l${i}`} x1={sx(p[0])} y1={sy(p[1])} x2={sx(centroids[assign[i]][0])} y2={sy(centroids[assign[i]][1])} stroke={CLUSTER[assign[i] % CLUSTER.length]} strokeWidth="1" opacity="0.3" />
        ))}
        {points.map((p, i) => (
          <circle key={`p${i}`} cx={sx(p[0])} cy={sy(p[1])} r="4" fill={CLUSTER[assign[i] % CLUSTER.length]} />
        ))}
        {centroids.map((c, i) => (
          <g key={`c${i}`}>
            <circle cx={sx(c[0])} cy={sy(c[1])} r="8" fill="none" stroke={CLUSTER[i % CLUSTER.length]} strokeWidth="2" />
            <circle cx={sx(c[0])} cy={sy(c[1])} r="2.5" fill={CLUSTER[i % CLUSTER.length]} />
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap justify-center gap-1.5 mt-2">
        {centroids.map((c, i) => (
          <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: `1px solid ${CLUSTER[i % CLUSTER.length]}`, color: "var(--text)" }}>
            [{c[0].toFixed(2)}, {c[1].toFixed(2)}]
          </span>
        ))}
      </div>
      <div className="text-[11px] font-mono font-bold mt-2 pt-2 w-full text-center" style={{ borderTop: "1px solid var(--border-strong)", color: "var(--text-muted)", minHeight: 14 }}>
        round {state.step + 1} of {state.total}
      </div>
    </div>
  );
}

function KnnBody({ state }) {
  if (!state) return <Empty icon={MapPin} text="Measure some distances to see the neighbours" code="query = [1.4, 1.4]" />;
  const { points, labels, query, distances, revealed, nearest, winner, k } = state;
  const { sx, sy } = makeScale([...points, query]);
  const chosen = new Set(nearest);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: "auto", display: "block" }}>
        {points.map((p, i) =>
          i < revealed ? (
            <line key={`l${i}`} x1={sx(query[0])} y1={sy(query[1])} x2={sx(p[0])} y2={sy(p[1])} stroke={chosen.has(i) ? QUERY : DIM} strokeWidth={chosen.has(i) ? 1.5 : 1} opacity={chosen.has(i) ? 0.9 : 0.35} />
          ) : null
        )}
        {points.map((p, i) => (
          <circle key={`p${i}`} cx={sx(p[0])} cy={sy(p[1])} r={chosen.has(i) ? 6 : 4} fill={CLUSTER[labels[i] % CLUSTER.length]} opacity={i < revealed ? 1 : 0.3} stroke={chosen.has(i) ? "var(--text)" : "none"} strokeWidth="1" />
        ))}
        <g>
          <line x1={sx(query[0]) - 5} y1={sy(query[1])} x2={sx(query[0]) + 5} y2={sy(query[1])} stroke={QUERY} strokeWidth="2" />
          <line x1={sx(query[0])} y1={sy(query[1]) - 5} x2={sx(query[0])} y2={sy(query[1]) + 5} stroke={QUERY} strokeWidth="2" />
        </g>
      </svg>
      <div className="flex flex-wrap justify-center gap-1.5 mt-2">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", color: "var(--text)" }}>
          <span style={{ color: "var(--text-muted)" }}>k=</span>{k}
        </span>
        {revealed > 0 && revealed <= distances.length && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", color: "var(--text)" }}>
            <span style={{ color: "var(--text-muted)" }}>d=</span>{distances[revealed - 1].toFixed(3)}
          </span>
        )}
      </div>
      <div className="text-[11px] font-mono font-bold mt-2 pt-2 w-full text-center" style={{ borderTop: "1px solid var(--border-strong)", color: winner !== null ? "#67C587" : "var(--text-muted)", minHeight: 14 }}>
        {winner !== null ? `class ${winner}` : `measured ${revealed} of ${points.length}`}
      </div>
    </div>
  );
}

function makeViz(runner, Body) {
  return function Viz({ code }) {
    const playback = usePlayback();
    const [parsed, setParsed] = useState(null);
    const [loading, setLoading] = useState(false);

    const ensureParsed = useCallback(async () => {
      if (parsed && parsed.code === code) return parsed.states;
      setLoading(true);
      let states;
      try {
        states = await runner(code);
      } catch {
        states = [];
      }
      setParsed({ code, states });
      playback.configure(states);
      setLoading(false);
      return states;
    }, [code, parsed, playback]);

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
        <Body state={parsed.states[idx]} />
      </div>
    );
  };
}

export const KmeansViz = makeViz(runKmeansViz, KmeansBody);
export const KnnViz = makeViz(runKnnViz, KnnBody);
