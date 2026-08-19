import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Flame, RotateCcw, Star, Target, Trophy } from "lucide-react";
import { TRACKS } from "../data/tracks";
import { useProgress } from "../hooks/useProgress";
import { useSettings } from "../context/SettingsContext";
import { getDay, loadPractice } from "../lib/practice";
import { loadScores } from "../lib/arcadeScores";
import { trackSummaries, overallTotals, softSpots } from "../lib/journey";
import Icon from "../components/Icon";

const GREEN = "#6AAE6F";
const AMBER = "#E9B44C";
const BLUE = "#7AA2F7";

const ARCADE = [
  { game: "bughunt", metric: "score", label: "Bug Hunt", unit: "" },
  { game: "guess", metric: "score", label: "Guess the Output", unit: "" },
  { game: "typing", metric: "wpm", label: "Typing", unit: " wpm" },
];

function Figure({ value, label, color, icon: Glyph }) {
  return (
    <div>
      <div
        className="text-2xl font-bold flex items-center gap-1.5"
        style={{ color, fontFamily: "'Courier New', monospace" }}
      >
        {Glyph && <Glyph size={18} strokeWidth={2.5} />}
        {value}
      </div>
      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function Panel({ title, children, action }) {
  return (
    <div className="mt-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2
          className="text-sm font-bold"
          style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { progress } = useProgress();
  const { dailyGoal } = useSettings();

  const summaries = useMemo(() => trackSummaries(TRACKS, progress), [progress]);
  const totals = useMemo(() => overallTotals(summaries), [summaries]);
  // Read once on mount. Nothing on this page can change the review data while
  // it is open, so re-reading localStorage on every render would buy nothing.
  const review = useMemo(() => loadPractice().review || {}, []);
  const spots = useMemo(() => softSpots(TRACKS, review), [review]);
  const day = useMemo(() => getDay(), []);
  const scores = useMemo(() => loadScores(), []);

  const started = summaries.filter((s) => s.started).sort((a, b) => b.stars - a.stars);
  const bests = ARCADE.map((a) => ({ ...a, value: scores?.[a.game]?.[a.metric] || 0 })).filter(
    (a) => a.value > 0
  );

  return (
    <div className="min-h-screen px-4 pt-24 pb-16 relative z-10">
      <div className="max-w-4xl mx-auto">
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
        >
          Your Journey
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
          {totals.levels === 0
            ? "Nothing here yet. Finish a level and this page fills in."
            : `${totals.levels} levels across ${totals.tracksStarted} ${totals.tracksStarted === 1 ? "track" : "tracks"}.`}
        </p>

        {/* Headline figures. Completion and mastery are deliberately separate:
            finishing every level on one star is 100% complete and 33% mastered,
            and rolling them into one number would hide that. */}
        <div
          className="rounded-2xl p-6 grid grid-cols-2 sm:grid-cols-4 gap-6"
          style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
        >
          <Figure value={totals.stars} label="stars earned" color={AMBER} icon={Star} />
          <Figure
            value={`${totals.levels}/${totals.totalLevels}`}
            label="levels done"
            color={BLUE}
          />
          <Figure value={`${totals.mastery}%`} label="mastered" color={GREEN} icon={Trophy} />
          <Figure
            value={day.streak}
            label={day.best > day.streak ? `day streak (best ${day.best})` : "day streak"}
            color="#FF7B54"
            icon={Flame}
          />
        </div>

        {/* Today, against whatever goal the student set in Settings. */}
        <div
          className="rounded-2xl p-5 mt-4 flex items-center gap-4"
          style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
        >
          <Target size={18} strokeWidth={2.5} style={{ color: GREEN, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold" style={{ color: "var(--text)" }}>
              {day.points >= dailyGoal ? "Daily goal met" : "Today"}
            </div>
            <div className="h-1.5 rounded-full mt-2" style={{ background: `${GREEN}25` }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${dailyGoal > 0 ? Math.min(day.points / dailyGoal, 1) * 100 : 0}%`,
                  background: day.points >= dailyGoal ? AMBER : GREEN,
                  transition: "width 700ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              />
            </div>
          </div>
        </div>

        {started.length > 0 && (
          <Panel
            title="TRACKS"
            action={
              <button
                onClick={() => navigate("/tracks")}
                className="text-xs flex items-center gap-1 hover:gap-2 transition-all"
                style={{ color: GREEN }}
              >
                See all <ArrowRight size={12} strokeWidth={2.5} />
              </button>
            }
          >
            <div className="space-y-2">
              {started.map((s) => (
                <button
                  key={s.slug}
                  onClick={() => navigate(`/tracks/${s.slug}`)}
                  className="w-full rounded-xl p-4 flex items-center gap-4 text-left hover:brightness-110 transition"
                  style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
                >
                  <Icon src={s.icon} alt={s.name} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span
                        className="text-sm font-bold truncate"
                        style={{ color: "var(--text)" }}
                      >
                        {s.name}
                      </span>
                      <span
                        className="text-xs flex-shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {s.done}/{s.total}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full mt-2" style={{ background: `${GREEN}25` }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${s.pct}%`, background: s.complete ? AMBER : GREEN }}
                      />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div
                      className="text-sm font-bold"
                      style={{ color: AMBER, fontFamily: "'Courier New', monospace" }}
                    >
                      {s.stars}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      of {s.maxStars}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        )}

        {/* The one thing here a student could not work out by browsing tracks:
            which levels actually fought back. Drawn from the review `fails`
            counts, so it costs no new storage. */}
        {spots.length > 0 && (
          <Panel title="SOFT SPOTS">
            <div className="space-y-2">
              {spots.map((s) => (
                <button
                  key={`${s.trackSlug}-${s.levelId}`}
                  onClick={() => navigate(s.path)}
                  className="w-full rounded-xl p-3.5 flex items-center gap-3 text-left hover:brightness-110 transition"
                  style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
                >
                  <RotateCcw size={15} strokeWidth={2.5} style={{ color: AMBER, flexShrink: 0 }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                      {s.levelName}
                    </div>
                    <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                      {s.trackName} · {s.chapterName}
                    </div>
                  </div>
                  <span
                    className="text-xs flex-shrink-0 px-2 py-1 rounded-md"
                    style={{ color: AMBER, background: `${AMBER}18` }}
                  >
                    {s.fails} {s.fails === 1 ? "retry" : "retries"}
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        )}

        {bests.length > 0 && (
          <Panel title="ARCADE BESTS">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {bests.map((b) => (
                <div
                  key={b.game}
                  className="rounded-xl p-4"
                  style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
                >
                  <div
                    className="text-xl font-bold"
                    style={{ color: BLUE, fontFamily: "'Courier New', monospace" }}
                  >
                    {b.value}
                    {b.unit}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {b.label}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
