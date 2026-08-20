// The handbook: every concept the tracks teach, readable as reference instead
// of one level at a time mid-solve.
//
// Nothing here is authored. Each entry IS a level's `expl`, which is why the
// handbook can never drift out of date: fixing a level's explanation fixes the
// handbook, and a new chapter arrives already documented. A hand-written wiki
// would have been a second copy of this content with its own rot schedule.
//
// Pure, and takes `tracks` as an argument like journey.js does, so the rules
// are testable against a fixture.

/** A track's handbook: its chapters, each with the levels that explain something. */
export function buildHandbook(tracks) {
  return tracks
    .map((track) => {
      const chapters = track.chapters
        .map((chapter) => ({
          id: chapter.id,
          name: chapter.name,
          entries: chapter.levels
            .filter((level) => level.explanation)
            .map((level) => ({
              levelId: level.id,
              name: level.name,
              explanation: level.explanation,
              path: `/tracks/${track.slug}/${chapter.id}/${level.id}`,
              // Lowercased prose, extracted once: the filter runs per keystroke.
              _text: `${level.name} ${blocksToText(level.explanation)}`.toLowerCase(),
            })),
        }))
        .filter((chapter) => chapter.entries.length > 0);

      return {
        slug: track.slug,
        name: track.name,
        icon: track.trackIcon,
        description: track.description,
        chapters,
        conceptCount: chapters.reduce((n, ch) => n + ch.entries.length, 0),
      };
    })
    .filter((t) => t.conceptCount > 0);
}

/**
 * The plain text of a rich-text block list, for searching.
 *
 * Walks the shapes richText.js documents: para/bullets/ordered/codeblock/table,
 * with text/code/bold segments. Anything unrecognised contributes nothing
 * rather than crashing, so a future block type degrades the filter, not the
 * page.
 */
export function blocksToText(blocks = []) {
  const seg = (segments = []) => segments.map((s) => s.value ?? "").join("");
  const parts = [];
  for (const block of blocks) {
    if (block.type === "para") parts.push(seg(block.segments));
    else if (block.type === "bullets" || block.type === "ordered") {
      for (const item of block.items ?? []) parts.push(seg(item));
    } else if (block.type === "codeblock") parts.push(block.value ?? "");
    else if (block.type === "table") {
      for (const row of [...(block.header ? [block.header] : []), ...(block.rows ?? [])]) {
        for (const cell of row) parts.push(seg(cell));
      }
    }
  }
  return parts.join(" ");
}

/**
 * One track's handbook, narrowed to the entries mentioning `query` in their
 * name or prose. Chapters that lose every entry disappear rather than sitting
 * as empty headings. A blank query returns the track untouched.
 */
export function filterHandbook(track, query) {
  const q = query.trim().toLowerCase();
  if (!q) return track;
  const chapters = track.chapters
    .map((ch) => ({ ...ch, entries: ch.entries.filter((e) => e._text.includes(q)) }))
    .filter((ch) => ch.entries.length > 0);
  return { ...track, chapters, conceptCount: chapters.reduce((n, ch) => n + ch.entries.length, 0) };
}
