import { describe, it, expect } from "vitest";
import { buildNetHarness, netTraceToStates } from "../src/visualizations/netTrace.js";
import { buildTreeModelHarness, layoutTree, pathFor, treeModelTraceToStates } from "../src/visualizations/treeModelTrace.js";

describe("neural network trace", () => {
  it("wraps the program in _run() and watches every frame", () => {
    const h = buildNetHarness("w1 = [[1, 2]]");
    expect(h).toContain("def _run():");
    expect(h).toContain("        w1 = [[1, 2]]");
    expect(h).not.toContain("co_name");
  });

  it("carries the last seen value forward across partial snapshots", () => {
    // A line event only exposes names bound in that frame, so `h` often
    // arrives without `w1` alongside it.
    const states = netTraceToStates([
      { w1: [[0.5, -0.4], [-0.3, 0.6]], w2: [0.7, -0.8], b1: [0.1, -0.2], b2: 0.05 },
      { h: [0.6, 0.4], out: 0.51 },
    ]);
    expect(states).toHaveLength(2);
    expect(states[1].w1).toEqual([[0.5, -0.4], [-0.3, 0.6]]); // carried forward
    expect(states[1].h).toEqual([0.6, 0.4]);
  });

  it("reads the network shape from the weights", () => {
    const [s] = netTraceToStates([{ w1: [[1, 2, 3], [4, 5, 6]], w2: [1, 1] }]);
    expect(s.inputCount).toBe(3);
    expect(s.hiddenCount).toBe(2);
  });

  it("reports the error when both output and target are known", () => {
    const states = netTraceToStates([{ w1: [[1, 1]], w2: [1], out: 0.9, target: 1.0 }]);
    expect(states.at(-1).error).toBeCloseTo(-0.1, 10);
  });

  it("downsamples a long training run but keeps the ends", () => {
    const snaps = [{ w1: [[0, 0]], w2: [0] }];
    for (let i = 1; i <= 400; i++) snaps.push({ w2: [i * 0.01] });
    const states = netTraceToStates(snaps);
    expect(states.length).toBeLessThanOrEqual(50);
    expect(states.at(-1).w2[0]).toBeCloseTo(4, 10);
  });


  it("keeps a partially-built activation list, which the renderer must tolerate", () => {
    // `h` is appended one unit at a time, so a snapshot can hold fewer
    // activations than the network has hidden units. This crashed the viz once
    // (h[1].toFixed on undefined); the component now reads h defensively.
    const [s] = netTraceToStates([{ w1: [[0.5, -0.4], [-0.3, 0.6]], w2: [0.7, -0.8], h: [0.6] }]);
    expect(s.hiddenCount).toBe(2);
    expect(s.h).toEqual([0.6]);
    expect(s.h[1]).toBeUndefined();
  });

  it("returns nothing without weights", () => {
    expect(netTraceToStates([{ h: [0.5] }])).toEqual([]);
    expect(netTraceToStates([])).toEqual([]);
  });
});

const TREE = {
  feature: 0,
  threshold: 2.5,
  left: { leaf: 0 },
  right: { feature: 1, threshold: 1.5, left: { leaf: 1 }, right: { leaf: 2 } },
};

describe("decision tree trace", () => {
  it("serializes a nested dict, capped by depth", () => {
    const h = buildTreeModelHarness("tree = {}");
    expect(h).toContain("def _tree(v, depth=0):");
    expect(h).toContain("depth > 8");
  });

  it("lays out every node with a depth and an x position", () => {
    const { nodes, edges, depth } = layoutTree(TREE);
    expect(nodes).toHaveLength(5); // 2 internal + 3 leaves
    expect(edges).toHaveLength(4);
    expect(depth).toBe(2);
  });

  it("follows a sample to its leaf", () => {
    expect(pathFor(TREE, [1.0, 0.0])).toEqual({ path: "L", leaf: 0 });
    expect(pathFor(TREE, [3.0, 1.0])).toEqual({ path: "RL", leaf: 1 });
    expect(pathFor(TREE, [4.0, 2.0])).toEqual({ path: "RR", leaf: 2 });
  });

  it("emits one state per distinct sample walked", () => {
    const states = treeModelTraceToStates([
      { tree: TREE },
      { sample: [1.0, 0.0] },
      { sample: [1.0, 0.0] }, // repeated line event
      { sample: [4.0, 2.0] },
    ]);
    expect(states).toHaveLength(2);
    expect(states[0].leaf).toBe(0);
    expect(states[1].leaf).toBe(2);
    expect(states[1].path).toBe("RR");
  });

  it("still shows the structure when no sample is walked", () => {
    const states = treeModelTraceToStates([{ tree: TREE }]);
    expect(states).toHaveLength(1);
    expect(states[0].sample).toBeNull();
    expect(states[0].layout.nodes).toHaveLength(5);
  });

  it("returns nothing without a tree", () => {
    expect(treeModelTraceToStates([{ sample: [1, 2] }])).toEqual([]);
  });
});
