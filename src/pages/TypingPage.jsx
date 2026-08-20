import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Keyboard, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TRACKS } from "../data/tracks";
import { buildTypingPool, wpm, accuracy, scoreRun } from "../game/typingSource";
import PixelButton from "../components/PixelButton";
import { getScore, recordScore } from "../lib/arcadeScores";
import { useSettings } from "../context/SettingsContext";
import { announce } from "../lib/announce";
import { recordArcadeCorrect, ARCADE_CORRECT_FOR_CREDIT } from "../lib/practice";
import { playCorrect, playCollect, isMuted, setMuted } from "../game/arcadeSound";

const OK = "#6AAE6F";
const BAD = "#FF5F57";

// Leading whitespace of the line that starts at index `pos`.
function indentAfter(target, pos) {
  const rest = target.slice(pos);
  const m = rest.match(/^[ \t]*/);
  return m ? m[0] : "";
}

export default function TypingPage() {
  const { dailyGoal } = useSettings();
  const navigate = useNavigate();
  const pool = useMemo(() => buildTypingPool(TRACKS), []);
  const inputRef = useRef(null);

  const [snippet, setSnippet] = useState(() => pool[Math.floor(Math.random() * pool.length)]);
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState(null);
  const [finishedAt, setFinishedAt] = useState(null);
  const [keystrokes, setKeystrokes] = useState(0);
  const [hits, setHits] = useState(0);
  // Indentation the editor supplied on Enter. It lands in `typed` and counts
  // toward finishing the snippet, but the player never pressed those keys, so
  // it must come back out before any words-per-minute figure.
  const [autoChars, setAutoChars] = useState(0);
  const [best, setBest] = useState(() => getScore("typing", "wpm"));
  const [now, setNow] = useState(0);
  const [muted, setMutedState] = useState(() => isMuted());

  const target = snippet?.src ?? "";
  const done = finishedAt !== null;

  const reset = useCallback(() => {
    setSnippet(pool[Math.floor(Math.random() * pool.length)]);
    setTyped("");
    setStartedAt(null);
    setFinishedAt(null);
    setKeystrokes(0);
    setHits(0);
    setAutoChars(0);
    setNow(0);
    inputRef.current?.focus();
  }, [pool]);

  const onKeyDown = useCallback(
    (e) => {
      if (done) {
        if (e.key === "Enter") { e.preventDefault(); reset(); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      let next;
      if (e.key === "Backspace") {
        e.preventDefault();
        setTyped((t) => t.slice(0, -1));
        return;
      }
      if (e.key === "Tab") { e.preventDefault(); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        // Supply the next line's indentation automatically. Making the player
        // type four spaces is busywork, and it would wreck both the WPM figure
        // and the per-character diff.
        next = "\n" + indentAfter(target, typed.length + 1);
      } else if (e.key.length === 1) {
        e.preventDefault();
        next = e.key;
      } else {
        return;
      }

      if (startedAt === null) setStartedAt(performance.now());

      const expected = target.slice(typed.length, typed.length + next.length);
      // Counted locally as well as in state: setState has not applied yet, so
      // reading `hits`/`keystrokes` below would be one keystroke behind — and
      // the keystroke that finishes the run is exactly the one that matters.
      const totalKeystrokes = keystrokes + 1;
      const totalHits = hits + (next === expected ? 1 : 0);
      setKeystrokes(totalKeystrokes);
      setHits(totalHits);

      const autoNow = autoChars + (e.key === "Enter" ? next.length - 1 : 0);
      if (autoNow !== autoChars) setAutoChars(autoNow);

      const updated = typed + next;
      setTyped(updated);
      if (updated.length >= target.length) {
        // Settle the run here rather than in an effect: the final time is known
        // at this instant, and deriving it later would mean reading the clock
        // during render.
        const at = performance.now();
        setFinishedAt(at);
        // A clean run gets the fanfare; a messy one still finished, so it gets
        // the softer cue rather than a failure sound.
        if (accuracy(totalHits, totalKeystrokes) >= 95) playCorrect();
        else playCollect();
        const run = scoreRun({
          chars: updated.length,
          autoChars: autoNow,
          elapsedMs: at - (startedAt ?? at),
          accuracyPct: accuracy(totalHits, totalKeystrokes),
        });
        // scoreRun decides this: clean enough, long enough to have measured
        // anything, and a figure a human could actually produce. The displayed
        // best moves only when the stored one does, otherwise the screen shows
        // a record that is not in storage and disappears on the next reload.
        if (run.record) {
          setBest((b) => Math.max(b, run.wpm));
          recordScore("typing", "wpm", run.wpm);
        }
        // Unlike the endless games, a typing run genuinely ends, so finishing
        // one is worth the game's whole daily credit rather than a fifth of it.
        let credit = null;
        for (let i = 0; i < ARCADE_CORRECT_FOR_CREDIT; i++) {
          credit = recordArcadeCorrect("typing", { goal: dailyGoal }) || credit;
        }
        if (credit) announce(credit);
      }
    },
    [done, reset, target, typed, startedAt, hits, keystrokes, autoChars, dailyGoal]
  );

  useEffect(() => { inputRef.current?.focus(); }, [snippet]);

  // Ticks only while a run is in progress, so the live speed updates without
  // reading the clock during render.
  useEffect(() => {
    if (startedAt === null || finishedAt !== null) return undefined;
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, [startedAt, finishedAt]);

  const elapsed = startedAt === null ? 0 : (finishedAt ?? Math.max(now, startedAt)) - startedAt;
  const speed = wpm(Math.max(0, typed.length - autoChars), elapsed);
  const acc = accuracy(hits, keystrokes);

  if (!snippet) {
    return <div className="min-h-screen pt-24 px-4 text-center relative z-10" style={{ color: "var(--text-muted)" }}>No snippets available.</div>;
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 max-w-3xl mx-auto relative z-10">
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
          <Keyboard size={22} strokeWidth={2.5} /> Speed Typing
        </h1>
        <div className="flex items-center gap-4 text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
          <button
            onClick={() => { setMuted(!muted); setMutedState(!muted); }}
            title={muted ? "Unmute" : "Mute"}
            className="inline-flex items-center transition-colors hover:brightness-125"
            style={{ color: "var(--text-muted)" }}
          >
            {muted ? <VolumeX size={15} strokeWidth={2.5} /> : <Volume2 size={15} strokeWidth={2.5} />}
          </button>
          <span><span style={{ color: "var(--text)", fontWeight: 700 }}>{speed}</span> wpm</span>
          <span><span style={{ color: acc >= 95 ? OK : "var(--text)", fontWeight: 700 }}>{acc}</span>%</span>
        </div>
      </div>

      <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
        Type it exactly. Indentation is filled in for you when you press Enter.
      </p>

      {/* A per-character diff over a hidden input, not an editor: CodeMirror
          would auto-indent and auto-close brackets, inserting characters the
          player never typed and corrupting both the diff and the WPM count. */}
      <div
        onClick={() => inputRef.current?.focus()}
        className="rounded-xl p-4 mb-4 cursor-text overflow-x-auto"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-strong)" }}
      >
        <pre className="text-sm font-mono m-0" style={{ whiteSpace: "pre" }}>
          {[...target].map((ch, i) => {
            const typedCh = typed[i];
            let color = "var(--text-muted)";
            let background = "transparent";
            let underline = "none";
            if (i < typed.length) {
              const right = typedCh === ch;
              color = right ? "var(--text)" : BAD;
              // A wrong newline or space has nothing to show, so mark the cell.
              if (!right) background = "#FF5F5730";
            } else if (i === typed.length) {
              background = "#7AA2F740";
              underline = "underline";
            }
            return (
              <span key={i} style={{ color, background, textDecoration: underline }}>
                {ch}
              </span>
            );
          })}
        </pre>
      </div>

      <input
        ref={inputRef}
        onKeyDown={onKeyDown}
        value=""
        onChange={() => {}}
        className="absolute opacity-0 w-0 h-0"
        aria-label="typing input"
      />

      {done ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
            {snippet.name} · {(elapsed / 1000).toFixed(1)}s · best {best} wpm
          </span>
          <PixelButton onClick={reset} size="md" variant="primary">
            <span className="inline-flex items-center justify-center gap-1.5">
              <RotateCcw size={13} strokeWidth={3} /> Again
            </span>
          </PixelButton>
        </div>
      ) : (
        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
          {startedAt === null ? "Start typing to begin the clock." : `${typed.length} / ${target.length}`}
        </p>
      )}
    </div>
  );
}
