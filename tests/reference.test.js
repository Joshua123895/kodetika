import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { load } from "js-yaml";
import { buildReference, filterTopic, topicCount } from "../src/lib/referenceModel.js";

// The real corpus, read the node way: the ?raw import in src/data/reference.js
// is Vite-only, which is exactly why the model takes parsed data as an argument.
const data = load(readFileSync("src/data/reference.yaml", "utf8"));
const { topics, guides } = buildReference(data);

describe("the reference corpus", () => {
  it("carries the five languages and the guides", () => {
    expect(topics.map((t) => t.slug)).toEqual(["python", "javascript", "sql", "html", "css"]);
    expect(guides.length).toBeGreaterThanOrEqual(4);
  });

  it("every entry is whole: a signature, prose, and search text", () => {
    for (const t of topics) {
      for (const g of t.groups) {
        for (const e of g.entries) {
          expect(e.sig.length).toBeGreaterThan(0);
          expect(e.descBlocks[0].segments.length).toBeGreaterThan(0);
          expect(e._text.length).toBeGreaterThan(10);
        }
      }
    }
  });

  it("holds enough entries to be worth opening", () => {
    const total = topics.reduce((n, t) => n + topicCount(t), 0);
    expect(total).toBeGreaterThanOrEqual(120);
  });

  it("keeps the no-em-dash rule", () => {
    const raw = readFileSync("src/data/reference.yaml", "utf8");
    expect(raw.includes("—")).toBe(false);
  });

  it("every guide parses into rendered blocks", () => {
    for (const g of guides) {
      // A guide of one list and one closing paragraph is 2 blocks and fine.
      expect(g.blocks.length).toBeGreaterThanOrEqual(2);
      expect(g.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe("buildReference shaping", () => {
  const one = buildReference({
    topics: [
      {
        slug: "t",
        name: "T",
        groups: [
          { name: "G", entries: [{ sig: "f(x)", desc: "Calls `f` on x.", ex: "f(1)" }, { sig: "g()", desc: "No example here." }] },
        ],
      },
    ],
    guides: [{ slug: "s", name: "S", blurb: "b", body: "One line.\n\n1. step" }],
  });

  it("turns a desc into a paragraph with code segments", () => {
    const e = one.topics[0].groups[0].entries[0];
    expect(e.descBlocks).toHaveLength(1);
    expect(e.descBlocks[0].segments.some((s) => s.type === "code" && s.value === "f")).toBe(true);
  });

  it("turns an example into a code block, and tolerates having none", () => {
    const [withEx, without] = one.topics[0].groups[0].entries;
    expect(withEx.exBlocks).toEqual([{ type: "codeblock", value: "f(1)" }]);
    expect(without.exBlocks).toBeNull();
  });
});

describe("filterTopic", () => {
  const python = topics.find((t) => t.slug === "python");

  it("finds an entry by its signature", () => {
    const hit = filterTopic(python, "append");
    expect(topicCount(hit)).toBeGreaterThanOrEqual(1);
    expect(hit.groups[0].entries.some((e) => e.sig.includes("append"))).toBe(true);
  });

  it("finds an entry by its prose", () => {
    const hit = filterTopic(python, "remainder");
    expect(topicCount(hit)).toBeGreaterThanOrEqual(1);
  });

  it("drops groups that lose every entry", () => {
    const hit = filterTopic(python, "append");
    expect(hit.groups.every((g) => g.entries.length > 0)).toBe(true);
  });

  it("returns the topic untouched for a blank query", () => {
    expect(filterTopic(python, " ")).toBe(python);
  });
});
