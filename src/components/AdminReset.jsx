import { useEffect, useState } from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { TRACKS } from "../data/tracks";
import { useProgress } from "../hooks/useProgress";

// The admin-only block inside the account menu: pick a track (or everything) and
// erase its progress. Rendered only when `isAdmin` (see src/lib/admin.js), so a
// student never sees it — it exists because authoring a track means finishing it
// over and over, and there is otherwise no way to un-finish a level.
//
// Two clicks rather than a `window.confirm`: a native modal blocks the whole page
// (and wedges browser automation), and this is a destructive action that must not
// fire on a stray click. The armed state expires on its own.

const ALL = "__all__";
const ARM_MS = 5000;

export default function AdminReset({ onDone }) {
  const { resetProgress } = useProgress();
  const [slug, setSlug] = useState(ALL);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), ARM_MS);
    return () => clearTimeout(t);
  }, [armed]);

  const run = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setBusy(true);
    setError("");
    try {
      await resetProgress(slug === ALL ? undefined : slug);
      onDone?.();
    } catch {
      // Local storage is already clear at this point but the cloud row is not,
      // and the login merge keeps the best of both — so say what will happen
      // rather than reporting a clean success.
      setError("Cleared on this device only — the cloud write failed, so it returns on next login.");
    } finally {
      setBusy(false);
    }
  };

  const target = slug === ALL ? "every track" : TRACKS.find((t) => t.slug === slug)?.name;

  return (
    <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--border-strong)" }}>
      <div
        className="text-[11px] font-bold inline-flex items-center gap-1.5 mb-2"
        style={{ color: "var(--text-muted)" }}
      >
        <ShieldCheck size={11} strokeWidth={2.5} /> Admin
      </div>

      <select
        value={slug}
        onChange={(e) => { setSlug(e.target.value); setArmed(false); setError(""); }}
        aria-label="Track to reset"
        className="w-full text-[11px] rounded-lg px-2 py-1.5 mb-2"
        style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border-strong)" }}
      >
        <option value={ALL}>Everything</option>
        {TRACKS.map((t) => (
          <option key={t.slug} value={t.slug}>{t.name}</option>
        ))}
      </select>

      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="w-full text-[11px] font-bold rounded-lg px-2 py-1.5 transition-colors hover:brightness-125 disabled:opacity-60"
        style={{
          color: armed ? "#fff" : "#FF5F57",
          background: armed ? "#FF5F57" : "transparent",
          border: "1px solid #FF5F5766",
        }}
      >
        <span className="inline-flex items-center gap-1.5">
          <RotateCcw size={11} strokeWidth={2.5} />
          {busy ? "Resetting…" : armed ? `Confirm: wipe ${target}` : "Reset progress"}
        </span>
      </button>

      {error && (
        <div className="text-[10px] mt-1.5 leading-snug" style={{ color: "#FF5F57" }}>{error}</div>
      )}
    </div>
  );
}
