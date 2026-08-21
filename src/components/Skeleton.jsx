// Skeletons for the moments a page is not there yet: the arcade chunks
// downloading behind a lazy() route, a deck fetching, a roster loading.
//
// Each composition mirrors the real page's container and rough shape, so the
// content replaces the skeleton in place instead of jumping. The shimmer
// respects prefers-reduced-motion via the .skel rule in index.css.

/** One shimmering block. Size it with className; it has no opinion of its own. */
export function Skel({ className = "" }) {
  return <div aria-hidden="true" className={`skel rounded-lg ${className}`} />;
}

function CardSkel({ lines = 2, className = "" }) {
  return (
    <div
      className={`rounded-xl p-4 ${className}`}
      style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
    >
      <Skel className="h-4 w-1/3 mb-3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skel key={i} className={`h-3 mb-2 ${i % 2 ? "w-1/2" : "w-3/4"}`} />
      ))}
    </div>
  );
}

/** The arcade hub while its chunk downloads: a heading and the game cards. */
export function ArcadeHubSkeleton() {
  return (
    <div
      className="min-h-screen pt-24 pb-16 px-4 max-w-4xl mx-auto relative z-10"
      role="status"
      aria-label="Loading the arcade"
    >
      <Skel className="h-8 w-44 mb-2" />
      <Skel className="h-4 w-72 mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CardSkel lines={2} />
        <CardSkel lines={2} />
        <CardSkel lines={2} />
        <CardSkel lines={2} />
      </div>
    </div>
  );
}

/** One arcade game while it loads: a header row and the big play surface. */
export function ArcadeGameSkeleton() {
  return (
    <div
      className="min-h-screen pt-24 pb-16 px-4 max-w-3xl mx-auto relative z-10"
      role="status"
      aria-label="Loading the game"
    >
      <Skel className="h-4 w-28 mb-4" />
      <div className="flex items-center justify-between mb-6">
        <Skel className="h-8 w-52" />
        <Skel className="h-5 w-24" />
      </div>
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
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

/** Register rows for the classroom while the roster request is in flight. */
export function RosterSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading the register">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)" }}
        >
          <div className="min-w-0 flex-1">
            <Skel className="h-4 w-40 mb-2" />
            <Skel className="h-3 w-56" />
          </div>
          <Skel className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}
