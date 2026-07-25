import { Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TRACKS } from "../data/tracks";
import { useProgress } from "../hooks/useProgress";
import PixelButton from "../components/PixelButton";

export default function HomePage() {
  const navigate = useNavigate();
  const { getCompletedCount } = useProgress();

  const totalChapters = TRACKS.reduce((sum, t) => sum + t.chapters.length, 0);
  const totalLevels = TRACKS.reduce((sum, t) => sum + t.chapters.reduce((s, ch) => s + ch.levels.length, 0), 0);
  const doneLevels = TRACKS.reduce((sum, t) => sum + getCompletedCount(t.slug), 0);
  const progress = totalLevels > 0 ? Math.round((doneLevels / totalLevels) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative z-10">
      <div className="mb-8 md:mb-10 mt-10">
        <div className="flex flex-col md:flex-row items-center gap-6 md:gap-12">
          <img
            src="/icons.svg"
            alt=""
            className="w-28 md:w-40 h-auto shrink-0"
            style={{ filter: "drop-shadow(2px 2px 0 #6AAE6F40)" }}
          />
          <div className="text-center md:text-left">
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-black mb-2 leading-tight"
              style={{
                color: "var(--text)",
                fontFamily: "'Courier New', monospace",
                textShadow: "3px 3px 0 #6AAE6F40",
              }}
            >
              Step Into<br />
              <span style={{ color: "#6AAE6F" }}>Code</span>
            </h1>

            <p
              className="text-sm sm:text-base max-w-sm"
              style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}
            >
              {TRACKS.length} tracks &middot; {totalChapters} chapters &middot; {totalLevels} levels
            </p>
          </div>
        </div>
      </div>

      <div className="mb-10 md:mb-12">
        <PixelButton onClick={() => navigate("/tracks")} size="lg" variant="primary">
          <span className="inline-flex items-center justify-center gap-2"><Play size={15} strokeWidth={3} fill="currentColor" /> Explore Tracks</span>
        </PixelButton>
      </div>

      <div
        className="grid grid-cols-3 rounded-xl overflow-hidden"
        style={{
          border: "1px solid var(--border-strong)",
          maxWidth: 400,
          width: "100%",
        }}
      >
        {[
          { label: "Progress", value: `${progress}%`, color: "#6AAE6F" },
          { label: "Tracks", value: `${TRACKS.length}`, color: "#7AA2F7" },
          { label: "Chapters", value: `${totalChapters}`, color: "#E9B44C" },
        ].map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center py-4 md:py-5 px-2"
            style={{ background: "var(--bg-card)" }}
          >
            <span
              className="text-xl md:text-2xl font-black mb-0.5"
              style={{ color: s.color, fontFamily: "'Courier New', monospace" }}
            >
              {s.value}
            </span>
            <span className="text-[11px] md:text-xs" style={{ color: "var(--text-muted)" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs" style={{ color: "var(--text-muted)" }}>
        No account needed &middot; Free
      </p>
    </div>
  );
}
