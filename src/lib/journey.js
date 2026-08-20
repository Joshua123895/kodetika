// Everything the profile page reports, computed from sources that already
// exist: the progress map, the practice review data, and TRACKS.
//
// Nothing new is stored. A student who has been using Kodetika for months
// already has all of this recorded; it has simply never been added up in one
// place. Pure, and takes `tracks` as an argument rather than importing TRACKS,
// so the rules below can be tested against a three-level fixture instead of
// against 841 real ones.

/** Three stars a level is the ceiling, which is what turns stars into a ratio. */
export const STARS_PER_LEVEL = 3;

/**
 * Per-track totals: how much of it is done, and how well.
 *
 * `stars` and `maxStars` are kept apart from `done` and `total` on purpose. A
 * student can finish every level in a track on one star, and "100% complete,
 * 33% mastered" is the honest way to say that.
 */
export function trackSummaries(tracks, progress = {}) {
  return tracks.map((track) => {
    const levelIds = track.chapters.flatMap((ch) => ch.levels.map((l) => l.id));
    const earned = progress[track.slug] || {};

    let done = 0;
    let stars = 0;
    for (const id of levelIds) {
      const s = earned[id] || 0;
      if (s > 0) done += 1;
      stars += s;
    }

    const total = levelIds.length;
    const maxStars = total * STARS_PER_LEVEL;
    return {
      slug: track.slug,
      name: track.name,
      icon: track.trackIcon,
      difficulty: track.difficulty,
      total,
      done,
      stars,
      maxStars,
      // Rounded only for display. Nothing downstream does arithmetic on these.
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
      mastery: maxStars > 0 ? Math.round((stars / maxStars) * 100) : 0,
      complete: total > 0 && done === total,
      started: done > 0,
    };
  });
}

/** The headline figures, summed from the per-track ones so they cannot disagree. */
export function overallTotals(summaries) {
  const t = (key) => summaries.reduce((sum, s) => sum + s[key], 0);
  const levels = t("done");
  const totalLevels = t("total");
  const stars = t("stars");
  const maxStars = t("maxStars");

  return {
    levels,
    totalLevels,
    stars,
    maxStars,
    pct: totalLevels > 0 ? Math.round((levels / totalLevels) * 100) : 0,
    // Mastery is measured against the levels actually done, not against all 841.
    // Someone who three-starred every level they have reached has mastered what
    // they have studied, and reporting that as "0% mastered" because 838 levels
    // are still ahead of them is both discouraging and useless as feedback.
    mastery: levels > 0 ? Math.round((stars / (levels * STARS_PER_LEVEL)) * 100) : 0,
    // The absolute version, for anyone who does want it against the catalogue.
    catalogueMastery: maxStars > 0 ? Math.round((stars / maxStars) * 100) : 0,
    tracksStarted: summaries.filter((s) => s.started).length,
    tracksComplete: summaries.filter((s) => s.complete).length,
    totalTracks: summaries.length,
  };
}

/**
 * Resolves a track slug and level id to something a link can be built from.
 *
 * The chapter is looked up rather than stored, for the reason assignLevelIds
 * documents: a level's id is its identity, not its position, so a chapter
 * inserted mid-track moves the chapter number while the level id stays put.
 * Anything cached would quietly rot.
 */
export function locateLevel(tracks, trackSlug, levelId) {
  const track = tracks.find((t) => t.slug === trackSlug);
  if (!track) return null;
  for (const chapter of track.chapters) {
    const level = chapter.levels.find((l) => l.id === levelId);
    if (level) {
      return {
        trackSlug: track.slug,
        trackName: track.name,
        chapterId: chapter.id,
        chapterName: chapter.name,
        levelId,
        levelName: level.name,
        path: `/tracks/${track.slug}/${chapter.id}/${levelId}`,
      };
    }
  }
  return null;
}

/**
 * The levels that fought back, worst first.
 *
 * Read from the practice review data, where `fails` counts every submission
 * below three stars. That is the only record of struggle the app keeps, and it
 * is the one thing here a student could not work out for themselves by looking
 * at a track page.
 *
 * Retired levels are excluded: having beaten a level four times over a month is
 * the opposite of a soft spot, however hard it was at the start.
 */
export function softSpots(tracks, review = {}, { limit = 8 } = {}) {
  const out = [];

  for (const [slug, levels] of Object.entries(review)) {
    for (const [levelId, entry] of Object.entries(levels || {})) {
      if (!entry || !entry.fails) continue;
      if (entry.box >= 4) continue; // retired; see isRetired in practice.js
      const found = locateLevel(tracks, slug, Number(levelId));
      if (!found) continue; // a level that no longer exists in the YAML
      out.push({ ...found, fails: entry.fails, box: entry.box || 0, last: entry.last || 0 });
    }
  }

  // Most retries first, then most recent, so a tie breaks toward what is still
  // fresh in the student's memory rather than something from six weeks ago.
  out.sort((a, b) => b.fails - a.fails || b.last - a.last);
  return out.slice(0, limit);
}

/**
 * Every level of one track that is still missing stars, in teaching order.
 *
 * This is the answer to "I am 285 of 300, where are the other 15" without
 * opening chapters one by one. Played-but-imperfect and never-played levels
 * both belong here: either way the stars are not banked yet.
 */
export function missingStars(track, progress = {}) {
  const earned = progress[track.slug] || {};
  const out = [];
  for (const chapter of track.chapters) {
    for (const level of chapter.levels) {
      const stars = earned[level.id] || 0;
      if (stars >= STARS_PER_LEVEL) continue;
      out.push({
        levelId: level.id,
        name: level.name,
        chapterId: chapter.id,
        chapterName: chapter.name,
        stars,
        missing: STARS_PER_LEVEL - stars,
        path: `/tracks/${track.slug}/${chapter.id}/${level.id}`,
      });
    }
  }
  return out;
}
