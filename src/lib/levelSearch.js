// The index behind the Ctrl+K palette: every level in every track, searchable
// by name in a way a person half-remembering a title can actually hit.
//
// Pure, and the index is built once from whatever `tracks` it is handed, so the
// ranking rules below are tested against a three-level fixture rather than 862
// real levels.

/** One flat entry per level, with everything a result row needs. */
export function buildIndex(tracks) {
  const out = [];
  for (const track of tracks) {
    for (const chapter of track.chapters) {
      for (const level of chapter.levels) {
        out.push({
          trackSlug: track.slug,
          trackName: track.name,
          chapterName: chapter.name,
          levelId: level.id,
          name: level.name,
          path: `/tracks/${track.slug}/${chapter.id}/${level.id}`,
          // Lowercased once at build time; search runs on every keystroke.
          _name: level.name.toLowerCase(),
          _context: `${track.name} ${chapter.name}`.toLowerCase(),
        });
      }
    }
  }
  return out;
}

/**
 * Ranked search. Three tiers, best first:
 *
 *   0  the level name starts with the query
 *   1  the level name contains it
 *   2  only the track or chapter name contains it
 *
 * Ties keep index order, which is track order then level order — the same
 * order the rest of the app presents things in, so results feel stable rather
 * than reshuffling as the query grows.
 */
export function searchLevels(index, query, { limit = 12 } = {}) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const tiers = [[], [], []];
  for (const entry of index) {
    if (entry._name.startsWith(q)) tiers[0].push(entry);
    else if (entry._name.includes(q)) tiers[1].push(entry);
    else if (entry._context.includes(q)) tiers[2].push(entry);
    if (tiers[0].length >= limit) break; // enough of the best tier already
  }
  return [...tiers[0], ...tiers[1], ...tiers[2]].slice(0, limit);
}
