import { useMemo, useState } from "react";
import { ArrowLeft, Bug, Gamepad2, Keyboard, Play, Terminal, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TRACKS } from "../data/tracks";
import GameModal from "../game/GameModal";
import PixelButton from "../components/PixelButton";
import { useProgress, getSavedCode } from "../hooks/useProgress";

// The Mini Project chapter of the Game Development track already contains four
// complete, working pygame programs. They live in `start:` rather than `sol:` —
// those levels ask the student to change one constant in a running game, so the
// starter IS the finished program. GameModal takes only { code, onClose } and
// never looks at a level, so they run standalone here with no new machinery.
function miniProjectGames() {
  const track = TRACKS.find((t) => t.slug === "game-dev");
  const chapter = track?.chapters.find((c) => c.name === "Mini Project");
  if (!chapter) return [];

  const blurbs = {
    Pong: "Two paddles, one ball. First to miss loses.",
    Breakout: "Clear every brick without dropping the ball.",
    Snake: "Eat, grow, and try not to bite yourself.",
    "Free Build": "An empty canvas and the whole drawing toolkit.",
  };

  return chapter.levels
    .filter((lvl) => lvl.startingCode && lvl.startingCode.trim())
    .map((lvl) => {
      // Play the version the student actually built. Game levels deliberately
      // keep saved code after submitting, and for Free Build that saved code IS
      // the game — running the blank starter instead would throw their work
      // away. Falls back to the starter when they haven't touched the level.
      const mine = getSavedCode(track.slug, lvl.id);
      const usingMine = Boolean(mine && mine.trim());
      return {
        name: lvl.name,
        code: usingMine ? mine : lvl.startingCode,
        usingMine,
        blurb: blurbs[lvl.name] || "",
        // Free Build is a sandbox, not a game with a goal — say so rather than
        // presenting it as something to win.
        sandbox: lvl.name === "Free Build",
      };
    });
}

export default function ArcadePage() {
  const navigate = useNavigate();
  const [playing, setPlaying] = useState(null);
  const { codeSyncTick } = useProgress();
  // codeSyncTick is a cache key, not an argument: miniProjectGames() reads saved
  // code straight out of localStorage, and the tick is what tells us the login
  // merge just rewrote it. The linter can't see that read, hence the exemption.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const games = useMemo(() => miniProjectGames(), [codeSyncTick]);

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 max-w-4xl mx-auto relative z-10">
      <div className="mb-8">
        <button
          onClick={() => navigate("/")}
          className="text-sm mb-4 flex items-center gap-1 hover:gap-2 transition-all"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft size={14} className="inline mr-1" /> Back to Home
        </button>
        <h1
          className="text-3xl font-black mb-2 flex items-center gap-2"
          style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
        >
          <Gamepad2 size={28} strokeWidth={2.5} /> Arcade
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Games written in Python, running in your browser. No account, no score to chase.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Quiz games are their own routes rather than modals — they are a
            sustained activity, not a thing you pop open and close. */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: "var(--bg-card)", border: "2px solid var(--border-strong)" }}
        >
          <div className="flex items-center gap-2">
            <Terminal size={18} strokeWidth={2.5} style={{ color: "#7AA2F7" }} />
            <span
              className="text-lg font-black"
              style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
            >
              Guess the Output
            </span>
          </div>
          <p className="text-sm flex-1" style={{ color: "var(--text-secondary)" }}>
            Read a real snippet and pick what it prints. Gets harder as you go.
          </p>
          <PixelButton onClick={() => navigate("/arcade/guess-output")} size="md" variant="secondary">
            <span className="inline-flex items-center justify-center gap-1.5">
              <Play size={13} strokeWidth={3} fill="currentColor" /> Play
            </span>
          </PixelButton>
        </div>

        <div
          className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: "var(--bg-card)", border: "2px solid var(--border-strong)" }}
        >
          <div className="flex items-center gap-2">
            <Bug size={18} strokeWidth={2.5} style={{ color: "#FF5F57" }} />
            <span
              className="text-lg font-black"
              style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
            >
              Bug Hunt
            </span>
          </div>
          <p className="text-sm flex-1" style={{ color: "var(--text-secondary)" }}>
            One line of working code has been broken. Find it.
          </p>
          <PixelButton onClick={() => navigate("/arcade/bug-hunt")} size="md" variant="secondary">
            <span className="inline-flex items-center justify-center gap-1.5">
              <Play size={13} strokeWidth={3} fill="currentColor" /> Play
            </span>
          </PixelButton>
        </div>

        <div
          className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: "var(--bg-card)", border: "2px solid var(--border-strong)" }}
        >
          <div className="flex items-center gap-2">
            <Keyboard size={18} strokeWidth={2.5} style={{ color: "#BB9AF7" }} />
            <span
              className="text-lg font-black"
              style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
            >
              Speed Typing
            </span>
          </div>
          <p className="text-sm flex-1" style={{ color: "var(--text-secondary)" }}>
            Type real code against the clock. Words per minute and accuracy.
          </p>
          <PixelButton onClick={() => navigate("/arcade/typing")} size="md" variant="secondary">
            <span className="inline-flex items-center justify-center gap-1.5">
              <Play size={13} strokeWidth={3} fill="currentColor" /> Play
            </span>
          </PixelButton>
        </div>

        {games.map((game) => (
          <div
            key={game.name}
            className="rounded-2xl p-5 flex flex-col gap-3"
            style={{ background: "var(--bg-card)", border: "2px solid var(--border-strong)" }}
          >
            <div className="flex items-center gap-2">
              {game.sandbox ? (
                <Wrench size={18} strokeWidth={2.5} style={{ color: "#E9B44C" }} />
              ) : (
                <Gamepad2 size={18} strokeWidth={2.5} style={{ color: "#6AAE6F" }} />
              )}
              <span
                className="text-lg font-black"
                style={{ color: "var(--text)", fontFamily: "'Courier New', monospace" }}
              >
                {game.name}
              </span>
              {game.usingMine && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: "#7AA2F720", color: "#7AA2F7" }}
                >
                  YOUR BUILD
                </span>
              )}
            </div>
            <p className="text-sm flex-1" style={{ color: "var(--text-secondary)" }}>
              {game.blurb}
            </p>
            <PixelButton onClick={() => setPlaying(game)} size="md" variant={game.sandbox ? "accent" : "primary"}>
              <span className="inline-flex items-center justify-center gap-1.5">
                <Play size={13} strokeWidth={3} fill="currentColor" /> {game.sandbox ? "Open" : "Play"}
              </span>
            </PixelButton>
          </div>
        ))}
      </div>

      <p className="text-xs mt-6 text-center" style={{ color: "var(--text-muted)" }}>
        Press Esc to stop a game. The first launch downloads the Python runtime, so give it a moment.
      </p>

      {playing && <GameModal code={playing.code} onClose={() => setPlaying(null)} />}
    </div>
  );
}
