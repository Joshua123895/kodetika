import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Braces, Database, Layout as LayoutIcon, Palette, Search, Terminal, Wrench } from "lucide-react";
import { TRACKS } from "../data/tracks";
import { REFERENCE_TOPICS, REFERENCE_GUIDES } from "../data/reference";
import { buildHandbook, filterHandbook } from "../lib/handbook";
import { filterTopic, topicCount } from "../lib/referenceModel";
import Icon from "../components/Icon";
import RichText from "../components/RichText";

const GREEN = "#6AAE6F";
const AMBER = "#E9B44C";

const TOPIC_ICONS = {
  python: Terminal,
  javascript: Braces,
  sql: Database,
  html: LayoutIcon,
  css: Palette,
};

function SectionHeading({ children }) {
  return (
    <h2
      className="text-sm font-bold mb-4 mt-10 first:mt-0"
      style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}
    >
      {children}
    </h2>
  );
}

// Built once at module load: the tracks never change within a session, and the
// handbook is pure derivation over them.
const HANDBOOK = buildHandbook(TRACKS);

/** The index: language reference, local-setup guides, then the track concepts. */
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
        Look things up: the languages as reference, guides for moving to your own
        machine, and every concept the tracks teach.
      </p>

      <SectionHeading>REFERENCE</SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {REFERENCE_TOPICS.map((t) => {
          const Glyph = TOPIC_ICONS[t.slug] ?? BookOpen;
          return (
            <button
              key={t.slug}
              onClick={() => navigate(`/handbook/ref/${t.slug}`)}
              className="rounded-xl p-4 flex items-center gap-4 text-left hover:brightness-110 transition"
              style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
            >
              <Glyph size={22} strokeWidth={2.5} style={{ color: GREEN, flexShrink: 0 }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                  {t.name}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {topicCount(t)} entries
                </div>
              </div>
              <ArrowRight size={14} strokeWidth={2.5} style={{ color: GREEN, flexShrink: 0 }} />
            </button>
          );
        })}
      </div>

      <SectionHeading>YOUR OWN MACHINE</SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {REFERENCE_GUIDES.map((g) => (
          <button
            key={g.slug}
            onClick={() => navigate(`/handbook/guide/${g.slug}`)}
            className="rounded-xl p-4 flex items-center gap-4 text-left hover:brightness-110 transition"
            style={{ background: "var(--bg-card)", border: `1.5px solid ${AMBER}40` }}
          >
            <Wrench size={20} strokeWidth={2.5} style={{ color: AMBER, flexShrink: 0 }} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                {g.name}
              </div>
              <div className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                {g.blurb}
              </div>
            </div>
          </button>
        ))}
      </div>

      <SectionHeading>FROM THE TRACKS</SectionHeading>
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

/** One reference topic: grouped entries, filterable like the concept pages. */
function ReferenceTopic({ slug, navigate }) {
  const [query, setQuery] = useState("");
  const base = REFERENCE_TOPICS.find((t) => t.slug === slug);
  const topic = useMemo(() => (base ? filterTopic(base, query) : null), [base, query]);

  if (!topic) {
    return (
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        No reference for that.
      </p>
    );
  }

  const Glyph = TOPIC_ICONS[base.slug] ?? BookOpen;

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
        <Glyph size={26} strokeWidth={2.5} style={{ color: GREEN }} />
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
        >
          {base.name}
        </h1>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        {base.blurb}
      </p>

      <div
        className="flex items-center gap-2.5 px-3 rounded-xl mb-8"
        style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
      >
        <Search size={14} strokeWidth={2.5} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter this reference"
          className="flex-1 py-2.5 text-sm outline-none bg-transparent"
          style={{ color: "var(--text)" }}
          aria-label="Filter reference"
        />
      </div>

      {topic.groups.length === 0 && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Nothing mentions that. Try fewer letters.
        </p>
      )}

      {topic.groups.map((g) => (
        <section key={g.name} className="mb-10">
          <h2
            className="text-sm font-bold mb-4"
            style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}
          >
            {g.name.toUpperCase()}
          </h2>
          <div className="space-y-3">
            {g.entries.map((e) => (
              <article
                key={e.sig}
                className="rounded-xl p-4"
                style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
              >
                <h3
                  className="text-sm font-bold mb-1.5"
                  style={{ color: GREEN, fontFamily: "'Courier New', monospace" }}
                >
                  {e.sig}
                </h3>
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  <RichText blocks={e.descBlocks} />
                </div>
                {e.exBlocks && (
                  <div className="text-sm mt-2">
                    <RichText blocks={e.exBlocks} />
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** One local-setup guide: prose, rendered like a level's explanation. */
function ReferenceGuide({ slug, navigate }) {
  const guide = REFERENCE_GUIDES.find((g) => g.slug === slug);

  if (!guide) {
    return (
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        No such guide.
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

      <h1
        className="text-2xl font-bold mb-1"
        style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
      >
        {guide.name}
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        {guide.blurb}
      </p>

      <div
        className="rounded-xl p-5 text-sm leading-relaxed"
        style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", color: "var(--text-secondary)" }}
      >
        <RichText blocks={guide.blocks} />
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

export default function HandbookPage({ kind }) {
  const { slug } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen px-4 pt-24 pb-16 relative z-10">
      <div className="max-w-3xl mx-auto">
        {kind === "ref" ? (
          <ReferenceTopic slug={slug} navigate={navigate} />
        ) : kind === "guide" ? (
          <ReferenceGuide slug={slug} navigate={navigate} />
        ) : slug ? (
          <HandbookTrack slug={slug} navigate={navigate} />
        ) : (
          <HandbookIndex navigate={navigate} />
        )}
      </div>
    </div>
  );
}
