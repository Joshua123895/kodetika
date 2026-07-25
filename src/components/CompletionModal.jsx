import { ArrowRight, Check, X } from "lucide-react";
import PixelButton from "./PixelButton";
import StarIcon from "./StarIcon";

export default function CompletionModal({ level, stars, resultInfo, onContinue, onRetry }) {
  const { lineCount, maxLines, execTime, maxTime } = resultInfo || {};

  // Game levels are graded by a goal check (no line-count or run-time), so they
  // show a single "Goal reached" criterion instead of the coding-level rules.
  const criteria = level.game
    ? [{ label: "Goal reached", met: true }]
    : [
        { label: "Complete the level", met: true },
        { label: `≤ ${maxLines} lines (yours: ${lineCount})`, met: lineCount <= maxLines },
        { label: `≤ ${maxTime}s execution (yours: ${execTime?.toFixed(2)}s)`, met: execTime <= maxTime },
      ];

  const allThree = stars === 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "var(--overlay)" }}
        onClick={onContinue}
      />
      <div
        className="relative rounded-2xl p-8 text-center max-w-sm w-full"
        style={{
          background: "var(--bg)",
          border: "3px solid #6AAE6F",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <div className="flex justify-center gap-2 mb-4" style={{ minHeight: 48 }}>
          {[1, 2, 3].map((s) => (
            <span key={s} className="text-3xl" style={{ animationDelay: `${s * 0.1}s` }}>
              <StarIcon filled={s <= stars} className="text-3xl" />
            </span>
          ))}
        </div>

        <h2 className="text-2xl font-bold mb-1"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}>
          {level.game ? "Goal Complete!" : "Quest Complete!"}
        </h2>
        <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
          {level.name} completed!
        </p>

        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: "#E9B44C15", border: "2px solid #E9B44C40" }}
        >
          <div className="text-3xl font-bold mb-1"
            style={{ color: "#E9B44C", fontFamily: "'Courier New', monospace" }}>
            {stars} / 3
          </div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Stars Earned
          </div>
        </div>

        <div className="rounded-xl p-4 mb-4 text-left" style={{ background: "var(--bg)", border: "1.5px solid var(--border)" }}>
          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Star Criteria
          </div>
          <div className="space-y-2">
            {criteria.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span style={{ color: c.met ? "#67C587" : "#FF5F57" }}>
                  {c.met ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                </span>
                <span style={{ color: c.met ? "var(--text)" : "var(--text-secondary)" }}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 justify-center">
          {!allThree && (
            <PixelButton onClick={onRetry} size="md" variant="accent">
              Retry
            </PixelButton>
          )}
          <PixelButton onClick={onContinue} size="lg">
            Continue <ArrowRight size={18} className="inline ml-1" />
          </PixelButton>
        </div>
      </div>
    </div>
  );
}
