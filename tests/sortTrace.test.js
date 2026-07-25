import { describe, it, expect } from "vitest";
import { detectSortTarget, buildSortHarness, sortTraceToStates, buildOutOfPlaceHarness, outOfPlaceTraceToStates } from "../src/visualizations/sortTrace.js";

describe("sort trace (real-code execution harness)", () => {
  it("detects the sort function and array from a named-variable driver", () => {
    const code = `def bubble_sort(arr):
    return arr
nums = [5, 2, 9, 1, 5, 6]
print(bubble_sort(nums))`;
    const t = detectSortTarget(code);
    expect(t).toEqual({ fn: "bubble_sort", array: [5, 2, 9, 1, 5, 6] });
  });

  it("detects an inline list-literal call", () => {
    const code = `def selection_sort(arr):
    return arr
print(selection_sort([64, 25, 12, 22, 11]))`;
    const t = detectSortTarget(code);
    expect(t).toEqual({ fn: "selection_sort", array: [64, 25, 12, 22, 11] });
  });

  it("builds a harness that embeds the user code, the array, and the trace print", () => {
    const code = `def bubble_sort(arr):\n    return arr\nnums = [3, 1, 2]\nbubble_sort(nums)`;
    const { harness, array } = buildSortHarness(code);
    expect(array).toEqual([3, 1, 2]);
    expect(harness).toContain("def bubble_sort(arr):");
    expect(harness).toContain("_VL([3,1,2])");
    expect(harness).toContain("@@VIZTRACE@@");
  });

  it("returns null when there is no array to sort", () => {
    expect(buildSortHarness("def bubble_sort(arr):\n    return arr")).toBeNull();
  });

  it("converts a read/write trace into compare + swap frames, ending sorted", () => {
    // Simulated trace for swapping index 0 and 1 of [2, 1]:
    // read 0, read 1 (compare), then two writes (swap) -> [1, 2].
    const trace = [
      [0, 0, [2, 1]],
      [0, 1, [2, 1]],
      [1, 0, [1, 1]],
      [1, 1, [1, 2]],
    ];
    const states = sortTraceToStates(trace, [2, 1]);
    // initial + one compare + one swap
    expect(states.length).toBe(3);
    expect(states[1].highlight).toEqual({ type: "compare", indices: [0, 1] });
    expect(states[2].highlight.type).toBe("swap");
    const finalValues = states[2].items.map((i) => Number(i.value));
    expect(finalValues).toEqual([1, 2]);
  });
});

describe("out-of-place sorts (recursive quick/merge sort)", () => {
  const values = (states) => states.map((s) => s.items.map((i) => i.value).join(","));

  it("traces every user-defined function, not just the entry point", () => {
    const code = `def merge_sort(arr):
    return arr

def merge(a, b):
    return a + b

arr = [3, 1]
print(merge_sort(arr))`;
    const h = buildOutOfPlaceHarness(code);
    expect(h).toContain('"merge_sort"');
    expect(h).toContain('"merge"');
  });

  it("returns null when the code defines no functions", () => {
    expect(buildOutOfPlaceHarness("arr = [3, 1]\nprint(arr)")).toBeNull();
  });

  it("opens on the starting array", () => {
    const states = outOfPlaceTraceToStates([], [5, 2, 9]);
    expect(values(states)).toEqual(["5,2,9"]);
  });

  it("emits a frame each time a list takes a new value", () => {
    const snaps = [
      [["left", [5]]],
      [["left", [5, 2]]],
      [["left", [5, 2, 1]]],
    ];
    expect(values(outOfPlaceTraceToStates(snaps, [5, 2, 1]))).toEqual([
      "5,2,1",
      "5",
      "5,2",
    ]);
  });

  it("highlights the new element when a list grows by one", () => {
    const snaps = [[["left", [5]]], [["left", [5, 2]]]];
    const states = outOfPlaceTraceToStates(snaps, [9]);
    expect(states[2].highlight).toEqual({ type: "write", indices: [1] });
  });

  it("ignores empty working lists", () => {
    const snaps = [[["left", []]], [["left", [7]]]];
    expect(values(outOfPlaceTraceToStates(snaps, [7, 1]))).toEqual(["7,1", "7"]);
  });

  it("does not redraw a list that is already on screen", () => {
    const snaps = [[["a", [5, 2]]], [["b", [5, 2]]]];
    expect(values(outOfPlaceTraceToStates(snaps, [5, 2]))).toEqual(["5,2"]);
  });

  it("collapses the ping-pong when recursion re-exposes a parent's list", () => {
    // merge_sort returning into its caller alternates parent/child locals
    const snaps = [
      [["arr", [5, 2, 9]]],
      [["arr", [5]]],
      [["arr", [5, 2, 9]]],
      [["arr", [5]]],
      [["arr", [2, 9]]],
    ];
    const seen = values(outOfPlaceTraceToStates(snaps, [5, 2, 9, 1]));
    expect(seen).toEqual(["5,2,9,1", "5,2,9", "5", "2,9"]);
  });
});
