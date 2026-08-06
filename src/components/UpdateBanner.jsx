import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";

// A deployed SPA keeps serving whoever already has it. Someone who left a tab
// open on Monday is still running Monday's bundle on Friday — new levels and
// bug fixes never reach them until they happen to hard-reload.
//
// Detection without extra infrastructure: Vite fingerprints the entry chunk
// (/assets/index-<hash>.js), and index.html is the one file that always points
// at the current one. Re-fetch it and compare the hash against the bundle this
// tab actually booted from. No service worker, no version endpoint to maintain,
// nothing to remember to bump at release time.

const POLL_MS = 5 * 60 * 1000;

/** The entry chunk this tab is running, taken from the DOM at load. */
function currentEntry() {
  const scripts = [...document.querySelectorAll('script[type="module"][src]')];
  const entry = scripts.map((s) => s.getAttribute("src")).find((s) => /\/assets\/index-/.test(s || ""));
  return entry || null;
}

/** The entry chunk index.html points at right now, or null if unknown. */
async function deployedEntry() {
  // cache:no-store, and a query param, because the CDN will happily hand back
  // the very copy of index.html we are trying to look past.
  const res = await fetch(`/index.html?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  const html = await res.text();
  return html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? null;
}

export default function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const mine = useRef(currentEntry());

  const check = useCallback(async () => {
    if (!mine.current || document.visibilityState !== "visible") return;
    try {
      const live = await deployedEntry();
      if (live && live !== mine.current) setAvailable(true);
    } catch {
      // Offline or a blip — try again on the next tick.
    }
  }, []);

  useEffect(() => {
    // No entry chunk means the dev server (unhashed module graph), where this
    // banner has nothing to say.
    if (!mine.current) return undefined;
    const id = setInterval(check, POLL_MS);
    // Coming back to a tab left open for hours is exactly when this matters.
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [check]);

  if (!available || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 rounded-xl p-3 pr-2 flex items-center gap-3 max-w-[calc(100vw_-_2rem)]"
      style={{
        background: "var(--bg-card)",
        border: "2px solid #6AAE6F",
        boxShadow: "0 12px 32px -12px rgba(0,0,0,0.5)",
      }}
    >
      <RefreshCw size={16} strokeWidth={2.5} style={{ color: "#6AAE6F", flexShrink: 0 }} />
      <div className="min-w-0">
        <div className="text-xs font-bold" style={{ color: "var(--text)" }}>A new version is available</div>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Reload to get the latest levels and fixes.</div>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 hover:brightness-110 active:scale-[0.98] transition-all"
        style={{ background: "#6AAE6F", color: "#fff" }}
      >
        Reload
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 p-1 rounded hover:brightness-125"
        style={{ color: "var(--text-muted)" }}
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}
