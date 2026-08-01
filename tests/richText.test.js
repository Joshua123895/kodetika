import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { load as loadYaml } from "js-yaml";
import { parseRichText, parseInline } from "../src/data/richText.js";

const text = (blocks) => blocks.map((b) => (b.segments || []).map((s) => s.value).join("")).join("\n");

describe("inline segments", () => {
  it("splits backticks into code segments, as before", () => {
    expect(parseInline("Use `print()` here")).toEqual([
      { type: "text", value: "Use " },
      { type: "code", value: "print()" },
      { type: "text", value: " here" },
    ]);
  });

  it("marks **bold** outside code", () => {
    expect(parseInline("that is **very** important")).toEqual([
      { type: "text", value: "that is " },
      { type: "bold", value: "very" },
      { type: "text", value: " important" },
    ]);
  });

  it("leaves ** alone inside code spans, because it is Python's exponent", () => {
    // Real content: python1.yaml uses "Use `**`, `%`, `//`" and `a ** b`.
    expect(parseInline("Use `**`, `%`, `//`")).toEqual([
      { type: "text", value: "Use " },
      { type: "code", value: "**" },
      { type: "text", value: ", " },
      { type: "code", value: "%" },
      { type: "text", value: ", " },
      { type: "code", value: "//" },
    ]);
    expect(parseInline("`a ** b`")).toEqual([{ type: "code", value: "a ** b" }]);
  });
});

describe("blocks", () => {
  it("keeps ordinary single-line text as exactly one paragraph", () => {
    const blocks = parseRichText("Create a variable `x` with value `5`, then print it.");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("para");
  });

  it("returns undefined for empty input", () => {
    expect(parseRichText("")).toBeUndefined();
    expect(parseRichText(undefined)).toBeUndefined();
  });

  it("builds a bullet list", () => {
    const blocks = parseRichText("Print each of these:\n- the area\n- a colour");
    expect(blocks.map((b) => b.type)).toEqual(["para", "bullets"]);
    expect(blocks[1].items).toHaveLength(2);
    expect(text([{ segments: blocks[1].items[0] }])).toBe("the area");
  });

  it("builds a numbered list", () => {
    const blocks = parseRichText("Steps:\n1. Import math\n2. Read a radius\n3. Print it");
    expect(blocks.map((b) => b.type)).toEqual(["para", "ordered"]);
    expect(blocks[1].items).toHaveLength(3);
  });

  it("keeps list items' inline code", () => {
    const blocks = parseRichText("- call `print()`");
    expect(blocks[0].items[0]).toContainEqual({ type: "code", value: "print()" });
  });

  it("turns a multi-line backtick span into one code block, preserving indentation", () => {
    // This shape appears in 21 existing hints and used to collapse onto one line.
    const blocks = parseRichText('Try: `try:\n    print(int("abc"))\nexcept ValueError:\n    print("Error")`');
    const code = blocks.find((b) => b.type === "codeblock");
    expect(code).toBeDefined();
    expect(code.value).toContain('    print(int("abc"))');
    expect(code.value.split("\n")).toHaveLength(4);
  });

  it("does not treat a single-line backtick span as a code block", () => {
    const blocks = parseRichText("Try: `x = 5`");
    expect(blocks.every((b) => b.type !== "codeblock")).toBe(true);
  });
});

describe("tables", () => {
  const table = "| Operator | Meaning |\n|----------|---------|\n| `**` | power |\n| `//` | floor |";

  it("parses a header row and its body rows", () => {
    const blocks = parseRichText(table);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("table");
    expect(blocks[0].header).toHaveLength(2);
    expect(blocks[0].rows).toHaveLength(2);
    expect(blocks[0].rows[0]).toHaveLength(2);
  });

  it("runs each cell through the inline parser", () => {
    const { header, rows } = parseRichText(table)[0];
    expect(header[0]).toEqual([{ type: "text", value: "Operator" }]);
    // `**` must stay a code segment, not become bold — it is Python's exponent.
    expect(rows[0][0]).toEqual([{ type: "code", value: "**" }]);
  });

  it("leaves a pipe line alone when there is no separator row", () => {
    const blocks = parseRichText("Use the | character to pipe output.");
    expect(blocks.every((b) => b.type !== "table")).toBe(true);
    expect(blocks[0].type).toBe("para");
  });

  it("keeps surrounding prose as its own blocks", () => {
    const blocks = parseRichText("Operators:\n" + table + "\nPick the right one.");
    expect(blocks.map((b) => b.type)).toEqual(["para", "table", "para"]);
  });
});

describe("all shipped level text still parses", () => {
  const dir = join(process.cwd(), "src/data/tracks");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
    it(file, () => {
      const track = loadYaml(readFileSync(join(dir, file), "utf8"));
      let checked = 0;
      for (const ch of track.chapters) {
        for (const lvl of ch.levels) {
          for (const field of ["obj", "hint", "expl"]) {
            if (!lvl[field]) continue;
            const blocks = parseRichText(lvl[field]);
            expect(blocks, `${lvl.name}.${field}`).toBeDefined();
            expect(Array.isArray(blocks)).toBe(true);
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
    });
  }
});
