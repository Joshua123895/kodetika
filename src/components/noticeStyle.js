// The look of a practice notice, shared by the toast dock and the completion
// modal so the same result never arrives wearing two different colours.

import { Check, Flame, RotateCcw, Target } from "lucide-react";

export const GREEN = "#6AAE6F";
export const AMBER = "#E9B44C";

export const NOTICE_ICONS = {
  progress: Target,
  goal: Check,
  milestone: Flame,
  review: RotateCcw,
};

export const NOTICE_ACCENTS = {
  progress: GREEN,
  goal: AMBER,
  milestone: AMBER,
  review: GREEN,
};
