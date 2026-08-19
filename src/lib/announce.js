// Announces a practice result through the floating dock.
//
// Used by the Arcade, which has no completion modal of its own. A level
// completion deliberately does NOT come through here: it publishes the notice
// on ProgressContext instead and CompletionModal draws it inline, because a
// floating toast lands on top of the stars panel.
//
// Kept apart from notice.js so that module stays pure and testable; this one
// exists only to reach the two side effects.

import { emitToast } from "./toast";
import { play } from "./sound";
import { buildNotice } from "./notice";

export function announce(day, review = {}) {
  const notice = buildNotice(day, review);
  if (notice.sound) play(notice.sound);
  emitToast(notice);
  return notice;
}
