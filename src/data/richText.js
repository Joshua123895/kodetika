// Parser for the small formatting dialect used by level `obj`, `hint` and
// `expl`. Deliberately hand-rolled rather than a markdown dependency: the
// content is first-party YAML, the surface is tiny, and the surrounding
// tracks.js is already a set of small parseX() helpers over a compact DSL.
//
// Output is a list of BLOCKS, each holding inline SEGMENTS:
//
//   [{ type: "para",      segments: [...] },
//    { type: "bullets",   items: [[...segments], ...] },
//    { type: "ordered",   items: [[...segments], ...] },
//    { type: "codeblock", value: "…" },
//    { type: "table",     header: [[...segments]], rows: [[[...segments]]] }]
//
// Segments are { type: "text" | "code" | "bold", value }.

const BULLET = /^[-*]\s+(.*)$/;
const ORDERED = /^\d+[.)]\s+(.*)$/;
// A table row is any line fenced by pipes; a separator is the |---|---| line
// directly under the header. Requiring the separator is what stops ordinary
// prose that happens to contain a "|" from being swallowed as a table.
const PIPE_ROW = /^\|(.+)\|$/;
const PIPE_SEPARATOR = /^\|[\s:|-]+\|$/;

/** Splits "| a | b |" into its trimmed cell strings. */
function splitRow(line) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * Splits one line into inline segments. Backticks win over everything, so
 * `**` inside a code span stays literal — that matters because ** is Python's
 * exponent operator and already appears in level text (e.g. "Use `**`, `%`,
 * `//`"), where treating it as bold would mangle the instruction.
 */
export function parseInline(str) {
  const segments = [];
  for (const part of str.split(/(`[^`]*`)/)) {
    if (!part) continue;
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      segments.push({ type: "code", value: part.slice(1, -1) });
      continue;
    }
    // Only outside code spans is ** treated as emphasis.
    for (const piece of part.split(/(\*\*[^*]+\*\*)/)) {
      if (!piece) continue;
      if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) {
        segments.push({ type: "bold", value: piece.slice(2, -2) });
      } else {
        segments.push({ type: "text", value: piece });
      }
    }
  }
  return segments;
}

/**
 * Parses a level's instruction string into blocks. Plain single-paragraph text
 * — which is what every existing level uses — comes back as exactly one
 * "para" block, so nothing that renders today changes shape.
 */
export function parseRichText(str) {
  if (!str) return undefined;

  // A multi-line backtick span is prose-level code (21 hints already contain
  // one). Pull those out first: they used to become an inline <code> whose
  // newlines and indentation collapsed onto a single unreadable line.
  const chunks = String(str).split(/(`[^`]*`)/);
  const blocks = [];
  let pending = [];

  const flushPending = () => {
    const text = pending.join("");
    pending = [];
    if (!text.trim()) return;
    blocks.push(...parseTextBlocks(text));
  };

  for (const chunk of chunks) {
    if (!chunk) continue;
    const isCode = chunk.startsWith("`") && chunk.endsWith("`") && chunk.length >= 2;
    if (isCode && chunk.includes("\n")) {
      flushPending();
      blocks.push({ type: "codeblock", value: chunk.slice(1, -1).replace(/^\n/, "").replace(/\s+$/, "") });
    } else {
      pending.push(chunk);
    }
  }
  flushPending();

  return blocks.length > 0 ? blocks : undefined;
}

/** Turns plain (already code-block-free) text into para/bullets/ordered/table blocks. */
function parseTextBlocks(text) {
  const blocks = [];
  let paraLines = [];
  let list = null; // { type, items: string[] }

  const flushPara = () => {
    const joined = paraLines.join(" ").trim();
    paraLines = [];
    if (joined) blocks.push({ type: "para", segments: parseInline(joined) });
  };
  const flushList = () => {
    if (list) blocks.push({ type: list.type, items: list.items.map(parseInline) });
    list = null;
  };

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // A pipe row only starts a table when the NEXT line is a separator, so a
    // sentence containing a pipe stays prose.
    if (PIPE_ROW.test(line) && i + 1 < lines.length && PIPE_SEPARATOR.test(lines[i + 1].trim())) {
      flushPara();
      flushList();
      const header = splitRow(line).map(parseInline);
      const rows = [];
      i += 2; // skip the header and its separator
      while (i < lines.length && PIPE_ROW.test(lines[i].trim())) {
        rows.push(splitRow(lines[i].trim()).map(parseInline));
        i++;
      }
      i--; // the for-loop's i++ will step past the last consumed line
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const bullet = line.match(BULLET);
    const ordered = line.match(ORDERED);

    if (bullet) {
      flushPara();
      if (list && list.type !== "bullets") flushList();
      if (!list) list = { type: "bullets", items: [] };
      list.items.push(bullet[1]);
    } else if (ordered) {
      flushPara();
      if (list && list.type !== "ordered") flushList();
      if (!list) list = { type: "ordered", items: [] };
      list.items.push(ordered[1]);
    } else if (!line) {
      flushPara();
      flushList();
    } else {
      flushList();
      paraLines.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}
