import { describe, it, expect } from "vitest";
import { TRACKS } from "../src/data/tracks.js";
import { buildHandbook, blocksToText, filterHandbook } from "../src/lib/handbook.js";
import { parseRichText } from "../src/data/richText.js";

// Real parsed blocks, never hand-faked shapes: the same rule the companion
// tests follow, because a faked block shape is how a test passes while the
// page crashes.
const expl = (s) => parseRichText(s);

const tracks = [
  {
    slug: "python",
    name: "Python Fundamentals",
    trackIcon: "p.svg",
    description: "desc",
    chapters: [
      {
        id: 1,
        name: "Basics",
        levels: [
          { id: 1, name: "Hello", explanation: expl("`print()` writes to the **console**.") },
          { id: 2, name: "Vars", explanation: expl("A variable stores data.\n\n- one\n- two") },
          { id: 3, name: "Mystery" }, // no explanation: not reference material
        ],
      },
      { id: 2, name: "Silent", levels: [{ id: 4, name: "Nothing Here" }] },
    ],
  },
];

describe("buildHandbook", () => {
  const [book] = buildHandbook(tracks);

  it("keeps only levels that explain something", () => {
    expect(book.conceptCount).toBe(2);
    expect(book.chapters[0].entries.map((e) => e.name)).toEqual(["Hello", "Vars"]);
  });

  it("drops chapters with nothing to say", () => {
    expect(book.chapters.map((c) => c.name)).toEqual(["Basics"]);
  });

  it("links every entry back to its level", () => {
    expect(book.chapters[0].entries[0].path).toBe("/tracks/python/1/1");
  });

  it("drops a track with no explanations at all", () => {
    const none = [{ ...tracks[0], chapters: [{ id: 1, name: "X", levels: [{ id: 1, name: "A" }] }] }];
    expect(buildHandbook(none)).toEqual([]);
  });
});

describe("blocksToText", () => {
  it("flattens paragraphs, code spans and bold into searchable prose", () => {
    const text = blocksToText(expl("`print()` writes to the **console**."));
    expect(text).toContain("print()");
    expect(text).toContain("console");
  });

  it("reads bullets, code blocks and tables too", () => {
    const text = blocksToText(
      expl("- alpha\n- beta\n\n```\ngamma = 1\n```\n\n| head |\n|---|\n| delta |")
    );
    for (const word of ["alpha", "beta", "gamma", "head", "delta"]) {
      expect(text).toContain(word);
    }
  });

  it("shrugs at unknown block types instead of crashing", () => {
    expect(blocksToText([{ type: "hologram" }])).toBe("");
    expect(blocksToText()).toBe("");
  });
});

describe("filterHandbook", () => {
  const [book] = buildHandbook(tracks);

  it("matches on the prose, not just the title", () => {
    const hit = filterHandbook(book, "console");
    expect(hit.conceptCount).toBe(1);
    expect(hit.chapters[0].entries[0].name).toBe("Hello");
  });

  it("hides chapters that lose every entry", () => {
    expect(filterHandbook(book, "variable").chapters).toHaveLength(1);
  });

  it("returns the track untouched for a blank query", () => {
    expect(filterHandbook(book, "  ")).toBe(book);
  });
});

describe("against the real catalogue", () => {
  const real = buildHandbook(TRACKS);

  it("collects the concepts the corpus actually carries", () => {
    const total = real.reduce((n, t) => n + t.conceptCount, 0);
    // 753 at the time of writing; the floor guards against a parser change
    // silently emptying the handbook.
    expect(total).toBeGreaterThanOrEqual(700);
    expect(real.length).toBe(TRACKS.length);
  });

  it("every entry's search text is non-trivial", () => {
    for (const t of real) {
      for (const ch of t.chapters) {
        for (const e of ch.entries) {
          expect(e._text.length).toBeGreaterThan(10);
        }
      }
    }
  });
});
