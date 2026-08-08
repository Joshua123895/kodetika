import { describe, it, expect } from "vitest";
import { auditLevels, countLines, submittedSource, slackFor } from "./starBudgets.audit.js";

// The "≤ N lines" star must be earnable. 77 levels once shipped a budget smaller
// than their own official solution, which made the second star unreachable by
// anyone — a perfect answer still scored 2 of 3. This locks that shut: a new
// level whose `max:` is tighter than its `sol` fails CI instead of shipping.
//
// Pure JS, no Python — it compares two numbers that both come out of the YAML.

const rows = auditLevels();

describe("star line budgets", () => {
  it("audits the whole corpus", () => {
    expect(rows.length).toBeGreaterThan(400);
  });

  it("is reachable by the level's own solution on every level", () => {
    const broken = rows
      .filter((r) => r.margin < 0)
      .sort((a, b) => a.margin - b.margin)
      .map(
        (r) =>
          `${r.track} :: ${r.name} — budget ${r.budget} lines, solution needs ${r.needed}` +
          ` (raise it to ${r.needed + slackFor(r.needed)}/…)`
      );

    const message = broken.length
      ? `${broken.length} level(s) cannot be 3-starred:\n${broken.join("\n")}\n\n` +
        "Run `node scripts/star-budgets.mjs --fix` to repair them."
      : "";

    expect(message).toBe("");
  });
});

describe("the measurement the budget is graded against", () => {
  // Mirrors LevelPage.jsx: blank lines are free, so a budget is about real code.
  it("counts non-empty lines only", () => {
    expect(countLines("a = 1\n\n   \nprint(a)\n")).toBe(2);
    expect(countLines("a = 1\r\n\r\nprint(a)")).toBe(2);
  });

  it("keeps the starter for prelude tracks, since it stays in the editor", () => {
    const src = submittedSource("data-structures", {
      start: "class Node:\n    pass",
      sol: "n = Node()\nprint(n)",
    });
    expect(countLines(src)).toBe(4);
  });

  // The trap: many prelude levels' `sol` already repeats the starter verbatim,
  // so concatenating counts the same class twice and invents broken budgets.
  it("does not double-count a solution that already repeats the starter", () => {
    const src = submittedSource("data-structures", {
      start: "class Node:\n    pass",
      sol: "class Node:\n    pass\n\nprint(Node())",
    });
    expect(countLines(src)).toBe(3);
  });

  it("ignores the starter on tracks whose solutions are whole programs", () => {
    expect(submittedSource("python", { start: "IGNORED", sol: "print(1)" })).toBe("print(1)");
  });
});
