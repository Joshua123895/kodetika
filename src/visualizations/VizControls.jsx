import { useState } from "react";
import { ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { isMuted, setMuted } from "./vizSound";

// Every control is the same 40x40 square so the row reads as one set of
// buttons. The play/pause button is icon-only for the same reason: a "Run"/
// "Pause" label made it change width as you used it.
const SIZE = 40;

const squareButton = {
  width: SIZE,
  height: SIZE,
  borderRadius: 10,
  background: "var(--bg)",
  border: "1.5px solid var(--border-strong)",
  color: "var(--text-muted)",
};

const buttonClass =
  "flex items-center justify-center shrink-0 transition-all duration-100 hover:brightness-110 active:translate-y-0.5 disabled:opacity-30";

export default function VizControls({ onToggle, onStep, onPrev, playing, step, total }) {
  const [muted, setMutedState] = useState(isMuted());
  const handleMuteToggle = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <button
        onClick={onPrev}
        disabled={step <= 0}
        className={buttonClass}
        style={squareButton}
        title="Previous step"
      >
        <ChevronLeft size={20} strokeWidth={2.5} />
      </button>
      <button
        onClick={onToggle}
        className={buttonClass}
        style={{
          ...squareButton,
          background: playing ? "var(--text-disabled)" : "#6AAE6F",
          border: "none",
          color: "#fff",
        }}
        title={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <Pause size={18} strokeWidth={2.5} fill="currentColor" />
        ) : (
          <Play size={18} strokeWidth={2.5} fill="currentColor" />
        )}
      </button>
      <button
        onClick={onStep}
        disabled={step >= total - 1 || total === 0}
        className={buttonClass}
        style={squareButton}
        title="Step forward"
      >
        <ChevronRight size={20} strokeWidth={2.5} />
      </button>
      <span className="text-xs font-mono min-w-10 text-center" style={{ color: "var(--text-muted)" }}>
        {total > 0 ? `${Math.max(0, step + 1)}/${total}` : ""}
      </span>
      <button
        onClick={handleMuteToggle}
        className={buttonClass}
        style={squareButton}
        title={muted ? "Unmute step sounds" : "Mute step sounds"}
      >
        {muted ? <VolumeX size={18} strokeWidth={2.5} /> : <Volume2 size={18} strokeWidth={2.5} />}
      </button>
    </div>
  );
}
