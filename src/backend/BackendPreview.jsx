// The `browser` tab on a backend level.
//
// A backend student's output is a status code and a body, which the console
// shows as text — accurate, and completely unlike the thing they are building.
// This renders the same responses the way the client that asked for them would:
// an address bar, a status, and the body drawn as a page. It is a view of a run
// that already happened, not a second run — the requests come from the same Run
// the console printed, split off at the driver's probe marker.
//
// The chrome follows the app's theme, matching the SQL result grid and the
// JavaScript console; the viewport inside it is white, because that is what a
// browser shows.
import { useColors } from "../editor/colors";
// Matches the web track's preview pane, so the two tracks that show a rendered
// page give it the same amount of room.
const MIN_HEIGHT = 260;

function statusColor(status) {
  if (status >= 500) return "#FF5F57";
  if (status >= 400) return "#E9B44C";
  if (status >= 300) return "#7AA2F7";
  return "#6AAE6F";
}

function headerOf(headers, name) {
  const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

function Empty({ children }) {
  const c = useColors();
  return (
    <div
      className="h-full w-full flex items-center justify-center px-6 text-center font-mono text-xs"
      style={{ color: c.consoleLabel, background: c.headerBg, minHeight: MIN_HEIGHT }}
    >
      {children}
    </div>
  );
}

export default function BackendPreview({ responses, see = [], selected = 0, onSelect, onNavigate, busy = false, prelude = "" }) {
  const c = useColors();
  const CHROME = c.headerBg;
  const BORDER = c.tabBorder;
  const MUTED = c.consoleLabel;
  const TEXT = c.consoleText;
  // No "running" state on purpose: a run replaces the responses when it lands,
  // and leaving the previous page up until then is what a browser does.
  if (responses === undefined) return <Empty>Press Run to see what your app answers.</Empty>;
  if (responses === null) {
    return <Empty>Your program stopped before it could answer. The console has the error.</Empty>;
  }
  if (responses.length === 0) return <Empty>No requests were made.</Empty>;

  // Clamped rather than reset in an effect: the selection is owned by the page,
  // which grows the list when you navigate, and clamping handles a shrink in the
  // same render instead of a frame later.
  const index = Math.min(selected, responses.length - 1);
  const res = responses[index];
  const contentType = headerOf(res.h, "Content-Type") || "";
  const location = headerOf(res.h, "Location");
  const isJson = contentType.startsWith("application/json");

  let pretty = res.b;
  if (isJson && res.b) {
    try {
      pretty = JSON.stringify(JSON.parse(res.b), null, 2);
    } catch {
      // A handler can set the JSON content type on a body that is not JSON.
      // Showing it raw is more honest than hiding the mistake.
    }
  }

  const shown = (Array.isArray(see) ? see : [see]).filter(
    (name) => headerOf(res.h, name) !== undefined
  );

  return (
    // The height is pinned rather than left to the content. An iframe brings its
    // own 150px intrinsic height and a short message brings none, so without
    // this the viewport is page-sized on one level and a letterbox on the next.
    <div className="flex flex-col h-full w-full min-w-0" style={{ background: CHROME, minHeight: MIN_HEIGHT }}>
      {responses.length > 1 && (
        <div className="flex gap-1 px-2 pt-2 pb-1 overflow-x-auto shrink-0">
          {responses.map((r, i) => (
            <button
              key={i}
              onClick={() => onSelect?.(i)}
              className="text-[10px] font-mono px-2 py-1 rounded whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
              style={{
                background: i === index ? "#1a1b2e" : "transparent",
                color: i === index ? TEXT : MUTED,
                border: `1px solid ${i === index ? BORDER : "transparent"}`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor(r.s) }} />
              {r.m} {r.p}
            </button>
          ))}
        </div>
      )}

      {/* The address bar is a real one when the page hands down `onNavigate`:
          type a path, press Enter, and the student's own app answers it. Always
          a GET, because that is what typing a URL into a browser is — anything
          with a body stays in the level's `req:` list, where it can carry one.
          `key={index}` makes the field uncontrolled and resets it when you pick
          a different request, which is what an address bar does on navigation.
          Each navigation runs the program from scratch, so in-memory state an
          earlier request mutated is back — said in the tooltip rather than
          worked around, because a per-tab live process is not what grading is. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const path = new FormData(e.currentTarget).get("path")?.toString().trim();
          if (path?.startsWith("/")) onNavigate(path);
        }}
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: `1px solid ${BORDER}` }}
      >
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: "#7AA2F720", color: "#7AA2F7" }}>
          {res.m}
        </span>
        {onNavigate ? (
          <input
            key={index}
            name="path"
            defaultValue={res.p}
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            aria-label="Request a path from your app"
            title="Type a path and press Enter to send a GET to your app. Each one runs your program fresh, so anything an earlier request changed is back."
            className="flex-1 min-w-0 font-mono text-xs px-2 py-1 rounded outline-none"
            style={{ background: c.isDark ? "#0d0e17" : "#fff", color: busy ? MUTED : TEXT, border: `1px solid ${BORDER}` }}
          />
        ) : (
          <span className="flex-1 min-w-0 truncate font-mono text-xs px-2 py-1 rounded" style={{ background: c.isDark ? "#0d0e17" : "#fff", color: TEXT }}>
            {res.p}
          </span>
        )}
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${statusColor(res.s)}20`, color: statusColor(res.s) }}>
          {res.s} {res.r}
        </span>
      </form>

      {/* Only the headers the level set out to teach. `see:` already names them
          for the grader, so the tab and the expected output cannot disagree. */}
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-1.5 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {shown.map((name) => (
            <span key={name} className="font-mono text-[10px]" style={{ color: MUTED }}>
              {name}: <span style={{ color: TEXT }}>{headerOf(res.h, name)}</span>
            </span>
          ))}
        </div>
      )}

      {/* `flex` rather than a plain block: the body below is sized with
          `flex-1`, because `h-full` inside a flex item whose own height comes
          from `flex-1` resolves to auto and leaves the content at the top. */}
      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ background: "#fff" }}>
        {location ? (
          // Checked before the empty-body case, because a redirect usually has
          // no body at all. A real browser would follow this and you would never
          // see it; the test client does not, which makes the hop visible — the
          // whole point of the level that teaches redirects.
          <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 px-6 text-center font-mono text-xs" style={{ color: "#374151" }}>
            <span>This response sends the browser to</span>
            <span className="font-bold" style={{ color: "#1F2937" }}>{location}</span>
          </div>
        ) : !res.b ? (
          <div className="flex-1 min-w-0 flex items-center justify-center px-6 text-center font-mono text-xs" style={{ color: "#9CA3AF" }}>
            {res.s === 204 ? "204 No Content — the answer is that there is nothing to send." : "The response has an empty body."}
          </div>
        ) : isJson ? (
          <pre className="flex-1 min-w-0 overflow-auto px-3 py-2.5 font-mono text-xs leading-relaxed" style={{ color: "#1F2937" }}>
            {pretty}
          </pre>
        ) : (
          // `sandbox` with no values at all: no scripts, no forms, unique
          // origin. Backend responses are server-generated text, and nothing in
          // those levels needs the page to do anything but be looked at.
          //
          // Except on the full-stack track, where the page's own script is half
          // the answer — there the page renders with `allow-scripts` and the
          // same fetch bridge the grader installs, or a student who wrote a
          // correct fetch would watch this tab stay blank while Submit passed
          // them. Still no `allow-same-origin`, so the origin stays opaque and
          // the script cannot reach the progress stored on the parent.
          <iframe
            title="Response"
            sandbox={prelude ? "allow-scripts" : ""}
            srcDoc={prelude ? prelude + res.b : res.b}
            className="flex-1 min-w-0 h-full border-0"
          />
        )}
      </div>
    </div>
  );
}
