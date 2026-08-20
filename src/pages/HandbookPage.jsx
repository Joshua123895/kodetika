import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Search } from "lucide-react";
import { TRACKS } from "../data/tracks";
import { buildHandbook, filterHandbook } from "../lib/handbook";
import Icon from "../components/Icon";
import RichText from "../components/RichText";

const GREEN = "#6AAE6F";

// Built once at module load: the tracks never change within a session, and the
// handbook is pure derivation over them.
const HANDBOOK = buildHandbook(TRACKS);

/** The index: one card per track, with how many concepts it explains. */
function HandbookIndex({ navigate }) {
  return (
    <>
      <h1
        className="text-2xl font-bold mb-1 flex items-center gap-2.5"
        style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
      >
        <BookOpen size={22} strokeWidth={2.5} style={{ color: GREEN }} />
        Handbook
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        Every concept the tracks teach, collected as reference. Each entry is the
        explanation from a real level, so trying it is one tap away.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {HANDBOOK.map((t) => (
          <button
            key={t.slug}
            onClick={() => navigate(`/handbook/${t.slug}`)}
            className="rounded-xl p-4 flex items-center gap-4 text-left hover:brightness-110 transition"
            style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
          >
            <Icon src={t.icon} alt={t.name} size={30} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                {t.name}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {t.conceptCount} concepts
              </div>
            </div>
            <ArrowRight size={14} strokeWidth={2.5} style={{ color: GREEN, flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </>
  );
}

/** One track: its chapters and concepts, filterable. */
function HandbookTrack({ slug, navigate }) {
  const [query, setQuery] = useState("");
  const base = HANDBOOK.find((t) => t.slug === slug);
  const track = useMemo(() => (base ? filterHandbook(base, query) : null), [base, query]);

  if (!track) {
    return (
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        No handbook for that track.
      </p>
    );
  }

  return (
    <>
      <button
        onClick={() => navigate("/handbook")}
        className="text-xs flex items-center gap-1.5 mb-4 hover:gap-2.5 transition-all"
        style={{ color: GREEN }}
      >
        <ArrowLeft size={13} strokeWidth={2.5} /> Handbook
      </button>

      <div className="flex items-center gap-3 mb-1">
        <Icon src={base.icon} alt={base.name} size={34} />
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
        >
          {base.name}
        </h1>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        {base.conceptCount} concepts, in the order the track teaches them.
      </p>

      <div
        className="flex items-center gap-2.5 px-3 rounded-xl mb-8"
        style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
      >
        <Search size={14} strokeWidth={2.5} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter these concepts"
          className="flex-1 py-2.5 text-sm outline-none bg-transparent"
          style={{ color: "var(--text)" }}
          aria-label="Filter concepts"
        />
      </div>

      {track.chapters.length === 0 && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Nothing mentions that. Try fewer letters.
        </p>
      )}

      {track.chapters.map((ch) => (
        <section key={ch.id} className="mb-10">
          <h2
            className="text-sm font-bold mb-4"
            style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}
          >
            {ch.name.toUpperCase()}
          </h2>
          <div className="space-y-3">
            {ch.entries.map((e) => (
              <article
                key={e.levelId}
                className="rounded-xl p-4"
                style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
              >
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>
                    {e.name}
                  </h3>
                  <button
                    onClick={() => navigate(e.path)}
                    className="text-xs flex items-center gap-1 hover:gap-2 transition-all flex-shrink-0"
                    style={{ color: GREEN }}
                  >
                    try it <ArrowRight size={11} strokeWidth={2.5} />
                  </button>
                </div>
                <div className="text-sm handbook-prose" style={{ color: "var(--text-secondary)" }}>
                  <RichText blocks={e.explanation} />
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default function HandbookPage() {
  const { slug } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen px-4 pt-24 pb-16 relative z-10">
      <div className="max-w-3xl mx-auto">
        {slug ? (
          <HandbookTrack slug={slug} navigate={navigate} />
        ) : (
          <HandbookIndex navigate={navigate} />
        )}
      </div>
    </div>
  );
}
