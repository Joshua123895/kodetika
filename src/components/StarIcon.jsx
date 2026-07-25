import { Star } from "lucide-react";

export default function StarIcon({ filled = false, className = "" }) {
  return (
    <span
      className={`star-container inline-flex items-center justify-center relative ${className}`}
      aria-hidden
    >
      {/* Sized in em so callers keep controlling it with a text-* class, the
          way they did when this was a ★ glyph. Colour comes from .star-base. */}
      <span className={`star-base inline-flex ${filled ? "star-filled" : ""}`}>
        <Star size="1em" strokeWidth={2.5} fill="currentColor" />
      </span>
    </span>
  );
}
