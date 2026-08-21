// Loading states for the arcade's lazy chunks and the app's slow fetches.
//
// The frame is real, only the content shimmers: a heading is static text we
// have before any chunk downloads, so painting it as a grey bar just delays
// information for effect. Each fallback mirrors its page's actual container
// and header markup, which is what lets the content replace the shimmer in
// place, and makes the back link work even while the page is still loading.
//
// The shimmer itself is the .skel rule in index.css, static under
// prefers-reduced-motion.

import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Gamepad2 } from "lucide-react";

const GREEN = "#6AAE6F";

/** One shimmering block. Size it with className; it has no opinion of its own. */
export function Skel({ className = "" }) {
  return <div aria-hidden="true" className={`skel rounded-lg ${className}`} />;
}

// Mirrors an arcade game card: rounded-2xl p-5 flex-col gap-3, an icon-and-title
// row (28px), a short blurb, then a full-width PixelButton (py-3 text-sm, 44px).
function CardSkel() {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: "var(--bg-card)", border: "2px solid var(--border-strong)" }}
    >
      <div className="flex items-center gap-2 h-7">
        <Skel className="h-[18px] w-[18px] rounded" />
        <Skel className="h-5 w-2/5" />
      </div>
      <div className="flex-1">
        <Skel className="h-3 w-full mb-2" />
        <Skel className="h-3 w-3/4" />
      </div>
      <Skel className="h-11 w-full" />
    </div>
  );
}

/** The arcade hub while its chunk downloads: the real header, skeleton cards. */
export function ArcadeHubSkeleton() {
  const navigate = useNavigate();
  return (
    <div
      className="min-h-screen pt-24 pb-16 px-4 max-w-4xl mx-auto relative z-10"
      role="status"
      aria-label="Loading the arcade"
    >
      <div className="mb-8">
        <button
          onClick={() => navigate("/")}
          className="text-sm mb-4 flex items-center gap-1 hover:gap-2 transition-all"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft size={14} className="inline mr-1" /> Back to Home
        </button>
        <h1
          className="text-3xl font-black mb-2 flex items-center gap-2"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
        >
          <Gamepad2 size={28} strokeWidth={2.5} /> Arcade
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Games written in Python, running in your browser. No account, no score to chase.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Three quiz games plus the four mini-project games. */}
        {Array.from({ length: 7 }, (_, i) => (
          <CardSkel key={i} />
        ))}
      </div>
      <p className="text-xs mt-6 text-center" style={{ color: "var(--text-muted)" }}>
        Press Esc to stop a game. The first launch downloads the Python runtime, so give it a moment.
      </p>
    </div>
  );
}

/**
 * One arcade game while it loads. The route knows which game it is heading
 * toward, so the title and icon render as real text; the stats and the play
 * surface, which genuinely depend on the chunk, shimmer.
 */
export function ArcadeGameSkeleton({ title = "", icon: Glyph = Gamepad2 }) {
  const navigate = useNavigate();
  return (
    <div
      className="min-h-screen pt-24 pb-16 px-4 max-w-3xl mx-auto relative z-10"
      role="status"
      aria-label={`Loading ${title || "the game"}`}
    >
      <button
        onClick={() => navigate("/arcade")}
        className="text-sm mb-4 flex items-center gap-1 hover:gap-2 transition-all"
        style={{ color: "var(--text-muted)" }}
      >
        <ArrowLeft size={14} className="inline mr-1" /> Back to Arcade
      </button>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1
          className="text-2xl font-black flex items-center gap-2"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
        >
          <Glyph size={22} strokeWidth={2.5} /> {title}
        </h1>
        <Skel className="h-5 w-24" />
      </div>

      <Skel className="h-4 w-2/3 mb-4" />

      <div
        className="rounded-xl p-5"
        style={{ background: "var(--bg-card)", border: "1.5px solid var(--border-strong)" }}
      >
        <Skel className="h-4 w-2/3 mb-3" />
        <Skel className="h-4 w-1/2 mb-3" />
        <Skel className="h-4 w-3/5 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Skel className="h-10" />
          <Skel className="h-10" />
          <Skel className="h-10" />
          <Skel className="h-10" />
        </div>
      </div>
    </div>
  );
}

