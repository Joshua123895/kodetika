import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import RichText from "./RichText";
import { companionHint } from "../lib/companion";
import touchSound from "../assets/sounds/touch.mp3";
import touchWrongSound from "../assets/sounds/touch_wrong.mp3";

// One context and one decoded buffer per sound for the whole app, at module
// scope rather than per mount. The companion remounts on every level change,
// and a browser caps how many AudioContexts a page may open, so a fresh one
// each time would eventually stop producing sound with no error to explain it.
// LevelPage owns a second one for the grading sounds; two is fine, dozens is
// not.
let audioCtx = null;
const buffers = { touch: null, wrong: null };

function warmTouch() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Decoded ahead of the first click so the sound lands with the tap rather
    // than a beat after it. A failure here just means silence.
    for (const [name, url] of [["touch", touchSound], ["wrong", touchWrongSound]]) {
      fetch(url)
        .then((res) => res.arrayBuffer())
        .then((data) => audioCtx.decodeAudioData(data))
        .then((buf) => { buffers[name] = buf; })
        .catch(() => {});
    }
  } catch {
    audioCtx = null;
  }
}

/** `sad` picks the unhappy variant, so the sound agrees with the face. */
function playTouch(sad) {
  const buffer = sad ? buffers.wrong : buffers.touch;
  if (!audioCtx || !buffer) return;
  try {
    // Created before any user gesture, so it starts suspended and has to be
    // resumed from inside the click that wants to make noise.
    if (audioCtx.state === "suspended") audioCtx.resume();
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
  } catch {
    // Sound is decoration here. Nothing about the hint depends on it.
  }
}

// A small character that sits in the corner of a level and, when clicked, says
// the most useful thing it can about the code currently in the editor. The
// thinking lives in src/lib/companion.js; this file is the face and the bubble.

// What the face does for each thing it can say. Expression is the cheapest way
// to make a hint land before the sentence is even read: a worried face over a
// syntax error says "you broke something" faster than the words do.
const MOODS = {
  ready: "happy",
  syntax: "worried",
  missing: "worried",
  forbidden: "worried",
  blank: "curious",
  authored: "curious",
  stuck: "curious",
  idle: "neutral",
};

