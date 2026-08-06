import { Compass, Gamepad2, Home } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import PixelButton from "../components/PixelButton";

// vercel.json rewrites every path to index.html so deep links work, which means
// a typo'd URL reaches the router rather than the CDN's 404. Without a catch-all
// route that rendered as a blank page under the navbar.

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 flex flex-col items-center justify-center text-center relative z-10">
      <Compass size={52} strokeWidth={1.5} className="mb-5 opacity-60" style={{ color: "var(--text-muted)" }} />

      <h1
        className="text-3xl sm:text-4xl font-black mb-3"
        style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
      >
        404
      </h1>

      {/* A traceback rather than a shrug: this is a site about reading Python
          errors, and it names the path that actually failed. */}
      <div
        className="rounded-xl p-4 mb-7 text-left max-w-lg w-full overflow-x-auto"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-strong)" }}
      >
        <pre className="text-xs font-mono m-0" style={{ whiteSpace: "pre", color: "var(--text-secondary)" }}>
{`Traceback (most recent call last):
  File "browser.py", line 1, in <module>
    open(`}<span style={{ color: "#6AAE6F" }}>{JSON.stringify(pathname)}</span>{`)
`}<span style={{ color: "#FF5F57" }}>RouteNotFound</span>{`: that page doesn't exist`}
        </pre>
      </div>

      <p className="text-sm mb-8 max-w-sm" style={{ color: "var(--text-secondary)" }}>
        The link may be mistyped, or the page moved. Everything below still works.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <PixelButton onClick={() => navigate("/")} variant="primary">
          <span className="inline-flex items-center justify-center gap-1.5">
            <Home size={14} strokeWidth={3} /> Home
          </span>
        </PixelButton>
        <PixelButton onClick={() => navigate("/tracks")} variant="secondary">
          <span className="inline-flex items-center justify-center gap-1.5">
            <Compass size={14} strokeWidth={3} /> Tracks
          </span>
        </PixelButton>
        <PixelButton onClick={() => navigate("/arcade")} variant="ghost">
          <span className="inline-flex items-center justify-center gap-1.5">
            <Gamepad2 size={14} strokeWidth={3} /> Arcade
          </span>
        </PixelButton>
      </div>
    </div>
  );
}
