import { useEffect, useMemo, useRef } from "react";
import { Gamepad2, X } from "lucide-react";
import { buildGameHTML } from "./runGame";

// In-page modal that runs the pygame POC inside an isolated <iframe>. Unmounting
// the iframe (any close path) tears down its Pyodide instance and the async game
// loop, so closing the modal is a clean, reliable stop. Mirrors the Quest
// Complete modal overlay pattern used in LevelPage.
export default function GameModal({ code, onClose }) {
  const iframeRef = useRef(null);

  // Build the document once per open so editing code + re-running gives a fresh
  // runtime (the modal is remounted by LevelPage each time it opens).
  const srcDoc = useMemo(() => buildGameHTML(code), [code]);

  useEffect(() => {
    // Close on Esc, and on the 'game-stop' message the iframe posts when Esc is
    // pressed while the game itself holds focus.
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const onMessage = (e) => {
      if (e.data === "game-stop") onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    // Focus the iframe so keyboard controls reach the game right away.
    const id = setTimeout(() => iframeRef.current?.focus(), 100);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMessage);
      clearTimeout(id);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />
      <div
        className="relative rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "var(--bg)",
          border: "3px solid #6AAE6F",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          width: "min(500px, 94vw)",
          maxHeight: "90vh",
        }}
      >
        <div
          className="flex items-center gap-3 px-4 py-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-sm font-bold" style={{ color: "var(--text)" }}>
            <span className="inline-flex items-center gap-2"><Gamepad2 size={16} strokeWidth={2.5} /> Game</span>
          </span>
          <span className="text-xs hidden sm:inline" style={{ color: "var(--text-muted)" }}>
            click the game to use the keyboard
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-sm font-bold px-2 py-0.5 rounded hover:brightness-110"
            style={{ background: "#FF5F57", color: "#fff" }}
            aria-label="Close game"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        <iframe
          ref={iframeRef}
          title="Game"
          srcDoc={srcDoc}
          tabIndex={0}
          className="block"
          style={{ width: "100%", height: "min(400px, 72vh)", border: "none", background: "#14141c" }}
        />
      </div>
    </div>
  );
}
