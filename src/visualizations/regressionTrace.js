import { traceRun } from "./traceRun";
import { buildGradientHarness, lossAt } from "./gradientTrace";

// Animates a line being fitted to data from the student's REAL executed Python.
// The harness is shared with the gradient-descent viz (it already records w, b,
// xs and ys on every line event); only the interpretation differs: there we
// plot loss against the weight, here we plot the data and the line itself.

export function regressionTraceToStates(snaps) {
  if (!Array.isArray(snaps) || snaps.length === 0) return [];

  let xs = null;
  let ys = null;
  for (const s of snaps) {
    if (Array.isArray(s.xs) && Array.isArray(s.ys) && s.xs.length && s.ys.length) {
      xs = s.xs;
      ys = s.ys;
      break;
    }
  }
  if (!xs || !ys) return [];

  // One state per distinct (w, b). A level that fits only the slope never binds
  // b, so it stays 0 and the line simply passes through the origin.
  const steps = [];
  let lastW = null;
  let lastB = null;
  let b = 0;
  for (const s of snaps) {
    if (Object.prototype.hasOwnProperty.call(s, "b") && Number.isFinite(s.b)) b = s.b;
    if (!Object.prototype.hasOwnProperty.call(s, "w") || !Number.isFinite(s.w)) continue;
    if (lastW !== null && Math.abs(s.w - lastW) < 1e-12 && Math.abs(b - lastB) < 1e-12) continue;
    steps.push({ w: s.w, b });
    lastW = s.w;
    lastB = b;
  }
  if (steps.length === 0) return [];

  // Long training runs record hundreds of near-identical frames. Keep the shape
  // of the fit by sampling evenly, always retaining the first and last.
  const MAX = 60;
  let kept = steps;
  if (steps.length > MAX) {
    kept = [];
    for (let i = 0; i < MAX - 1; i++) {
      kept.push(steps[Math.floor((i * (steps.length - 1)) / (MAX - 1))]);
    }
    kept.push(steps[steps.length - 1]);
  }

  const n = Math.min(xs.length, ys.length);
  const points = [];
  for (let i = 0; i < n; i++) points.push({ x: xs[i], y: ys[i] });

  return kept.map((s, i) => ({
    points,
    w: s.w,
    b: s.b,
    // Residual line for each point, so the error being minimised is visible.
    residuals: points.map((p) => ({ x: p.x, y: p.y, fit: s.w * p.x + s.b })),
    loss: mseWithBias(xs, ys, s.w, s.b),
    step: i,
    total: kept.length,
  }));
}

export function mseWithBias(xs, ys, w, b) {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i] - (w * xs[i] + b);
    total += r * r;
  }
  return total / n;
}

export { lossAt };

export async function runRegressionViz(code) {
  const snaps = await traceRun(buildGradientHarness(code));
  return regressionTraceToStates(snaps);
}
