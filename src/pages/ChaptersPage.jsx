import { ArrowLeft, Check, Lock, Star } from "lucide-react";
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TRACKS, DIFFICULTY } from "../data/tracks";
import { useProgress } from "../hooks/useProgress";
import Icon from "../components/Icon";
import ProgressBar from "../components/ProgressBar";

export default function ChaptersPage() {
  const { trackName } = useParams();
  const navigate = useNavigate();
  const { getStars, getLevelStatus } = useProgress();
  const [expanded, setExpanded] = useState(null);

  const track = TRACKS.find((t) => t.slug === trackName);
  const diff = track ? (DIFFICULTY[track.difficulty] || DIFFICULTY[1]) : DIFFICULTY[1];

  if (!track) {
    return (
      <div className="min-h-screen pt-24 pb-16 px-4 max-w-4xl mx-auto relative z-10">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>
          Track not found
        </h1>
        <button onClick={() => navigate("/tracks")} style={{ color: diff.color }}>
          <ArrowLeft size={14} className="inline mr-1" /> Back to tracks
        </button>
      </div>
    );
  }

  const totalLevels = track.chapters.reduce((s, ch) => s + ch.levels.length, 0);
  const doneLevels = track.chapters.reduce(
    (s, ch) => s + ch.levels.filter((l) => getStars(track.slug, l.id) > 0).length,
    0
  );

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 max-w-4xl mx-auto relative z-10">
      <button
        onClick={() => navigate("/tracks")}
        className="text-sm mb-6 flex items-center gap-1 hover:gap-2 transition-all"
        style={{ color: "var(--text-muted)" }}
      >
        <ArrowLeft size={14} className="inline mr-1" /> All Tracks
      </button>

      <div className="flex items-center gap-4 mb-6">
        <Icon src={track.trackIcon} alt={track.name} size={56} color={diff.color} className="md:w-21! md:h-21!" />
        <div>
          <h1
            className="text-3xl font-black"
            style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
          >
            {track.name}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {track.description}
          </p>
        </div>
      </div>

      <div className="mb-6">
        <ProgressBar value={totalLevels > 0 ? Math.round((doneLevels / totalLevels) * 100) : 0} color={diff.color} />
        <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {doneLevels} / {totalLevels} levels completed
        </div>
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: `2px solid ${diff.color}30` }}
      >
        {track.chapters.map((chapter, i) => {
          const done = chapter.levels.filter((l) => getStars(track.slug, l.id) > 0).length;
          const progress = chapter.levels.length > 0 ? Math.round((done / chapter.levels.length) * 100) : 0;
          const isOpen = expanded === chapter.id;

          return (
            <div key={chapter.id} style={{ borderBottom: i < track.chapters.length - 1 ? `1px solid ${diff.color}15` : "none" }}>
              <div
                className="flex items-center gap-3 md:gap-6 px-4 py-3 cursor-pointer transition-all"
                style={{ background: isOpen ? `${diff.color}08` : "transparent" }}
                onClick={() => setExpanded(isOpen ? null : chapter.id)}
              >
                <Icon src={chapter.chapterIcon} alt={chapter.name} size={40} color={diff.color} className="md:w-15! md:h-15! shrink-0" />
                <div className="flex-1 min-w-0 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: diff.color }}>
                      {i + 1}.
                    </span>
                    <span
                      className="text-sm font-bold truncate"
                      style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
                    >
                      {chapter.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: `${diff.color}15` }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${progress}%`, background: diff.color }}
                      />
                    </div>
                    <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                      {done}/{chapter.levels.length}
                    </span>
                  </div>
                </div>
                <svg
                  width="16" height="16" viewBox="0 0 16 16" fill="none"
                  style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", color: "var(--text-muted)" }}
                >
                  <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>

              {isOpen && (
                <div className="px-4 pb-3">
                  {chapter.levels.map((level, li) => {
                    const status = getLevelStatus(track.slug, level.id);
                    const stars = getStars(track.slug, level.id);
                    const isCompleted = status === "completed";
                    const isLocked = status === "locked";

                    return (
                      <div
                        key={level.id}
                        className="flex items-center gap-3 px-3 py-3 rounded-lg transition-all"
                        style={{
                          opacity: isLocked ? 0.5 : 1,
                          cursor: isLocked ? "default" : "pointer",
                          background: "transparent",
                        }}
                        onClick={() => {
                          if (!isLocked) {
                            navigate(`/tracks/${track.slug}/${chapter.id}/${level.id}`);
                          }
                        }}
                        onMouseEnter={(e) => { if (!isLocked) e.currentTarget.style.background = `${diff.color}08`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{
                            border: `1.5px solid ${isCompleted ? "#67C587" : diff.color}30`,
                            color: isCompleted ? "#67C587" : "var(--text-muted)",
                            fontFamily: "'Courier New', monospace",
                          }}
                        >
                          {isCompleted ? <Check size={14} strokeWidth={3} /> : li + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span
                            className="text-sm truncate block"
                            style={{
                              color: isCompleted ? "#67C587" : isLocked ? "var(--text-disabled)" : "var(--text)",
                              fontFamily: "'Courier New', monospace",
                            }}
                          >
                            {level.name}
                          </span>
                        </div>
                        {stars > 0 && (
                          <div className="flex gap-0.5 shrink-0">
                            {[1, 2, 3].map((s) => (
                              <span key={s} style={{ fontSize: 12, color: s <= stars ? "#E9B44C" : "var(--text-disabled)" }}>
                                <Star size={11} strokeWidth={2.5} fill="currentColor" />
                              </span>
                            ))}
                          </div>
                        )}
                        {!isLocked && (
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                            style={{ color: diff.color }}
                          >
                            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
                              <path d="M0 0L10 6L0 12V0Z"/>
                            </svg>
                          </div>
                        )}
                        {isLocked && (
                          <Lock size={12} strokeWidth={2.5} style={{ color: "var(--text-disabled)" }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
