import { Check, Lock, Play } from "lucide-react";
import StarIcon from "./StarIcon";

export default function LevelCard({ level, onClick, stars }) {
  const isCompleted = level.status === "completed";
  const isLocked = level.status === "locked";
  const isUnlocked = level.status === "unlocked";

  return (
    <button
      onClick={() => !isLocked && onClick(level)}
      disabled={isLocked}
      className={`
        relative w-full text-left p-4 rounded-xl transition-colors duration-500
        ${isLocked ? "cursor-not-allowed" : "cursor-pointer hover:-translate-y-0.5 hover:shadow-md"}
      `}
      style={{
        background: isLocked ? "var(--bg-surface)" : "var(--bg-card)",
        border: isCompleted
          ? "2px solid #67C587"
          : isUnlocked
          ? "2px solid #7AA2F7"
          : "2px solid var(--border-strong)",
        opacity: isLocked ? 0.55 : 1,
        boxShadow: isCompleted
          ? "0 2px 12px #67C58720"
          : isUnlocked
          ? "0 2px 12px #7AA2F720"
          : "none",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 flex items-center justify-center text-lg font-bold shrink-0"
          style={{
            background: isCompleted
              ? "#67C58720"
              : isUnlocked
              ? "#7AA2F720"
              : "color-mix(in srgb, var(--text-muted) 12%, transparent)",
            color: isCompleted ? "#67C587" : isUnlocked ? "#7AA2F7" : "var(--text-disabled)",
            fontFamily: "'Courier New', monospace",
          }}
        >
          {isCompleted ? <Check size={16} strokeWidth={3} /> : isLocked ? <Lock size={14} strokeWidth={2.5} /> : level.id}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>
            Level {level.id}
          </div>
          <div
            className="font-bold text-sm truncate"
            style={{
              color: isLocked ? "var(--text-disabled)" : "var(--text)",
              fontFamily: isUnlocked ? "'Courier New', monospace" : "inherit",
            }}
          >
            {level.name}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCompleted && stars > 0 && (
            <div className="flex gap-0.5">
              {[1, 2, 3].map((s) => (
                <StarIcon key={s} filled={s <= stars} className="text-sm" />
              ))}
            </div>
          )}
          {isCompleted && (
            <div
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: "#67C58720", color: "#67C587" }}
            >
              Done
            </div>
          )}
          {isUnlocked && (
            <div
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: "#7AA2F720", color: "#7AA2F7" }}
            >
              <Play size={12} className="inline mr-0.5" /> Play
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
