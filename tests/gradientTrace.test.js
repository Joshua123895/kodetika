import { describe, it, expect } from "vitest";
import { buildGradientHarness, gradientTraceToStates, lossAt } from "../src/visualizations/gradientTrace.js";

describe("gradient descent trace", () => {
  it("wraps the program in _run() so module-level loops emit line events", () => {
    const h = buildGradientHarness("w = 0.0\nw = w - 1");
    expect(h).toContain("def _run():");
    expect(h).toContain("        w = 0.0"); // indented into _run
    expect(h).toContain("sys.settrace(_tr)");
    // must NOT filter to a single function: the loop may live inside train()
    expect(h).not.toContain("co_name");
  });

  it("computes mean squared error of y = w*x", () => {
    // xs=[1,2,3], ys=[2,4,6] is exactly y = 2x, so w=2 is a perfect fit
    expect(lossAt([1, 2, 3], [2, 4, 6], 2)).toBeCloseTo(0, 10);
    expect(lossAt([1, 2, 3], [2, 4, 6], 1)).toBeCloseTo(14 / 3, 10);
  });

  it("emits one state per distinct w, collapsing repeated line events", () => {
    const snaps = [
      { xs: [1, 2, 3], ys: [2, 4, 6], w: 0 },
      { w: 0 }, // same w seen again on another line: not a new step
      { w: 0 },
      { w: 1.867 },
      { w: 1.867 },
      { w: 1.991 },
    ];
    const states = gradientTraceToStates(snaps);
    expect(states.map((s) => s.w)).toEqual([0, 1.867, 1.991]);
    expect(states[0].total).toBe(3);
    expect(states[2].step).toBe(2);
  });

  it("loss falls as w approaches the true weight", () => {
    const snaps = [{ xs: [1, 2, 3], ys: [2, 4, 6], w: 0 }, { w: 1 }, { w: 2 }];
    const [a, b, c] = gradientTraceToStates(snaps);
    expect(a.loss).toBeGreaterThan(b.loss);
    expect(b.loss).toBeGreaterThan(c.loss);
    expect(c.loss).toBeCloseTo(0, 10);
  });

  it("accumulates a trail of every point visited so far", () => {
    const snaps = [{ xs: [1, 2], ys: [2, 4], w: 0 }, { w: 1 }, { w: 2 }];
    const states = gradientTraceToStates(snaps);
    expect(states[0].trail).toHaveLength(1);
    expect(states[2].trail.map((p) => p.w)).toEqual([0, 1, 2]);
  });

  it("clamps the domain so a diverging run cannot flatten the curve", () => {
    const snaps = [{ xs: [1, 2, 3], ys: [2, 4, 6], w: 0 }, { w: 1327.5 }];
    const states = gradientTraceToStates(snaps);
    expect(states[1].hi).toBeLessThanOrEqual(8);
    expect(states[1].offCurve).toBe(true); // flagged rather than drawn off-chart
    expect(states[0].offCurve).toBe(false);
  });

  it("returns nothing when the program never exposes xs/ys or w", () => {
    expect(gradientTraceToStates([{ step: 1 }])).toEqual([]);
    expect(gradientTraceToStates([])).toEqual([]);
  });
});
