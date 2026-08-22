import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  MONTH_NAMES,
  WEEKDAY_SHORT,
  monthMatrix,
  parseISO,
  shiftMonth,
  todayISO,
} from "../lib/calendar";
import { formatMetDate } from "../lib/meetings";

const GREEN = "#6AAE6F";

/**
 * A date field that opens the app's own calendar rather than the browser's.
 *
 * `<input type="date">` was doing this job, and its button is a native widget:
 * it ignores the theme entirely, so on the dark palettes the little calendar
 * glyph was a dark icon on a dark field, and the popup that opened was a white
 * sheet in the middle of a black page. This one is drawn from the same CSS
 * variables as everything else and reads the date back in the same
 * "Saturday, 22-08-2026" the table uses.
 *
 * `value` and `onChange` speak "yyyy-mm-dd", exactly as the input did.
 */
export default function DatePicker({ value, onChange, ariaLabel = "Date" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const selected = parseISO(value);
  const today = todayISO();
  // The month on screen. Starts on the selected date, or on this month when
  // there is not one yet; kept in state so paging does not lose the selection.
  const [view, setView] = useState(() => {
    const base = selected || parseISO(today);
    return { year: base.year, month: base.month };
  });

  // Anchored when it opens rather than synced by an effect: the calendar
  // should always come up on the month it is showing, and paging inside it
  // must not be yanked back by a re-render.
  const toggle = () => {
    if (!open) {
      const base = parseISO(value) || parseISO(today);
      setView({ year: base.year, month: base.month });
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const weeks = useMemo(() => monthMatrix(view.year, view.month), [view]);

  const choose = (iso) => {
    onChange(iso);
    setOpen(false);
  };

  const cellStyle = (cell) => {
    if (cell.iso === value) return { background: GREEN, color: "#fff", fontWeight: 700 };
    if (cell.iso === today) {
      return { border: `1.5px solid ${GREEN}`, color: "var(--text)" };
    }
    return { color: cell.inMonth ? "var(--text)" : "var(--text-disabled)" };
  };

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs outline-none hover:brightness-110 transition whitespace-nowrap"
        style={{
          background: "var(--bg)",
          border: `1.5px solid ${open ? GREEN : "var(--border-strong)"}`,
          color: "var(--text)",
        }}
      >
        <CalendarDays size={13} strokeWidth={2.5} style={{ color: GREEN }} />
        {value ? formatMetDate(value) : "Pick a date"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 rounded-xl p-3 shadow-xl"
          style={{
            background: "var(--bg-card)",
            border: "2px solid var(--border-strong)",
            minWidth: 248,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
              className="p-1 rounded-md hover:brightness-125 transition"
              style={{ color: "var(--text-muted)" }}
              aria-label="Previous month"
            >
              <ChevronLeft size={15} strokeWidth={2.5} />
            </button>
            <span
              className="text-xs font-bold"
              style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
            >
              {MONTH_NAMES[view.month]} {view.year}
            </span>
            <button
              type="button"
              onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
              className="p-1 rounded-md hover:brightness-125 transition"
              style={{ color: "var(--text-muted)" }}
              aria-label="Next month"
            >
              <ChevronRight size={15} strokeWidth={2.5} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAY_SHORT.map((d) => (
              <div
                key={d}
                className="text-[10px] font-bold text-center py-1"
                style={{ color: "var(--text-muted)" }}
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {weeks.flat().map((cell) => (
              <button
                key={cell.iso}
                type="button"
                onClick={() => choose(cell.iso)}
                aria-current={cell.iso === value ? "date" : undefined}
                className="text-[11px] rounded-md py-1.5 hover:brightness-125 transition"
                style={cellStyle(cell)}
              >
                {cell.day}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => choose(today)}
            className="w-full mt-2 py-1.5 rounded-lg text-[11px] font-bold hover:brightness-125 transition"
            style={{ color: GREEN, background: `${GREEN}18` }}
          >
            Today
          </button>
        </div>
      )}
    </div>
  );
}
