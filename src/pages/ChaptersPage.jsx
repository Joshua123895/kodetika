import { ArrowLeft, Check, ChevronDown, Lock, Star } from "lucide-react";
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TRACKS, DIFFICULTY } from "../data/tracks";
import { useAuth } from "../context/AuthContext";
import { useProgress } from "../hooks/useProgress";
import { isChapterUnlocked, blockingChapterName } from "../utils/chapterLock";
import Icon from "../components/Icon";
import ProgressBar from "../components/ProgressBar";
import { missingStars } from "../lib/journey";

export default function ChaptersPage() {
  const { trackName } = useParams();
  const navigate = useNavigate();
  const { getStars, getLevelStatus } = useProgress();
  const { isAdmin } = useAuth();
  const [expanded, setExpanded] = useState(null);
  const [huntOpen, setHuntOpen] = useState(false);

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

  // The star hunt: which levels are still short of three stars, and by how
  // much, without opening chapters one by one. Only worth showing once the
  // track is underway; on a fresh track it would just repeat the level list.
  const earnedStars = track.chapters.reduce(
    (s, ch) => s + ch.levels.reduce((n, l) => n + getStars(track.slug, l.id), 0),
    0
  );
  const hunt = missingStars(track, { [track.slug]: Object.fromEntries(
    track.chapters.flatMap((ch) => ch.levels.map((l) => [l.id, getStars(track.slug, l.id)]))
  ) });
  const starsMissing = totalLevels * 3 - earnedStars;

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

      {doneLevels > 0 && starsMissing > 0 && (
        <div
          className="rounded-2xl mb-6 overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1.5px solid #E9B44C40" }}
        >
          <button
            onClick={() => setHuntOpen((o) => !o)}
            className="w-full px-4 py-3 flex items-center gap-2.5 text-left"
          >
            <Star size={15} strokeWidth={2.5} fill="currentColor" style={{ color: "#E9B44C", flexShrink: 0 }} />
            <span className="text-sm font-bold flex-1" style={{ color: "var(--text)" }}>
              {starsMissing} {starsMissing === 1 ? "star" : "stars"} still out there
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {hunt.length} {hunt.length === 1 ? "level" : "levels"}
            </span>
            <ChevronDown
              size={15}
              strokeWidth={2.5}
              style={{
                color: "var(--text-muted)",
                transform: huntOpen ? "rotate(180deg)" : "none",
                transition: "transform 200ms",
              }}
            />
          </button>

          {huntOpen && (
            <div className="max-h-72 overflow-y-auto" style={{ borderTop: "1px solid var(--border-strong)" }}>
              {hunt.map((h) => (
                <button
                  key={h.levelId}
                  onClick={() => navigate(h.path)}
                  className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:brightness-110 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                      {h.name}
                    </div>
                    <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                      {h.chapterName}
                    </div>
                  </div>
                  <span className="flex gap-0.5 flex-shrink-0" aria-label={`${h.stars} of 3 stars`}>
                    {[1, 2, 3].map((n) => (
                      <Star
                        key={n}
                        size={12}
                        strokeWidth={2.5}
                        fill={n <= h.stars ? "currentColor" : "none"}
                        style={{ color: n <= h.stars ? "#E9B44C" : "var(--text-muted)" }}
                      />
                    ))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: `2px solid ${diff.color}30` }}
      >
        {track.chapters.map((chapter, i) => {
          const done = chapter.levels.filter((l) => getStars(track.slug, l.id) > 0).length;
          const progress = chapter.levels.length > 0 ? Math.round((done / chapter.levels.length) * 100) : 0;
          const chapterLocked = !isChapterUnlocked(track, i, getStars, { unlockAll: isAdmin });
          const isOpen = expanded === chapter.id && !chapterLocked;

          return (
            <div key={chapter.id} style={{ borderBottom: i < track.chapters.length - 1 ? `1px solid ${diff.color}15` : "none" }}>
              <div
                className="flex items-center gap-3 md:gap-6 px-4 py-3 transition-all"
                style={{
                  background: isOpen ? `${diff.color}08` : "transparent",
                  cursor: chapterLocked ? "default" : "pointer",
                  opacity: chapterLocked ? 0.55 : 1,
                }}
                onClick={() => { if (!chapterLocked) setExpanded(isOpen ? null : chapter.id); }}
              >
                <Icon src={chapter.chapterIcon} alt={chapter.name} size={40} color={chapterLocked ? "var(--text-disabled)" : diff.color} className="md:w-15! md:h-15! shrink-0" />
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
                  {chapterLocked ? (
                    <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      Finish <span style={{ color: "var(--text-secondary)" }}>{blockingChapterName(track, i)}</span> to unlock
                    </div>
                  ) : (
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
                  )}
                </div>
                {chapterLocked ? (
                  <Lock size={15} strokeWidth={2.5} style={{ color: "var(--text-disabled)" }} />
                ) : (
                  <svg
                    width="16" height="16" viewBox="0 0 16 16" fill="none"
                    style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", color: "var(--text-muted)" }}
                  >
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
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
