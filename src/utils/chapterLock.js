// Chapter gating: a chapter opens once the LAST level of the chapter before it
// has been completed. Chapter 1 is always open.
//
// The second condition below is a deliberate safety valve. Progress predates
// this rule, and plenty of it is scattered — levels finished in chapter 5 while
// chapter 2's finale is still untouched. Gating on the previous chapter alone
// would retroactively lock people out of work they had already done, which reads
// as the app losing their progress. So a chapter also stays open if they have
// finished anything inside it.
//
// `getStars(trackSlug, levelId) -> number` is passed in rather than imported so
// this stays pure and testable without React or the progress store.

/** Has the last level of `chapter` been completed? */
export function isChapterFinished(trackSlug, chapter, getStars) {
  const last = chapter?.levels?.[chapter.levels.length - 1];
  return Boolean(last && getStars(trackSlug, last.id) > 0);
}

/** Is `track.chapters[index]` open to the student? */
export function isChapterUnlocked(track, index, getStars) {
  if (!track || index <= 0) return true;
  const chapter = track.chapters[index];
  if (!chapter) return true;
  if (isChapterFinished(track.slug, track.chapters[index - 1], getStars)) return true;
  return chapter.levels.some((l) => getStars(track.slug, l.id) > 0);
}

/** The chapter a level belongs to, and whether that chapter is open. */
export function isLevelUnlocked(track, levelId, getStars) {
  if (!track) return true;
  const index = track.chapters.findIndex((ch) => ch.levels.some((l) => String(l.id) === String(levelId)));
  if (index < 0) return true;
  return isChapterUnlocked(track, index, getStars);
}

/** Name of the chapter that must be finished first, for the locked message. */
export function blockingChapterName(track, index) {
  if (!track || index <= 0) return null;
  return track.chapters[index - 1]?.name ?? null;
}
