// Arcade high scores. Kept in localStorage for instant/offline access and, when
// logged in, mirrored to the Supabase `arcade` column so they follow you across
// devices — the same shape as saved code, deliberately.
//
// These live in their own key rather than inside the progress object, because
// progress is strictly { trackSlug: { levelId: stars } }: getCompletedCount()
// counts its keys and getTotalStars() sums its values, so a stray "pong" entry
// under a track slug would corrupt both.

const ARCADE_KEY = "step-into-code_arcade";

let cloudSaver = null; // (allScores) => Promise, registered by ProgressContext
let debounceTimer = null;

export function loadScores() {
  try {
    return JSON.parse(localStorage.getItem(ARCADE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeScores(data) {
  localStorage.setItem(ARCADE_KEY, JSON.stringify(data));
}

function scheduleCloudPush() {
  if (!cloudSaver) return;
  clearTimeout(debounceTimer);
  const fn = cloudSaver;
  debounceTimer = setTimeout(() => fn(loadScores()), 1500);
}

export function getScore(game, metric) {
  const v = loadScores()[game]?.[metric];
  return typeof v === "number" ? v : 0;
}

/**
 * Records a result. Only ever raises the stored value, so an ordinary run can
 * never wipe out a personal best. Returns true when a new record was set.
 */
export function recordScore(game, metric, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const all = loadScores();
  if (!all[game]) all[game] = {};
  const previous = typeof all[game][metric] === "number" ? all[game][metric] : 0;
  if (value <= previous) return false;
  all[game][metric] = value;
  writeScores(all);
  scheduleCloudPush();
  return true;
}

/**
 * Merge on login. Highest wins per metric, matching how stars merge — a device
 * that has been offline can only ever contribute records, never erase them.
 */
export function mergeScores(cloud = {}, local = {}) {
  const out = {};
  for (const game of new Set([...Object.keys(cloud), ...Object.keys(local)])) {
    const c = cloud[game] || {};
    const l = local[game] || {};
    out[game] = {};
    for (const metric of new Set([...Object.keys(c), ...Object.keys(l)])) {
      out[game][metric] = Math.max(Number(c[metric]) || 0, Number(l[metric]) || 0);
    }
  }
  return out;
}

export function writeAllScores(data) {
  writeScores(data);
}

// ProgressContext calls this with a pusher when logged in, or null on logout.
export function registerArcadeCloudSaver(fn) {
  cloudSaver = fn;
}
