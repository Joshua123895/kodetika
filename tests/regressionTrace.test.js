import { describe, it, expect } from "vitest";
import { regressionTraceToStates, mseWithBias } from "../src/visualizations/regressionTrace.js";

const DATA = { xs: [1, 2, 3, 4], ys: [3, 5, 7, 9] }; // y = 2x + 1

describe("regression fit trace", () => {
  it("scores a fit by mean squared error including the bias", () => {
    expect(mseWithBias(DATA.xs, DATA.ys, 2, 1)).toBeCloseTo(0, 10); // exact fit
    expect(mseWithBias(DATA.xs, DATA.ys, 2, 0)).toBeCloseTo(1, 10); // off by 1 everywhere
  });

  it("emits one state per distinct (w, b) pair", () => {
    const states = regressionTraceToStates([
      { ...DATA, w: 0, b: 0 },
      { w: 0, b: 0 }, // repeated line event, not a new step
      { w: 1, b: 0.5 },
      { w: 2, b: 1 },
    ]);
    expect(states.map((s) => [s.w, s.b])).toEqual([[0, 0], [1, 0.5], [2, 1]]);
  });

  it("treats a never-assigned bias as zero so slope-only levels still plot", () => {
    const states = regressionTraceToStates([{ xs: [1, 2], ys: [2, 4], w: 0 }, { w: 2 }]);
    expect(states).toHaveLength(2);
    expect(states[1].b).toBe(0);
    expect(states[1].loss).toBeCloseTo(0, 10); // y = 2x fits exactly
  });

  it("carries the data points and a residual per point", () => {
    const [s] = regressionTraceToStates([{ ...DATA, w: 0, b: 0 }]);
    expect(s.points).toHaveLength(4);
    expect(s.residuals).toHaveLength(4);
    expect(s.residuals[0]).toMatchObject({ x: 1, y: 3, fit: 0 });
  });

  it("loss decreases as the line approaches the true parameters", () => {
    const states = regressionTraceToStates([
      { ...DATA, w: 0, b: 0 },
      { w: 1, b: 0.5 },
      { w: 2, b: 1 },
    ]);
    expect(states[0].loss).toBeGreaterThan(states[1].loss);
    expect(states[1].loss).toBeGreaterThan(states[2].loss);
  });

  it("downsamples a long run but keeps the first and last fit", () => {
    const snaps = [{ ...DATA, w: 0, b: 0 }];
    for (let i = 1; i <= 500; i++) snaps.push({ w: i * 0.001, b: 0 });
    const states = regressionTraceToStates(snaps);
    expect(states.length).toBeLessThanOrEqual(60);
    expect(states[0].w).toBe(0);
    expect(states[states.length - 1].w).toBeCloseTo(0.5, 10);
  });

  it("returns nothing without data or without a weight", () => {
    expect(regressionTraceToStates([{ w: 1 }])).toEqual([]);
    expect(regressionTraceToStates([{ ...DATA }])).toEqual([]);
    expect(regressionTraceToStates([])).toEqual([]);
  });
});
