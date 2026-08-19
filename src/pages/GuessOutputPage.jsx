import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Flame, RotateCcw, Terminal, Volume2, VolumeX, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TRACKS } from "../data/tracks";
import { buildPool, generateRound } from "../game/guessOutput";
import PixelButton from "../components/PixelButton";
import { getScore, recordScore } from "../lib/arcadeScores";
import { recordArcadeCorrect } from "../lib/practice";
import { playCorrect, playWrong, isMuted, setMuted } from "../game/arcadeSound";

const CORRECT = "#6AAE6F";
const WRONG = "#FF5F57";

export default function GuessOutputPage() {
  const navigate = useNavigate();
  // One pass over the corpus, kept for the life of the page.
  const pool = useMemo(() => buildPool(TRACKS), []);

  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [tier, setTier] = useState(1);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => getScore("guess", "streak"));
  const [misses, setMisses] = useState(0);
  const [muted, setMutedState] = useState(() => isMuted());

  // generateRound can fail to assemble a valid set for a given seed; walk the
  // seed forward until one lands rather than showing an empty board.
  const round = useMemo(() => {
    for (let i = 0; i < 40; i++) {
      const r = generateRound(pool, seed + i, tier);
      if (r) return r;
    }
    return null;
  }, [pool, seed, tier]);

  const next = useCallback(() => {
    setPicked(null);
    setSeed((s) => s + 101);
  }, []);

  const choose = useCallback(
    (i) => {
      if (picked !== null || !round) return;
      setPicked(i);
      if (i === round.answerIndex) {
        playCorrect();
        recordArcadeCorrect("guess");
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        setBest((b) => Math.max(b, nextStreak));
        recordScore("guess", "streak", nextStreak);
        setScore((s) => {
          const total = s + 10 * tier;
          recordScore("guess", "score", total);
          return total;
        });
        setMisses(0);
        if (nextStreak % 4 === 0) setTier((t) => Math.min(3, t + 1));
      } else {
        playWrong();
        setStreak(0);
        const m = misses + 1;
        setMisses(m);
        if (m >= 2) {
          setTier((t) => Math.max(1, t - 1));
          setMisses(0);
        }
      }
    },
    [picked, round, streak, tier, misses]
  );

  // Keyboard: 1-4 to answer, Enter/Space for the next round.
  useEffect(() => {
    const onKey = (e) => {
      if (picked === null && ["1", "2", "3", "4"].includes(e.key)) choose(Number(e.key) - 1);
      else if (picked !== null && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); next(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, choose, next]);

  if (!round) {
    return (
      <div className="min-h-screen pt-24 px-4 max-w-3xl mx-auto relative z-10 text-center" style={{ color: "var(--text-muted)" }}>
        No questions available.
      </div>
    );
  }

  const answered = picked !== null;

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
          <Terminal size={22} strokeWidth={2.5} /> Guess the Output
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
          <span>tier {tier}</span>
          <span className="inline-flex items-center gap-1" style={{ color: streak > 0 ? "#E9B44C" : undefined }}>
            <Flame size={13} strokeWidth={2.5} /> {streak}
          </span>
          <span style={{ color: "var(--text)", fontWeight: 700 }}>{score}</span>
        </div>
      </div>

      <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
        What does this print?
      </p>

      <pre
        className="rounded-xl p-4 mb-5 text-sm font-mono overflow-x-auto"
        style={{ background: "var(--bg-surface)", color: "var(--text)", border: "1px solid var(--border-strong)", whiteSpace: "pre" }}
      >
        {round.source}
      </pre>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {round.choices.map((choice, i) => {
          const isAnswer = i === round.answerIndex;
          const isPicked = i === picked;
          let border = "var(--border-strong)";
          let bg = "var(--bg-card)";
          if (answered && isAnswer) { border = CORRECT; bg = "#6AAE6F18"; }
          else if (answered && isPicked) { border = WRONG; bg = "#FF5F5718"; }
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={answered}
              className="rounded-xl p-3 text-left transition-colors disabled:cursor-default"
              style={{ background: bg, border: `2px solid ${border}` }}
            >
              <div className="flex items-start gap-2">
                <span className="text-[10px] font-mono mt-0.5 shrink-0" style={{ color: "var(--text-muted)" }}>
                  {i + 1}
                </span>
                {/* whiteSpace: pre is load-bearing — some distractors differ from
                    the answer only by spacing, which HTML would otherwise
                    collapse into an identical-looking option. */}
                <pre
                  className="text-xs font-mono m-0 flex-1 overflow-x-auto"
                  style={{ color: "var(--text)", whiteSpace: "pre" }}
                >
                  {choice}
                </pre>
                {answered && isAnswer && <Check size={14} strokeWidth={3} style={{ color: CORRECT, flexShrink: 0 }} />}
                {answered && isPicked && !isAnswer && <X size={14} strokeWidth={3} style={{ color: WRONG, flexShrink: 0 }} />}
              </div>
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
            from {round.levelName} · best streak {best}
          </span>
          <PixelButton onClick={next} size="md" variant="primary">
            <span className="inline-flex items-center justify-center gap-1.5">
              <RotateCcw size={13} strokeWidth={3} /> Next
            </span>
          </PixelButton>
        </div>
      )}

      <p className="text-xs mt-6 text-center" style={{ color: "var(--text-muted)" }}>
        Press 1-4 to answer, Enter for the next question.
      </p>
    </div>
  );
}
