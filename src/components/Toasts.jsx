import { useEffect, useRef, useState } from "react";
import { Check, Flame, RotateCcw, Target, X } from "lucide-react";
import { subscribeToasts } from "../lib/toast";

const GREEN = "#6AAE6F";
const AMBER = "#E9B44C";

const ICONS = { progress: Target, goal: Check, milestone: Flame, review: RotateCcw };
const ACCENTS = { progress: GREEN, goal: AMBER, milestone: AMBER, review: GREEN };

/**
 * The bar animates from where you were to where you are, rather than simply
 * rendering the new value. Seeing it move is the entire reason to show this on
 * a completion: the number was already going to be on the home page.
 */
function ProgressBar({ from, to, max, accent }) {
  const [width, setWidth] = useState(() => (max > 0 ? Math.min(from / max, 1) * 100 : 0));

  useEffect(() => {
    // Painted once at the old value, then flipped on the next frame so the
    // browser has something to transition from. Setting it during render would
    // land both values in the same paint and the bar would jump.
    const id = requestAnimationFrame(() => {
      setWidth(max > 0 ? Math.min(to / max, 1) * 100 : 0);
    });
    return () => cancelAnimationFrame(id);
  }, [to, max]);

  return (
    <div className="h-1.5 rounded-full mt-2" style={{ background: `${accent}25` }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${width}%`, background: accent, transition: "width 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      />
    </div>
  );
}

function Notice({ toast, onDone }) {
  const [leaving, setLeaving] = useState(false);
  const timers = useRef([]);

  useEffect(() => {
    timers.current.push(setTimeout(() => setLeaving(true), toast.ttl));
    // Long enough for the exit animation to finish before the node goes.
    timers.current.push(setTimeout(() => onDone(toast.id), toast.ttl + 220));
    const held = timers.current;
    return () => held.forEach(clearTimeout);
  }, [toast, onDone]);

  const Icon = ICONS[toast.kind] ?? Target;
  const accent = ACCENTS[toast.kind] ?? GREEN;

  return (
    <div
      role="status"
      className={`relative rounded-xl px-3.5 py-3 pr-9 shadow-lg ${leaving ? "notice-out" : "notice-in"}`}
      style={{
        background: "var(--bg-card)",
        border: `2px solid ${accent}`,
        boxShadow: "0 12px 32px -12px rgba(0,0,0,0.5)",
      }}
    >
      <button
        onClick={() => { setLeaving(true); setTimeout(() => onDone(toast.id), 200); }}
        aria-label="Dismiss"
        className="absolute top-1.5 right-1.5 p-1 rounded hover:brightness-125"
        style={{ color: "var(--text-muted)" }}
      >
        <X size={13} strokeWidth={2.5} />
      </button>

      <div className="flex items-start gap-2.5">
        <Icon size={16} strokeWidth={2.5} style={{ color: accent, flexShrink: 0, marginTop: 1 }} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold" style={{ color: "var(--text)" }}>{toast.title}</div>
          {toast.detail && (
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{toast.detail}</div>
          )}
          {toast.progress && (
            <ProgressBar {...toast.progress} accent={accent} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function Toasts() {
  const [items, setItems] = useState([]);

  useEffect(() => subscribeToasts((toast) => {
    // Newest at the top of the column, and never more than three at once: a
    // stack taller than that stops being a notification and starts being a wall.
    setItems((prev) => [toast, ...prev].slice(0, 3));
  }), []);

  const dismiss = (id) => setItems((prev) => prev.filter((t) => t.id !== id));

  return items.map((toast) => <Notice key={toast.id} toast={toast} onDone={dismiss} />);
}
