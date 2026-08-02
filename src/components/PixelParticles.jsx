import { useState } from "react";

const particleColors = [
  "#6AAE6F",
  "#82bb8a",
  "#9DBEF2",
  "#DDBA73",
  "#BEA3D8",
];

// Scatters `count` particles over a grid, one jittered inside each cell so they
// never clump. Lives outside the component because it is not pure — see below.
function rollParticles() {
  // Halve the animated-element load on phones, 36 infinitely-floating divs is
  // wasteful on a small screen where most of them fall off-canvas anyway.
  const count = typeof window !== "undefined" && window.innerWidth < 640 ? 18 : 36;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellWidth = 100 / cols;
  const cellHeight = 100 / rows;

  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (i % cols) * cellWidth + cellWidth * (0.1 + Math.random() * 0.8),
    y: Math.floor(i / cols) * cellHeight + cellHeight * (0.1 + Math.random() * 0.8),
    size: 6 + Math.random() * 8,
    delay: Math.random() * 4,
    duration: 4 + Math.random() * 3,
    color: particleColors[Math.floor(Math.random() * particleColors.length)],
    opacity: 0.08 + Math.random() * 0.12,
  }));
}

export default function PixelParticles() {
  // Rolled once per mount via a lazy initialiser, which is the sanctioned place
  // for randomness. Rolling in the render body made every particle jump to a new
  // spot whenever anything above this component re-rendered.
  const [particles] = useState(rollParticles);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-sm pixel-float"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            background: p.color,
            opacity: p.opacity,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
