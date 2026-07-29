import { useState } from "react";

export default function Icon({ src, alt, size = 40, className = "", color }) {
  const [errored, setErrored] = useState(false);

  // No placeholder: a missing icon is a bug, not a state to render. tracks.js
  // already throws for any icon name with no file, so reaching here means an
  // Icon was handed a bad src directly. Fail loudly rather than dressing it up
  // as a letter badge that reads like an intentional design.
  if (!src || errored) {
    throw new Error(`Icon received no usable src${alt ? ` (for "${alt}")` : ""}.`);
  }

  if (typeof src === "function") {
    const SvgComponent = src;
    return (
      <div className={`shrink-0 ${className}`} style={{ width: size, height: size, color }}>
        <SvgComponent width="100%" height="100%" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "cover",
      }}
    />
  );
}
