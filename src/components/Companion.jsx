import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import RichText from "./RichText";
import { companionHint } from "../lib/companion";

// A small character that sits in the corner of a level and, when clicked, says
// the most useful thing it can about the code currently in the editor. The
// thinking lives in src/lib/companion.js; this file is the face and the bubble.

// Chibi proportions: head about half the total height, eyes low and wide apart.
// Drawn rather than shipped as an image so it inherits the palette, stays sharp
// at any size, and adds nothing to the bundle beyond this markup.
function ChibiFace({ talking }) {
  return (
    <svg viewBox="0 0 64 70" width="100%" height="100%" aria-hidden="true">
      {/* antenna, so the silhouette reads as a helper rather than a plain blob */}
      <line x1="32" y1="10" x2="32" y2="3" stroke="#4a8f4f" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="3" r="3" fill="#E9B44C" />

      {/* body first, so the head overlaps it the way a chibi's should */}
      <rect x="17" y="44" width="30" height="22" rx="10" fill="#4a8f4f" />
      <rect x="9" y="48" width="9" height="15" rx="4.5" fill="#4a8f4f" />
      <rect x="46" y="48" width="9" height="15" rx="4.5" fill="#4a8f4f" />

      {/* head */}
      <rect x="6" y="9" width="52" height="42" rx="16" fill="#6AAE6F" />
      {/* screen-like faceplate, a nod to the logo's terminal */}
      <rect x="12" y="15" width="40" height="28" rx="10" fill="#1e2b22" />

      <g fill="#EAF3EA">
        <ellipse cx="24" cy="28" rx="4.6" ry={talking ? 5.4 : 4.8}>
          <animate attributeName="ry" values="4.8;0.5;4.8" dur="0.18s" begin="4s;8.4s;15s" />
        </ellipse>
        <ellipse cx="40" cy="28" rx="4.6" ry={talking ? 5.4 : 4.8}>
          <animate attributeName="ry" values="4.8;0.5;4.8" dur="0.18s" begin="4s;8.4s;15s" />
        </ellipse>
      </g>
      {/* catchlights: the single cheapest thing that makes eyes look alive */}
      <circle cx="25.8" cy="26.2" r="1.5" fill="#fff" />
      <circle cx="41.8" cy="26.2" r="1.5" fill="#fff" />

      {talking ? (
        <ellipse cx="32" cy="37" rx="3.4" ry="2.6" fill="#EAF3EA" />
      ) : (
        <path d="M28.5 36.5 Q32 39.4 35.5 36.5" stroke="#EAF3EA" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      )}

      <circle cx="16.5" cy="34" r="2.6" fill="#E9B44C" opacity="0.5" />
      <circle cx="47.5" cy="34" r="2.6" fill="#E9B44C" opacity="0.5" />
    </svg>
  );
}

export default function Companion({ level, code }) {
  const [open, setOpen] = useState(false);
  // How many times it has been asked without the code changing. Any edit resets
  // it, so the ladder restarts from whatever is now true rather than continuing
  // through hints written for a situation the student has already left.
  const [step, setStep] = useState(0);
  const lastCode = useRef(code);

  useEffect(() => {
    if (code !== lastCode.current) {
      lastCode.current = code;
      setStep(0);
    }
  }, [code]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const hint = companionHint({ level, code, step });

  const ask = () => {
    if (open) setStep((s) => s + 1);
    else setOpen(true);
  };

  return (
    <div className="fixed z-40 flex flex-col items-end gap-2" style={{ right: 18, bottom: 18 }}>
      {open && (
        <div
          role="status"
          className="relative rounded-2xl px-4 py-3 text-sm shadow-lg"
          style={{
            maxWidth: "min(320px, calc(100vw - 3rem))",
            background: "var(--bg-card)",
            border: "2px solid var(--border-strong)",
            color: "var(--text)",
          }}
        >
          <button
            onClick={() => setOpen(false)}
            aria-label="Close hint"
            className="absolute top-1.5 right-1.5 rounded p-0.5 hover:brightness-125"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={13} strokeWidth={2.5} />
          </button>

          <div className="pr-4 leading-relaxed">
            {hint.rich ? <RichText blocks={hint.rich} /> : hint.text}
          </div>

          <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
            {hint.kind === "ready" || hint.kind === "stuck"
              ? "That is all I have got on this one."
              : "Poke me again if you want more."}
          </p>
        </div>
      )}

      <button
        onClick={ask}
        aria-label={open ? "Another hint" : "Ask for a hint"}
        title={open ? "Tell me more" : "Stuck? Ask me"}
        className="companion-bob rounded-full transition-transform hover:scale-105 active:scale-95"
        style={{ width: 62, height: 68, lineHeight: 0 }}
      >
        <ChibiFace talking={open} />
      </button>
    </div>
  );
}