/**
 * The register while its request is in flight: the summary strip the teacher
 * sees first (four stats), then rows shaped like StudentRow — a name, a
 * levels-and-stars line, and the Remove chip on the right.
 */
export function RosterSkeleton({ rows = 3 }) {
  return (
    <div role="status" aria-label="Loading the register">
      <div
        className="rounded-2xl p-5 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-5"
        style={{ background: "var(--bg-card)", border: "1.5px solid var(--border-strong)" }}
      >
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <Skel className="h-8 w-10" />
            <Skel className="h-3 w-16 mt-1.5" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="rounded-xl p-4 flex items-start gap-3"
            style={{ background: "var(--bg-card)", border: "1.5px solid var(--border-strong)" }}
          >
            <div className="min-w-0 flex-1">
              <Skel className="h-4 w-40" />
              <Skel className="h-3 w-56 mt-2" />
            </div>
            <Skel className="h-[22px] w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Class cards for the Classes page while the teaching and learning lists are
 * being fetched: a name and a hint line, chips on the right where the join
 * code and the Close/Leave buttons land.
 */
export function ClassListSkeleton({ rows = 2 }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading your classes">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: "var(--bg-card)", border: "1.5px solid var(--border-strong)" }}
        >
          <div className="min-w-0 flex-1">
            <Skel className="h-4 w-40" />
            <Skel className="h-3 w-28 mt-1.5" />
          </div>
          <Skel className="h-6 w-24" />
          <Skel className="h-6 w-12" />
        </div>
      ))}
    </div>
  );
}

// An index-style handbook card: icon, a title line, a count line, mirroring the
// rounded-xl p-4 buttons the real index renders.
function HandbookCardSkel() {
  return (
    <div
      className="rounded-xl p-4 flex items-center gap-4"
      style={{ background: "var(--bg-card)", border: "1.5px solid var(--border-strong)" }}
    >
      <Skel className="h-[22px] w-[22px] rounded" />
      <div className="min-w-0 flex-1">
        <Skel className="h-4 w-28" />
        <Skel className="h-3 w-16 mt-1.5" />
      </div>
    </div>
  );
}

/**
 * The handbook while its chunk downloads. The index's header and section
 * headings are static text, so they render for real; only the cards shimmer.
 * `sub` is for the detail routes (a reference topic, a guide, a track), whose
 * titles live in the chunk: there the header itself has to shimmer.
 */
export function HandbookSkeleton({ sub = false }) {
  return (
    <div
      className="min-h-screen px-4 pt-24 pb-16 relative z-10"
      role="status"
      aria-label="Loading the handbook"
    >
      <div className="max-w-3xl mx-auto">
        {sub ? (
          <>
            <Skel className="h-3 w-32 mb-5" />
            <div className="flex items-center gap-3 mb-2">
              <Skel className="h-[26px] w-[26px] rounded" />
              <Skel className="h-6 w-48" />
            </div>
            <Skel className="h-3 w-72 mb-8" />
            <div className="space-y-3">
              <Skel className="h-24 w-full" />
              <Skel className="h-24 w-full" />
              <Skel className="h-24 w-full" />
            </div>
          </>
        ) : (
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
            {[
              ["REFERENCE", 5],
              ["YOUR OWN MACHINE", 4],
              ["FROM THE TRACKS", 6],
            ].map(([label, count]) => (
              <Fragment key={label}>
                <h2
                  className="text-sm font-bold mb-4 mt-10 first:mt-0"
                  style={{ color: "var(--text-muted)", fontFamily: "'Courier New', monospace" }}
                >
                  {label}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: count }, (_, i) => (
                    <HandbookCardSkel key={i} />
                  ))}
                </div>
              </Fragment>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
