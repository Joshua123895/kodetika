import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ChevronDown, RotateCcw, Sparkles, X } from "lucide-react";
import { TRACKS } from "../data/tracks";
import { useProgress } from "../hooks/useProgress";
import { loadPractice } from "../lib/practice";
import { getSession, clearSession, sessionReport } from "../lib/reviewSession";
import PixelButton from "../components/PixelButton";

const GREEN = "#6AAE6F";
const AMBER = "#E9B44C";
const RED = "#FF5F57";

const STATUS = {
  promoted: { icon: Check, color: GREEN, label: "promoted" },
  retired: { icon: Sparkles, color: AMBER, label: "retired" },
  fellback: { icon: X, color: RED, label: "back to the start" },
  pending: { icon: ChevronDown, color: "var(--text-muted)", label: "" },
};

export default function ReviewPage() {
  const navigate = useNavigate();
  const { progress } = useProgress();
  // Bumped by "start fresh" so a cleared session recomputes without a reload.
  const [tick, setTick] = useState(0);

  // The session freezes on first visit today; coming back from a level reuses
  // it, which is what makes the statuses and the summary possible at all.
  const report = useMemo(() => {
    const session = getSession(TRACKS, progress);
    if (!session) return null;
    return sessionReport(session, progress, loadPractice().review || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, tick]);

  const next = report?.items.find((i) => i.status === "pending");

  if (!report) {
    return (
      <div className="min-h-screen px-4 pt-24 pb-16 relative z-10">
        <div className="max-w-md mx-auto text-center">
          <RotateCcw size={22} strokeWidth={2} style={{ color: GREEN, margin: "0 auto" }} />
          <h1
            className="text-2xl font-bold mt-4 mb-2"
            style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
          >
            All clear
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Nothing is due for review. Levels you pass below three stars, and levels on their
            spaced schedule, will queue up here.
          </p>
          <div className="mt-6">
            <PixelButton onClick={() => navigate("/")} size="md">
              Home
            </PixelButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pt-24 pb-16 relative z-10">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate("/")}
          className="text-xs flex items-center gap-1.5 mb-4 hover:gap-2.5 transition-all"
          style={{ color: GREEN }}
        >
          <ArrowLeft size={13} strokeWidth={2.5} /> Home
        </button>

        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
        >
          Review
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          {report.finished
            ? "Session done. Come back when the schedule says so."
            : `${report.done} of ${report.total} reviewed. Each pass at three stars pushes a level further into the future.`}
        </p>

        {/* The session bar: how far through today's queue you are. */}
        <div className="h-2 rounded-full mb-8" style={{ background: `${GREEN}25` }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${report.total > 0 ? (report.done / report.total) * 100 : 0}%`,
              background: report.finished ? AMBER : GREEN,
              transition: "width 500ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>

        <div className="space-y-2 mb-8">
          {report.items.map((item) => {
            const s = STATUS[item.status];
            const isNext = next && item.levelId === next.levelId && item.trackSlug === next.trackSlug;
            return (
              <button
                key={`${item.trackSlug}-${item.levelId}`}
                onClick={() => navigate(item.path)}
                className="w-full rounded-xl p-4 flex items-center gap-3 text-left hover:brightness-110 transition"
                style={{
                  background: "var(--bg-card)",
                  border: `1.5px solid ${isNext ? GREEN : "var(--border)"}`,
                  opacity: item.status === "pending" || isNext ? 1 : 0.75,
                }}
              >
                <s.icon size={16} strokeWidth={2.5} style={{ color: s.color, flexShrink: 0 }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                    {item.name}
                  </div>
                  <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {item.trackName}
                    {s.label && <span style={{ color: s.color }}> · {s.label}</span>}
                  </div>
                </div>
                {isNext && (
                  <span
                    className="text-xs flex items-center gap-1 flex-shrink-0"
                    style={{ color: GREEN }}
                  >
                    up next <ArrowRight size={12} strokeWidth={2.5} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {report.finished ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: "var(--bg-card)", border: `2px solid ${AMBER}` }}
          >
            <div
              className="text-lg font-bold mb-2"
              style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
            >
              {report.promoted} promoted
              {report.retired > 0 && `, ${report.retired} retired for good`}
              {report.fellback > 0 && `, ${report.fellback} back to the start`}
            </div>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              {report.fellback > 0
                ? "The ones that fell back will be waiting tomorrow. That is the system working, not you failing."
                : "A clean sweep. The queue will refill as the schedule comes due."}
            </p>
            <PixelButton onClick={() => navigate("/")} size="md">
              Done
            </PixelButton>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <PixelButton onClick={() => next && navigate(next.path)} size="lg" disabled={!next}>
              Review {next ? next.name : ""} <ArrowRight size={16} className="inline ml-1" />
            </PixelButton>
            <button
              onClick={() => {
                clearSession();
                setTick((t) => t + 1);
              }}
              className="text-xs hover:brightness-125 transition"
              style={{ color: "var(--text-muted)" }}
              title="Rebuild the session from whatever is due right now"
            >
              Start fresh
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
