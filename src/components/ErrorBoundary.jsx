import { Component } from "react";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

// A thrown render error unmounts the whole tree, so without this the page goes
// blank — no navbar, no way back, nothing that tells the student what happened.
//
// This is not hypothetical here. Icon deliberately throws when a track or
// chapter icon has no file, which is the right call for catching a bad asset in
// review, but it means one missing SVG takes the entire app down for a visitor.
// Better to lose the one screen and keep a route out of it.
//
// Class component because componentDidCatch has no hook equivalent.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the real stack in the console — the UI deliberately shows only a
    // one-line summary, but whoever is debugging needs the component trace.
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen pt-24 pb-16 px-4 flex flex-col items-center justify-center text-center relative z-10">
        <AlertTriangle size={52} strokeWidth={1.5} className="mb-5" style={{ color: "#E9B44C" }} />

        <h1
          className="text-2xl sm:text-3xl font-black mb-3"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
        >
          Something broke
        </h1>

        <p className="text-sm mb-5 max-w-sm" style={{ color: "var(--text-secondary)" }}>
          This page hit an error and stopped. Your progress is saved — it lives in
          your browser and account, not on this screen.
        </p>

        <div
          className="rounded-xl p-3 mb-7 max-w-lg w-full overflow-x-auto"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-strong)" }}
        >
          <pre className="text-xs font-mono m-0 text-left" style={{ whiteSpace: "pre-wrap", color: "#FF5F57" }}>
            {String(error?.message || error)}
          </pre>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 text-sm font-bold rounded-lg transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ background: "#6AAE6F", color: "#fff" }}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <RotateCcw size={14} strokeWidth={3} /> Reload
            </span>
          </button>
          {/* A full navigation, not a router push: the router lives inside the
              tree that just crashed, so re-rendering it would only crash again. */}
          <button
            onClick={() => { window.location.href = "/"; }}
            className="px-6 py-3 text-sm font-bold rounded-lg transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ background: "transparent", color: "#6AAE6F", border: "2px solid #6AAE6F" }}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <Home size={14} strokeWidth={3} /> Home
            </span>
          </button>
        </div>
      </div>
    );
  }
}
