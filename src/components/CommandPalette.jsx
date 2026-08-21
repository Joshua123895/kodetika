import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { TRACKS } from "../data/tracks";
import { useProgress } from "../hooks/useProgress";
import { buildIndex, searchLevels } from "../lib/levelSearch";
import StarIcon from "./StarIcon";

const GREEN = "#6AAE6F";

// Anything can open the palette by dispatching "kdt-open-search" on window;
// the navbar's search button does. A string, not an export, so this file keeps
// fast refresh by exporting only the component.

/**
 * Ctrl+K over all 862 levels. Mounted once in App; opens from the shortcut or
 * from the navbar's search button (phones have no Ctrl), closes on Esc, on the
 * backdrop, or by picking a result.
 */
export default function CommandPalette() {
  const navigate = useNavigate();
  const { getStars } = useProgress();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  // Built once: tracks never change within a session.
  const index = useMemo(() => buildIndex(TRACKS), []);
  const results = useMemo(() => searchLevels(index, query), [index, query]);

  useEffect(() => {
    // Opening resets here, in the handler, rather than in an open-effect: the
    // reset belongs to the act of opening, and the input focuses itself via
    // autoFocus when it mounts.
    const show = () => {
      setQuery("");
      setSelected(0);
      setOpen(true);
    };
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (o) return false;
          setQuery("");
          setSelected(0);
          return true;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("kdt-open-search", show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("kdt-open-search", show);
    };
  }, []);

  // Clamped at read time instead of corrected by an effect, so a shrinking
  // result list can never leave the highlight past the end.
  const sel = Math.min(selected, Math.max(0, results.length - 1));

  if (!open) return null;

  const go = (entry) => {
    setOpen(false);
    navigate(entry.path);
  };

  const onInputKey = (e) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(Math.min(sel + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(Math.max(sel - 1, 0));
    } else if (e.key === "Enter" && results[sel]) {
      go(results[sel]);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-24 px-4">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "var(--overlay)" }}
        onClick={() => setOpen(false)}
      />
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          background: "var(--bg-card)",
          border: `2px solid ${GREEN}`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div className="flex items-center gap-2.5 px-4" style={{ borderBottom: "1px solid var(--border-strong)" }}>
          <Search size={16} strokeWidth={2.5} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search 862 levels"
            className="flex-1 py-3.5 text-sm outline-none bg-transparent"
            style={{ color: "var(--text)" }}
            aria-label="Search levels"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: "var(--text-muted)", border: "1px solid var(--border-strong)" }}>
            esc
          </kbd>
        </div>

        {query.trim() && (
          <div className="max-h-80 overflow-y-auto py-1">
            {results.length === 0 && (
              <p className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Nothing called that. Try fewer letters.
              </p>
            )}
            {results.map((r, i) => {
              const stars = getStars(r.trackSlug, r.levelId);
              return (
                <button
                  key={r.path}
                  onClick={() => go(r)}
                  onMouseEnter={() => setSelected(i)}
                  className="w-full px-4 py-2.5 flex items-center gap-3 text-left"
                  style={{ background: i === sel ? `${GREEN}18` : "transparent" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                      {r.name}
                    </div>
                    <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                      {r.trackName} · {r.chapterName}
                    </div>
                  </div>
                  {stars > 0 && (
                    <span className="flex gap-0.5 flex-shrink-0" aria-label={`${stars} stars`}>
                      {[1, 2, 3].map((s) => (
                        <StarIcon key={s} filled={s <= stars} className="text-[10px]" />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
