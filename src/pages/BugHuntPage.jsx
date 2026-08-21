import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bug, Check, Flame, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TRACKS } from "../data/tracks";
import { runnableSource, srcHash } from "../data/levelSource";
import PixelButton from "../components/PixelButton";
import { getScore, recordScore } from "../lib/arcadeScores";
import { useSettings } from "../context/SettingsContext";
import { announce } from "../lib/announce";
import { ArcadeGameSkeleton } from "../components/Skeleton";
import { recordArcadeCorrect } from "../lib/practice";
import { playCorrect, playWrong, isMuted, setMuted } from "../game/arcadeSound";

const CORRECT = "#6AAE6F";
const WRONG = "#FF5F57";

// Index every level by the id it actually has. This used to re-count positions
// here instead, which agreed with the generator only for as long as no chapter
// was ever inserted mid-track; the moment one was, every puzzle after it
// resolved to the wrong level. tracks.js has already assigned these (see
// assignLevelIds in levelSource), so read them rather than deriving them again.
function buildLevelIndex() {
  const index = new Map();
  for (const track of TRACKS) {
    for (const chapter of track.chapters) {
      for (const level of chapter.levels) {
        index.set(`${track.slug}#${level.id}`, { track, level });
      }
    }
  }
  return index;
}

export default function BugHuntPage() {
  const { dailyGoal } = useSettings();
  const navigate = useNavigate();
  const [deck, setDeck] = useState(null);
  const [order, setOrder] = useState([]);
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => getScore("bughunt", "streak"));
  const [muted, setMutedState] = useState(() => isMuted());

  const levelIndex = useMemo(() => buildLevelIndex(), []);

  // The manifest is its own chunk, fetched only when this page opens.
  useEffect(() => {
    let alive = true;
    import("../data/bughunt.json")
      .then((mod) => {
        if (!alive) return;
        const puzzles = (mod.default?.puzzles || mod.puzzles || []).filter((p) => {
          // Drop anything whose level has been edited since generation: the
          // recorded line index would point at the wrong line.
          const entry = levelIndex.get(`${p.t}#${p.l}`);
          if (!entry) return false;
          return srcHash(runnableSource(entry.track.slug, entry.level)) === p.h;
        });
        setDeck(puzzles);
        setOrder(puzzles.map((_, i) => i).sort(() => Math.random() - 0.5));
      })
      .catch(() => setDeck([]));
    return () => { alive = false; };
  }, [levelIndex]);

  const puzzle = deck && order.length ? deck[order[at % order.length]] : null;

  // The mutated listing, plus the line the generator replaced. Keeping the
  // original around lets the reveal show what it should have said, which is the
  // part that actually teaches something.
  const { lines, originalLine } = useMemo(() => {
    if (!puzzle) return { lines: [], originalLine: "" };
    const entry = levelIndex.get(`${puzzle.t}#${puzzle.l}`);
    const src = runnableSource(entry.track.slug, entry.level).split("\n");
    const original = src[puzzle.i] ?? "";
    src[puzzle.i] = puzzle.s;
    return { lines: src, originalLine: original };
  }, [puzzle, levelIndex]);

  const next = useCallback(() => {
    setPicked(null);
    setAt((a) => a + 1);
  }, []);

  const choose = useCallback(
    (lineIndex) => {
      if (picked !== null || !puzzle) return;
      const line = lines[lineIndex];
      if (!line || !line.trim() || line.trim().startsWith("#")) return;
      setPicked(lineIndex);
      if (puzzle.a.includes(lineIndex)) {
        playCorrect();
        // Counts toward the daily goal at half a level, once per game per day.
        // Half a level toward today's goal, once per game per day. The result
        // is only non-null on the credit itself, so this is silent otherwise.
        const credit = recordArcadeCorrect("bughunt", { goal: dailyGoal });
        if (credit) announce(credit);
        const s = streak + 1;
        setStreak(s);
        setBest((b) => Math.max(b, s));
        recordScore("bughunt", "streak", s);
        setScore((v) => {
          const total = v + 15;
          recordScore("bughunt", "score", total);
          return total;
        });
      } else {
        playWrong();
        setStreak(0);
      }
    },
    [picked, puzzle, lines, streak, dailyGoal]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (picked !== null && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); next(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, next]);

  if (deck === null) {
    return <ArcadeGameSkeleton title="Bug Hunt" icon={Bug} />;
  }
  if (!puzzle) {
    return <div className="min-h-screen pt-24 px-4 text-center relative z-10" style={{ color: "var(--text-muted)" }}>No puzzles available.</div>;
  }

  const answered = picked !== null;
  const gotIt = answered && puzzle.a.includes(picked);
  const entry = levelIndex.get(`${puzzle.t}#${puzzle.l}`);

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
          <Bug size={22} strokeWidth={2.5} /> Bug Hunt
        </h1>
        <div className="flex items-center gap-3 text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
          <button
            onClick={() => { setMuted(!muted); setMutedState(!muted); }}
            title={muted ? "Unmute" : "Mute"}
            className="inline-flex items-center transition-colors hover:brightness-125"
            style={{ color: "var(--text-muted)" }}
          >
            {muted ? <VolumeX size={15} strokeWidth={2.5} /> : <Volume2 size={15} strokeWidth={2.5} />}
          </button>
          <span className="inline-flex items-center gap-1" style={{ color: streak > 0 ? "#E9B44C" : undefined }}>
            <Flame size={13} strokeWidth={2.5} /> {streak}
          </span>
          <span style={{ color: "var(--text)", fontWeight: 700 }}>{score}</span>
        </div>
      </div>

      <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
        Exactly one line is wrong. Compare the two outputs, then click the line that
        explains the difference.
      </p>

      {/* Shown BEFORE the guess, deliberately. A broken line is often valid Python
          that reads perfectly well on its own — `print(Point(4, 4))` is only wrong
          because the answer should have been Point(1, 2). Without both outputs in
          front of you there is nothing to reason from and the round is a guess. */}
      <div
        className="rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-strong)" }}
      >
        <div>
          <div className="font-bold mb-1" style={{ color: CORRECT }}>SHOULD PRINT</div>
          <pre className="font-mono m-0 overflow-x-auto" style={{ color: "var(--text)", whiteSpace: "pre-wrap" }}>
            {entry.level.tests?.[0]?.expected ?? ""}
          </pre>
        </div>
        <div>
          <div className="font-bold mb-1" style={{ color: WRONG }}>ACTUALLY PRINTS</div>
          {/* Only ever the output, never the traceback — a traceback names the
              offending line and would hand over the answer. */}
          <pre className="font-mono m-0 overflow-x-auto" style={{ color: "var(--text)", whiteSpace: "pre-wrap" }}>
            {puzzle.c === "SILENT" ? puzzle.w : "the program crashes"}
          </pre>
        </div>
      </div>

      {/* A plain <pre>, never a CodeMirror instance: Python highlighting would
          break visibly at a bad token and give the answer away. */}
      <div
        className="rounded-xl overflow-hidden mb-4"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-strong)" }}
      >
        {lines.map((line, i) => {
          const clickable = line.trim() && !line.trim().startsWith("#");
          const isAnswer = puzzle.a.includes(i);
          let bg = "transparent";
          if (answered && isAnswer) bg = "#6AAE6F22";
          else if (answered && i === picked) bg = "#FF5F5722";
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={answered || !clickable}
              className="w-full flex items-start gap-3 px-3 py-0.5 text-left transition-colors disabled:cursor-default enabled:hover:brightness-125"
              style={{ background: bg }}
            >
              <span className="text-[11px] font-mono select-none shrink-0 w-6 text-right" style={{ color: "var(--text-muted)" }}>
                {i + 1}
              </span>
              <pre className="text-xs font-mono m-0 flex-1 overflow-x-auto" style={{ color: "var(--text)", whiteSpace: "pre" }}>
                {line || " "}
              </pre>
              {answered && isAnswer && <Check size={13} strokeWidth={3} style={{ color: CORRECT, flexShrink: 0 }} />}
              {answered && i === picked && !isAnswer && <X size={13} strokeWidth={3} style={{ color: WRONG, flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>

      {/* The outputs are already on screen above, so the verdict only has to say
          which line it was and what the original said. */}
      {answered && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: gotIt ? "#6AAE6F12" : "#FF5F5712", border: `1.5px solid ${gotIt ? CORRECT : WRONG}40` }}
        >
          <div className="text-xs font-bold mb-2" style={{ color: gotIt ? CORRECT : WRONG }}>
            {gotIt ? "FOUND IT" : `IT WAS LINE ${puzzle.a[0] + 1}`}
          </div>
          <div className="text-xs">
            <div className="font-bold mb-1" style={{ color: "var(--text-muted)" }}>
              Line {puzzle.a[0] + 1} should have been
            </div>
            <pre className="font-mono m-0 overflow-x-auto" style={{ color: "var(--text)", whiteSpace: "pre" }}>
              {originalLine}
            </pre>
          </div>
        </div>
      )}

      {answered && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
            from {puzzle.n} · best streak {best}
          </span>
          <PixelButton onClick={next} size="md" variant="primary">
            <span className="inline-flex items-center justify-center gap-1.5">
              <RotateCcw size={13} strokeWidth={3} /> Next
            </span>
          </PixelButton>
        </div>
      )}
    </div>
  );
}
