// Per-level work-in-progress code. Kept in localStorage for instant/offline
// access, and (when logged in) mirrored to the Supabase `saved_code` column so
// it follows the student across devices — the same way stars do. Progress
// context registers the cloud pusher on login; these helpers stay synchronous
// so LevelPage can read/write them directly.

import { adoptLegacyKey } from "./legacyStorage";

const CODE_KEY = "kodetika_savedCode";
adoptLegacyKey(CODE_KEY, "step-into-code_savedCode");

let cloudSaver = null; // (allCodes) => Promise, registered by ProgressContext
let debounceTimer = null;

export function loadCodes() {
  try {
    return JSON.parse(localStorage.getItem(CODE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeCodes(data) {
  localStorage.setItem(CODE_KEY, JSON.stringify(data));
}

// Push to the cloud on a longer debounce than the 500ms autosave, so a burst of
// keystrokes results in one upsert, not dozens.
function scheduleCloudPush() {
  if (!cloudSaver) return;
  clearTimeout(debounceTimer);
  const fn = cloudSaver;
  debounceTimer = setTimeout(() => fn(loadCodes()), 1500);
}

export function saveCode(trackSlug, levelId, code) {
  const all = loadCodes();
  if (!all[trackSlug]) all[trackSlug] = {};
  all[trackSlug][levelId] = code;
  writeCodes(all);
  scheduleCloudPush();
}

export function getSavedCode(trackSlug, levelId) {
  const all = loadCodes();
  return all[trackSlug]?.[levelId] || null;
}

export function clearSavedCode(trackSlug, levelId) {
  const all = loadCodes();
  if (all[trackSlug]) delete all[trackSlug][levelId];
  writeCodes(all);
  scheduleCloudPush();
}

// Merge on login: THIS device's code wins on conflict (never lose what you're
// actively typing), cloud fills in levels this device hasn't touched.
export function mergeSavedCodes(cloud = {}, local = {}) {
  const out = {};
  for (const slug of new Set([...Object.keys(cloud), ...Object.keys(local)])) {
    out[slug] = { ...(cloud[slug] || {}), ...(local[slug] || {}) };
  }
  return out;
}

export function writeAllCodes(data) {
  writeCodes(data);
}

// ProgressContext calls this with a pusher when logged in, or null on logout.
export function registerCloudSaver(fn) {
  cloudSaver = fn;
}
