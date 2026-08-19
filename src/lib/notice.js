// Turns a practice result into the one thing worth saying about it.
//
// Pure, and deliberately separate from both the toast dock and the completion
// modal, because the same result is now announced in two different places: a
// level completion shows it inside the modal (a floating toast would land on
// top of the stars, which is what it used to do), while an Arcade credit has no
// modal and uses the dock.
//
// The ranking also names the sound. It used to be written out twice in
// ProgressContext, once to pick the toast and once to pick the noise, which is
// two chances for them to disagree about what just happened.

/** Points are stored as integers; only what a person reads divides by two. */
export function asLevels(points) {
  const whole = Math.floor(points / 2);
  const half = points % 2 === 1;
  if (whole === 0 && half) return "½";
  return half ? `${whole}½` : String(whole);
}

/**
 * Builds the notice for one practice result.
 *
 * At most one, in order of what a person would most want to hear: a streak
 * milestone beats meeting the goal, which beats retiring a level, which beats
 * ordinary progress. Firing all four at once would bury the good news under the
 * mundane.
 *
 * `sound` is the cue name, or null when nothing is worth celebrating out loud.
 * Ordinary progress is deliberately silent: a noise on every single level would
 * stop meaning anything by the third one.
 */
export function buildNotice(day, review = {}) {
  const progress = { from: day.previousPoints, to: day.points, max: day.goal };

  if (day.milestone) {
    return {
      kind: "milestone",
      title: `${day.milestone} day streak`,
      detail: "That is a proper habit now.",
      progress,
      sound: "milestone",
    };
  }
  if (day.goalMet) {
    return {
      kind: "goal",
      title: "Daily goal met",
      detail: `${asLevels(day.goal)} levels done. Anything more is a bonus.`,
      progress,
      sound: "goal",
    };
  }
  if (review.retired) {
    return {
      kind: "review",
      title: "Review cleared",
      detail: "You have nailed that one. It will stop coming back.",
      progress,
      sound: "reviewDone",
    };
  }
  return {
    kind: "progress",
    title: `${asLevels(day.points)} of ${asLevels(day.goal)} levels today`,
    detail: day.streak > 1 ? `${day.streak} day streak going.` : "Keep it rolling.",
    progress,
    sound: null,
  };
}
