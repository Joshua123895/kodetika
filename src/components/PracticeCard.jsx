import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, RotateCcw, Target } from "lucide-react";
import { useProgress } from "../hooks/useProgress";
import { useSettings } from "../context/SettingsContext";
import { dueLevels, getDay } from "../lib/practice";

const GREEN = "#6AAE6F";
const AMBER = "#E9B44C";

/**
 * Points are stored as integers (a level is 2, an Arcade credit is 1) so the
 * arithmetic never meets a fraction. Only the display divides, and only here.
 */
function levelsLabel(points) {
  const whole = Math.floor(points / 2);
  const half = points % 2 === 1;
  if (whole === 0 && half) return "½";
  return half ? `${whole}½` : String(whole);
}

export default function PracticeCard() {
  const navigate = useNavigate();
  const { progress } = useProgress();
  const { dailyGoal } = useSettings();

  // Recomputed when progress changes, which is the only thing that can add or
  // remove a due level while this page is open.
  const due = useMemo(() => dueLevels(progress, { limit: 20 }), [progress]);
  const day = useMemo(() => getDay(), []);

  const done = Math.min(day.points, dailyGoal);
  const pct = dailyGoal > 0 ? Math.round((done / dailyGoal) * 100) : 0;
  const goalHit = day.points >= dailyGoal;

  // Nothing to review and nothing done today means a brand new student, and a
  // card reading "0" over "0" is a worse welcome than no card at all.
  if (due.length === 0 && day.points === 0 && day.streak === 0) return null;

  // A due entry only knows its track slug and level id; the chapter is needed
  // for the URL, so resolve it here rather than storing it and letting it go
  // stale when a chapter is inserted (see assignLevelIds in levelSource).
  // The card used to jump straight into the first due level. The session page
  // is the better landing: the whole queue, live statuses, and a summary.
  const openReview = () => navigate("/review");

  return (
    <div className="mt-14">
      <h2
        className="text-sm font-bold mb-4"
        style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}
      >
        YOUR PRACTICE
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Today */}
        <div
          className="rounded-xl p-4"
          style={{ background: "var(--bg-card)", border: "2px solid var(--border-strong)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              <Target size={13} strokeWidth={2.5} /> Today
            </span>
            {day.streak > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs font-bold"
                style={{ color: AMBER }}
                title={day.best > day.streak ? `Best: ${day.best} days` : undefined}
              >
                <Flame size={13} strokeWidth={2.5} /> {day.streak} day{day.streak === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-2xl font-black" style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}>
              {levelsLabel(day.points)}
            </span>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              of {dailyGoal / 2} levels
            </span>
          </div>

          <div className="h-1.5 rounded-full" style={{ background: `${GREEN}20` }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: goalHit ? AMBER : GREEN }}
            />
          </div>

          <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
            {goalHit
              ? "Goal met. Anything more is a bonus."
              : day.points === 0
                ? "Nothing yet today. One level keeps the streak."
                : "Keep going, you are part way there."}
          </p>
        </div>

        {/* Review */}
        <button
          onClick={openReview}
          disabled={due.length === 0}
          className="rounded-xl p-4 text-left transition-all enabled:hover:-translate-y-0.5 disabled:cursor-default"
          style={{ background: "var(--bg-card)", border: "2px solid var(--border-strong)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              <RotateCcw size={13} strokeWidth={2.5} /> Review
            </span>
          </div>

          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-2xl font-black" style={{ color: due.length ? "var(--text)" : "var(--text-muted)", fontFamily: "'Courier New', monospace" }}>
              {due.length}
            </span>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              {due.length === 1 ? "level ready" : "levels ready"}
            </span>
          </div>

          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {due.length === 0
              ? "Nothing to revisit. Everything you have done, you aced."
              : "Levels you did not quite nail. Ace one and it stops coming back."}
          </p>
        </button>
      </div>
    </div>
  );
}
