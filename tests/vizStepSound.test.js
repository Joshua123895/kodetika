import { describe, it, expect } from "vitest";
import { classifyStep, classifyStepSounds, countItems } from "../src/visualizations/vizStepSound.js";

// Shapes below mirror what the real vizzes build, so the policy is tested
// against the data it actually sees rather than an idealised model.
const stackState = (vals) => ({ s: vals.map((v, i) => ({ val: String(v), _id: i })) });

describe("countItems", () => {
  it("counts item-like objects in a structural snapshot", () => {
    expect(countItems(stackState([1, 2, 3]))).toBe(3);
  });

  it("ignores bookkeeping arrays of plain numbers", () => {
    // A search state: activeRange/found must not read as items.
    const a = { arr: [5, 8, 9], activeRange: [0, 2], found: null, status: "Checking" };
    const b = { arr: [5, 8, 9], activeRange: null, found: [1], status: "Checking" };
    expect(countItems(a)).toBe(0);
    expect(countItems(b)).toBe(0);
  });

  it("counts nested tree nodes", () => {
    const tree = {
      name: "root",
      val: "5",
      left: { name: "a", val: "3", left: null, right: null },
      right: { name: "b", val: "8", left: null, right: null },
    };
    expect(countItems(tree)).toBe(3);
  });

  it("does not blow up on cyclic structures", () => {
    const node = { val: "1" };
    node.self = node;
    expect(countItems(node)).toBe(1);
  });
});

describe("classifyStep — ordinary moves tick", () => {
  it("ticks on a sort swap where nothing is added or removed", () => {
    const states = [
      { array: [3, 1, 2], i: 0 },
      { array: [1, 3, 2], i: 1 },
      { array: [1, 2, 3], i: 2 },
    ];
    // last frame resolves as complete; the middle move is a plain tick
    expect(classifyStepSounds(states)).toEqual(["tick", "tick", "complete"]);
  });

  it("ticks when an item is added (push/append)", () => {
    const states = [stackState([]), stackState([1]), stackState([1, 2]), stackState([1, 2, 3])];
    expect(classifyStep(states, 1)).toBe("tick");
    expect(classifyStep(states, 2)).toBe("tick");
  });
});

describe("classifyStep — deletions fail", () => {
  it("fails on a stack pop", () => {
    const states = [stackState([1, 2, 3]), stackState([1, 2]), stackState([1, 2, 9])];
    expect(classifyStep(states, 1)).toBe("fail");
  });

  it("fails on a queue dequeue", () => {
    const states = [
      { q: [{ val: "a", _id: 0 }, { val: "b", _id: 1 }] },
      { q: [{ val: "b", _id: 1 }] },
      { q: [{ val: "b", _id: 1 }, { val: "c", _id: 2 }] },
    ];
    expect(classifyStep(states, 1)).toBe("fail");
  });

  it("fails on a tree node deletion", () => {
    const withChild = {
      name: "root",
      val: "5",
      left: { name: "a", val: "3", left: null, right: null },
      right: null,
    };
    const withoutChild = { name: "root", val: "5", left: null, right: null };
    const states = [withChild, withoutChild, withChild];
    expect(classifyStep(states, 1)).toBe("fail");
  });
});

describe("classifyStep — negative outcomes fail", () => {
  it("fails on a search that ends 'Not found'", () => {
    const states = [
      { arr: [1, 2], status: "Checking index 0" },
      { arr: [1, 2], status: "Not found", found: null },
    ];
    expect(classifyStepSounds(states)).toEqual(["tick", "fail"]);
  });

  it("fails on hash map 'No pair found' and does not read it as a find", () => {
    const states = [{ status: "Checking" }, { status: "No pair found" }];
    expect(classifyStep(states, 1)).toBe("fail");
  });

  it("fails on 'No result'", () => {
    const states = [{ status: "Scanning" }, { status: "No result", found: null }];
    expect(classifyStep(states, 1)).toBe("fail");
  });
});

describe("classifyStep — finds and finishes complete", () => {
  it("completes on a mid-run find", () => {
    const states = [
      { status: "Checking index 0" },
      { status: "Found 8 at index 1", found: [1] },
      { status: "Returning" },
      { status: "Done" },
    ];
    expect(classifyStep(states, 1)).toBe("complete");
  });

  it("completes on the final frame even with no status at all", () => {
    const states = [stackState([1]), stackState([1, 2])];
    expect(classifyStep(states, 1)).toBe("complete");
  });

  it("completes on a sorted status", () => {
    const states = [{ status: "Comparing" }, { status: "Array sorted" }, { status: "Idle" }];
    expect(classifyStep(states, 1)).toBe("complete");
  });

  it("lets an explicit failure win over the final frame", () => {
    const states = [{ status: "Checking" }, { status: "Not found" }];
    expect(classifyStep(states, 1)).toBe("fail");
  });
});

describe("classifyStep — finds detected via the `found` field", () => {
  it("completes on the step where found first becomes non-empty", () => {
    const states = [
      { items: [], found: [], status: null },
      { items: [], found: [], status: null },
      { items: [], found: [2], status: "Found at index 2" },
      { items: [], found: [], status: null },
      { items: [], found: [], status: null },
    ];
    expect(classifyStepSounds(states)).toEqual(["tick", "tick", "complete", "tick", "complete"]);
  });

  it("sounds once when a find stays highlighted across several frames", () => {
    const states = [
      { found: [] },
      { found: [3] },
      { found: [3] },
      { found: [3] },
      { found: [] },
    ];
    expect(classifyStepSounds(states)).toEqual(["tick", "complete", "tick", "tick", "complete"]);
  });

  it("sounds again when a later step finds a different index", () => {
    const states = [{ found: [] }, { found: [1] }, { found: [4] }, { found: [] }];
    expect(classifyStep(states, 1)).toBe("complete");
    expect(classifyStep(states, 2)).toBe("complete");
  });

  it("does not treat an empty found array as a find", () => {
    const states = [{ found: [] }, { found: [] }, { found: [] }];
    expect(classifyStep(states, 1)).toBe("tick");
  });
});

describe("classifyStep — edges", () => {
  it("returns tick for out-of-range or non-array input", () => {
    expect(classifyStep([], 0)).toBe("tick");
    expect(classifyStep(null, 0)).toBe("tick");
    expect(classifyStep([{ status: "x" }], -1)).toBe("tick");
    expect(classifyStep([{ status: "x" }], 5)).toBe("tick");
  });

  it("classifies a single-state run as complete", () => {
    expect(classifyStepSounds([stackState([1])])).toEqual(["complete"]);
  });

  it("returns an empty list for no states", () => {
    expect(classifyStepSounds([])).toEqual([]);
    expect(classifyStepSounds(undefined)).toEqual([]);
  });
});
