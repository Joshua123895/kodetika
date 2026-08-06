import { ArrowRight, Gamepad2, Play, Star } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { TRACKS, DIFFICULTY } from "../data/tracks";
import { useProgress } from "../hooks/useProgress";
import PixelButton from "../components/PixelButton";
import HeroTerminal from "../components/HeroTerminal";
import Icon from "../components/Icon";
import { isChapterUnlocked } from "../utils/chapterLock";

export default function HomePage() {
  const navigate = useNavigate();
  const { getCompletedCount, getTotalStars, getStars } = useProgress();

  const totalChapters = TRACKS.reduce((sum, t) => sum + t.chapters.length, 0);
  const totalLevels = TRACKS.reduce((sum, t) => sum + t.chapters.reduce((s, ch) => s + ch.levels.length, 0), 0);
  const doneLevels = TRACKS.reduce((sum, t) => sum + getCompletedCount(t.slug), 0);
  const stars = TRACKS.reduce((sum, t) => sum + getTotalStars(t.slug), 0);
  const progress = totalLevels > 0 ? Math.round((doneLevels / totalLevels) * 100) : 0;

  // The old hero sent everyone to the same generic list. Point returning
  // students at the exact level they stopped on instead — the first unfinished
  // level of the track they have gone furthest in, skipping locked chapters.
  const resume = useMemo(() => {
    let best = null;
    for (const track of TRACKS) {
      const done = getCompletedCount(track.slug);
      if (done === 0) continue;
      for (let ci = 0; ci < track.chapters.length; ci++) {
        if (!isChapterUnlocked(track, ci, getStars)) break;
        const chapter = track.chapters[ci];
        const next = chapter.levels.find((l) => getStars(track.slug, l.id) === 0);
        if (next) {
          if (!best || done > best.done) best = { done, track, chapter, level: next };
          break;
        }
      }
    }
    return best;
  }, [getCompletedCount, getStars]);

  return (
    <div className="min-h-screen px-4 pt-24 pb-16 relative z-10">
      <div className="max-w-5xl mx-auto">
        {/* Centred in the viewport rather than pinned under the navbar. Removing
            the badge took ~46px off the top of the left column, which left the
            whole composition sitting high; this recovers the balance instead of
            padding one column back out to match. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-center lg:min-h-[calc(100vh_-_13rem)]">
          {/* Left: the pitch and where to go next */}
          <div className="text-center lg:text-left">
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-black mb-4 leading-[1.05]"
              style={{ color: "var(--text)", fontFamily: "'Courier New', monospace", textShadow: "3px 3px 0 #6AAE6F40" }}
            >
              Step Into<br />
              <span style={{ color: "#6AAE6F" }}>Code</span>
            </h1>

            <p className="text-base sm:text-lg mb-7 max-w-md mx-auto lg:mx-0" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Learn Python by writing it. {totalLevels} levels of real code, checked the moment you hit run.
            </p>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-8">
              {resume ? (
                <PixelButton onClick={() => navigate(`/tracks/${resume.track.slug}/${resume.chapter.id}/${resume.level.id}`)} size="lg" variant="primary">
                  <span className="inline-flex items-center justify-center gap-2">
                    <Play size={15} strokeWidth={3} fill="currentColor" /> Continue
                  </span>
                </PixelButton>
              ) : (
                <PixelButton onClick={() => navigate("/tracks")} size="lg" variant="primary">
                  <span className="inline-flex items-center justify-center gap-2">
                    <Play size={15} strokeWidth={3} fill="currentColor" /> Start learning
                  </span>
                </PixelButton>
              )}
              <PixelButton onClick={() => navigate("/arcade")} size="lg" variant="ghost">
                <span className="inline-flex items-center justify-center gap-2">
                  <Gamepad2 size={15} strokeWidth={3} /> Arcade
                </span>
              </PixelButton>
            </div>

            {resume && (
              <button
                onClick={() => navigate(`/tracks/${resume.track.slug}/${resume.chapter.id}/${resume.level.id}`)}
                className="text-xs mb-6 flex items-center gap-1.5 mx-auto lg:mx-0 hover:gap-2.5 transition-all"
                style={{ color: "var(--text-muted)" }}
              >
                Up next: <span style={{ color: "var(--text-secondary)" }}>{resume.level.name}</span>
                <span style={{ color: "var(--text-disabled)" }}>· {resume.track.name}</span>
                <ArrowRight size={12} strokeWidth={2.5} />
              </button>
            )}

            <div className="flex items-center justify-center lg:justify-start gap-6 text-sm">
              <Stat value={`${progress}%`} label="complete" color="#6AAE6F" />
              <Stat value={`${doneLevels}/${totalLevels}`} label="levels" color="#7AA2F7" />
              <Stat value={stars} label="stars" color="#E9B44C" icon={Star} />
            </div>
          </div>

          {/* Right: the product doing its job */}
          <div className="w-full">
            <HeroTerminal />
          </div>
        </div>

        {/* Tracks, with real progress on each */}
        <div className="mt-14">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-bold" style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}>
              {TRACKS.length} TRACKS · {totalChapters} CHAPTERS
            </h2>
            <button
              onClick={() => navigate("/tracks")}
              className="text-xs flex items-center gap-1 hover:gap-2 transition-all"
              style={{ color: "#6AAE6F" }}
            >
              See all <ArrowRight size={12} strokeWidth={2.5} />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {TRACKS.map((track) => {
              const diff = DIFFICULTY[track.difficulty] || DIFFICULTY[1];
              const levels = track.chapters.reduce((s, ch) => s + ch.levels.length, 0);
              const done = getCompletedCount(track.slug);
              const pct = levels > 0 ? Math.round((done / levels) * 100) : 0;
              return (
                <button
                  key={track.slug}
                  onClick={() => navigate(`/tracks/${track.slug}`)}
                  className="rounded-xl p-3 text-left transition-all hover:-translate-y-0.5"
                  style={{ background: "var(--bg-card)", border: "1.5px solid var(--border-strong)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon src={track.trackIcon} alt={track.name} size={26} color={diff.color} />
                    <span
                      className="text-xs font-bold truncate"
                      style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
                    >
                      {track.name}
                    </span>
                  </div>
                  <div className="h-1 rounded-full mb-1.5" style={{ background: `${diff.color}20` }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: diff.color }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
                    <span>{done}/{levels}</span>
                    <span style={{ color: diff.color }}>{diff.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label, color, icon: IconCmp }) {
  return (
    <div className="flex flex-col items-center lg:items-start">
      <span
        className="text-xl font-black inline-flex items-center gap-1"
        style={{ color, fontFamily: "'Courier New', monospace" }}
      >
        {IconCmp && <IconCmp size={15} strokeWidth={2.5} fill="currentColor" />}
        {value}
      </span>
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}