// Chibi proportions: head about half the total height, eyes low and wide apart.
// Drawn rather than shipped as an image so it inherits the palette, stays sharp
// at any size, and adds nothing to the bundle beyond this markup.
//
// Motion is SVG SMIL rather than CSS keyframes because every moving part here
// is an attribute rather than a transform, and `repeatCount="indefinite"` on
// the element itself keeps the timing with the shape it belongs to. The blink
// used to list three fixed `begin` times, which meant it blinked three times
// after mount and then stared forever.
function ChibiFace({ mood, talking }) {
  const happy = mood === "happy";
  const worried = mood === "worried";

  return (
    <svg viewBox="0 0 64 70" width="100%" height="100%" aria-hidden="true">
      {/* antenna, so the silhouette reads as a helper rather than a plain blob */}
      <line x1="32" y1="10" x2="32" y2="3" stroke="#4a8f4f" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="3" r="3" fill={worried ? "#FF5F57" : "#E9B44C"}>
        <animate attributeName="r" values="3;3.9;3" dur={worried ? "0.7s" : "2.4s"} repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.55;1" dur={worried ? "0.7s" : "2.4s"} repeatCount="indefinite" />
      </circle>

      {/* body first, so the head overlaps it the way a chibi's should */}
      <rect x="17" y="44" width="30" height="22" rx="10" fill="#4a8f4f" />
      {/* arms give a small counter-sway, which reads as breathing */}
      <rect x="9" y="48" width="9" height="15" rx="4.5" fill="#4a8f4f">
        <animateTransform attributeName="transform" type="rotate" values="0 13 50;-7 13 50;0 13 50" dur="3.2s" repeatCount="indefinite" />
      </rect>
      <rect x="46" y="48" width="9" height="15" rx="4.5" fill="#4a8f4f">
        <animateTransform attributeName="transform" type="rotate" values="0 51 50;7 51 50;0 51 50" dur="3.2s" repeatCount="indefinite" />
      </rect>

      {/* head, with a gentle tilt so the whole thing is never quite still */}
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          values={worried ? "-3 32 34;3 32 34;-3 32 34" : "-1.6 32 34;1.6 32 34;-1.6 32 34"}
          dur={worried ? "1.1s" : "4.6s"}
          repeatCount="indefinite"
        />
        <rect x="6" y="9" width="52" height="42" rx="16" fill="#6AAE6F" />
        {/* screen-like faceplate, a nod to the logo's terminal */}
        <rect x="12" y="15" width="40" height="28" rx="10" fill="#1e2b22" />

        {happy ? (
          // Closed, arced eyes. The classic chibi "^ ^", and unmistakable at
          // this size in a way a subtler smile is not.
          <g stroke="#EAF3EA" strokeWidth="2.2" fill="none" strokeLinecap="round">
            <path d="M20 29.5 Q24 24.5 28 29.5" />
            <path d="M36 29.5 Q40 24.5 44 29.5" />
          </g>
        ) : (
          <>
            <g fill="#EAF3EA">
              <ellipse cx="24" cy="28" rx="4.6" ry="4.8">
                <animate attributeName="ry" values="4.8;4.8;0.4;4.8" keyTimes="0;0.92;0.96;1" dur="5.1s" repeatCount="indefinite" />
              </ellipse>
              <ellipse cx="40" cy="28" rx="4.6" ry="4.8">
                <animate attributeName="ry" values="4.8;4.8;0.4;4.8" keyTimes="0;0.92;0.96;1" dur="5.1s" repeatCount="indefinite" />
              </ellipse>
            </g>
            {/* catchlights: the cheapest thing that makes eyes look alive. They
                track the blink, so they vanish while the lids are shut. */}
            <g fill="#fff">
              <circle cx="25.8" cy="26.2" r="1.5">
                <animate attributeName="r" values="1.5;1.5;0;1.5" keyTimes="0;0.92;0.96;1" dur="5.1s" repeatCount="indefinite" />
              </circle>
              <circle cx="41.8" cy="26.2" r="1.5">
                <animate attributeName="r" values="1.5;1.5;0;1.5" keyTimes="0;0.92;0.96;1" dur="5.1s" repeatCount="indefinite" />
              </circle>
            </g>
          </>
        )}

        {talking ? (
          // A mouth that actually moves while the bubble is open, so the
          // character reads as the one speaking.
          <ellipse cx="32" cy="37" rx="3.4" ry="2.6" fill="#EAF3EA">
            <animate attributeName="ry" values="2.6;1.1;3.1;1.4;2.6" dur="0.62s" repeatCount="indefinite" />
          </ellipse>
        ) : worried ? (
          <path d="M28.5 38.4 Q32 35.6 35.5 38.4" stroke="#EAF3EA" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M28.5 36.5 Q32 39.4 35.5 36.5" stroke="#EAF3EA" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        )}

        <circle cx="16.5" cy="34" r="2.6" fill="#E9B44C" opacity={happy ? 0.75 : 0.5} />
        <circle cx="47.5" cy="34" r="2.6" fill="#E9B44C" opacity={happy ? 0.75 : 0.5} />
      </g>
    </svg>
  );
}

export default function Companion({ level, code, tone }) {
  const [open, setOpen] = useState(false);
  // Bumped on every ask so the character can react to being poked even when the
  // sentence it gives back is the same one as last time.
  const [nudge, setNudge] = useState(0);
  // How many times it has been asked without the code changing. Any edit resets
  // it, so the ladder restarts from whatever is now true rather than continuing
  // through hints written for a situation the student has already left.
  const [step, setStep] = useState(0);
  const lastCode = useRef(code);

  useEffect(() => { warmTouch(); }, []);

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

  const hint = companionHint({ level, code, step, tone });
  const mood = MOODS[hint.kind] ?? "neutral";

  const ask = () => {
    // The sound has to match the face the click is about to produce, not the
    // one still on screen. Opening shows the current step; clicking while open
    // advances to the next, so work out which hint is actually coming and take
    // the mood from that.
    const nextStep = open ? step + 1 : step;
    const next = nextStep === step ? hint : companionHint({ level, code, step: nextStep, tone });
    playTouch(MOODS[next.kind] === "worried");

    if (open) setStep(nextStep);
    else setOpen(true);
    setNudge((n) => n + 1);
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
            {hint.more}
          </p>
        </div>
      )}

      <button
        onClick={ask}
        aria-label={open ? "Another hint" : "Ask for a hint"}
        title={open ? "Tell me more" : "Stuck? Ask me"}
        className="companion-bob rounded-full"
        style={{ width: 62, height: 68, lineHeight: 0 }}
      >
        {/* Keyed on the ask count so the squash restarts on every click. Without
            the key React reuses the element and the animation, having already
            run, never plays again. */}
        <span key={nudge} className="companion-pop block w-full h-full">
          <ChibiFace mood={mood} talking={open} />
        </span>
      </button>
    </div>
  );
}
