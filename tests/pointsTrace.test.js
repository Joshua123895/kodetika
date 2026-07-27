import { describe, it, expect } from "vitest";
import { buildPointsHarness, assignPoints, kmeansTraceToStates, knnTraceToStates } from "../src/visualizations/pointsTrace.js";

describe("points harness", () => {
  it("wraps the program in _run() and watches every frame", () => {
    const h = buildPointsHarness("points = [[1, 2]]");
    expect(h).toContain("def _run():");
    expect(h).toContain("        points = [[1, 2]]");
    expect(h).not.toContain("co_name"); // no single-function filter
  });

  it("serializes coordinate pairs as well as flat numeric lists", () => {
    const h = buildPointsHarness("x = 1");
    expect(h).toContain("2 <= len(x) <= 4"); // pair branch
    expect(h).toContain("all(_num(x) for x in items)"); // flat branch
  });
});

describe("k-means states", () => {
  const points = [[1, 1], [1.5, 2], [5, 5], [5.5, 4.8]];

  it("assigns each point to its closest centroid", () => {
    expect(assignPoints(points, [[1, 1], [5, 5]])).toEqual([0, 0, 1, 1]);
  });

  it("emits one state per distinct centroid configuration", () => {
    const states = kmeansTraceToStates([
      { points, centroids: [[0, 0], [3, 3]] },
      { centroids: [[0, 0], [3, 3]] }, // repeated line event
      { centroids: [[1.25, 1.5], [5.25, 4.9]] },
    ]);
    expect(states).toHaveLength(2);
    expect(states[1].centroids).toEqual([[1.25, 1.5], [5.25, 4.9]]);
    expect(states[1].total).toBe(2);
  });

  it("derives the grouping rather than requiring the student to store it", () => {
    const [s] = kmeansTraceToStates([{ points, centroids: [[1, 1], [5, 5]] }]);
    expect(s.assign).toEqual([0, 0, 1, 1]);
  });

  it("returns nothing without points or centroids", () => {
    expect(kmeansTraceToStates([{ centroids: [[0, 0]] }])).toEqual([]);
    expect(kmeansTraceToStates([{ points }])).toEqual([]);
  });
});

describe("k-NN states", () => {
  const points = [[1, 1], [1.5, 2], [5, 5], [6, 5.5], [1.2, 0.8]];
  const labels = [0, 0, 1, 1, 0];
  const snaps = [{ points, labels, query: [1.4, 1.4], k: 3 }];

  it("reveals one distance per step and adds a final decision frame", () => {
    const states = knnTraceToStates(snaps);
    expect(states).toHaveLength(points.length + 1);
    expect(states[0].revealed).toBe(1);
    expect(states[4].revealed).toBe(5);
    expect(states[5].nearest).toHaveLength(3);
  });

  it("picks the k closest points and votes on their labels", () => {
    const final = knnTraceToStates(snaps).at(-1);
    // the three nearest are all label 0, so class 0 wins
    expect(final.nearest.every((i) => labels[i] === 0)).toBe(true);
    expect(final.winner).toBe("0");
  });

  it("clamps k to the number of available points", () => {
    const final = knnTraceToStates([{ points: [[0, 0], [1, 1]], labels: [0, 1], query: [0.1, 0.1], k: 99 }]).at(-1);
    expect(final.k).toBe(2);
    expect(final.nearest).toHaveLength(2);
  });

  it("returns nothing without points or a query", () => {
    expect(knnTraceToStates([{ points }])).toEqual([]);
    expect(knnTraceToStates([{ query: [1, 1] }])).toEqual([]);
  });
});
