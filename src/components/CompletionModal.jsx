import { ArrowRight, Check, X } from "lucide-react";
import PixelButton from "./PixelButton";
import StarIcon from "./StarIcon";
import NoticeBar from "./NoticeBar";
import { NOTICE_ICONS, NOTICE_ACCENTS, GREEN } from "./noticeStyle";

/**
 * What the completion did to the daily goal and the review queue.
 *
 * This used to float in the top-centre dock, and it arrived in the same tick as
 * the modal, so it landed on top of it: over the "Quest Complete!" heading on a
 * phone, over the stars themselves on a desktop. There is no room above a
 * vertically centred modal on a 664px screen, so it moved in here rather than
 * going on fighting for the space.
 */
function NoticeStrip({ notice }) {
  const Icon = NOTICE_ICONS[notice.kind] ?? NOTICE_ICONS.progress;
  const accent = NOTICE_ACCENTS[notice.kind] ?? GREEN;

  return (
    // Keyed on `seq` so two identical results still remount and replay the bar,
    // rather than React deciding nothing changed and leaving it static.
    <div
      key={notice.seq}
      className="rounded-xl p-3 mb-4 text-left notice-in"
      style={{ background: `${accent}12`, border: `1.5px solid ${accent}40` }}
    >
      <div className="flex items-start gap-2.5">
        <Icon size={15} strokeWidth={2.5} style={{ color: accent, flexShrink: 0, marginTop: 1 }} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold" style={{ color: "var(--text)" }}>{notice.title}</div>
          {notice.detail && (
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{notice.detail}</div>
          )}
          {notice.progress && <NoticeBar {...notice.progress} accent={accent} />}
        </div>
      </div>
    </div>
  );
}

export default function CompletionModal({ level, stars, resultInfo, notice, onContinue, onRetry }) {
  const { lineCount, maxLines, execTime, maxTime } = resultInfo || {};

  // Game levels are graded by a goal check (no line-count or run-time), so they
  // show a single criterion instead of the coding-level rules. A game level with
  // no checks is a free-build sandbox, where there is no goal to report on.
  const isSandbox = Boolean(level.game && !level.sourceChecks);
  const criteria = level.game
    ? [{ label: isSandbox ? "Project submitted" : "Goal reached", met: true }]
    : [
        { label: "Complete the level", met: true },
        { label: `≤ ${maxLines} lines (yours: ${lineCount})`, met: lineCount <= maxLines },
        { label: `≤ ${maxTime}s execution (yours: ${execTime?.toFixed(2)}s)`, met: execTime <= maxTime },
      ];

  const allThree = stars === 3;

  return (
    // Scrolls rather than centring-and-clipping. With the notice strip added this
    // card is taller than a short phone (an iPhone SE is 553px), and a plain
    // centred flex box would put Continue off the bottom edge with no way to
    // reach it. The backdrop is fixed so it stays put while the card scrolls.
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 backdrop-blur-sm"
        style={{ background: "var(--overlay)" }}
        onClick={onContinue}
      />
      <div className="relative flex min-h-full items-center justify-center p-4">
      <div
        className="rounded-2xl p-6 sm:p-8 text-center max-w-sm w-full"
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
          {isSandbox ? "Project Complete!" : level.game ? "Goal Complete!" : "Quest Complete!"}
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

        <div className="rounded-xl p-4 mb-4 text-left" style={{ background: "var(--bg)", border: "1.5px solid var(--border-strong)" }}>
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

        {notice && <NoticeStrip notice={notice} />}

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
    </div>
  );
}
