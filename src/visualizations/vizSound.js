// Sound effects for visualization playback, loaded from real audio files (not
// synthesized) so real sound assets can be dropped in. Files live in
// src/assets/sounds and are picked up by Vite's import.meta.glob, so a file
// that doesn't exist yet simply isn't included instead of breaking the build.
//
// Expected files (add your own with these exact names):
//   src/assets/sounds/viz_tick.mp3      short step sound, plays very often - keep it brief and quiet
//   src/assets/sounds/viz_fail.mp3      plays once when a search/lookup ends without finding its target
//   src/assets/sounds/viz_complete.mp3  plays once when playback finishes successfully
//
// Until a file is added, playing it is silently a no-op (no console errors).

import { adoptLegacyKey } from "../lib/legacyStorage";

const MUTE_KEY = "kodetika_vizSoundMuted";
adoptLegacyKey(MUTE_KEY, "step-into-code_vizSoundMuted");

// Eagerly resolve the URL for each viz_*.mp3 that exists at build time.
const soundModules = import.meta.glob("../assets/sounds/viz_*.mp3", {
  eager: true,
  query: "?url",
  import: "default",
});

const SOUND_URLS = {
  tick: soundModules["../assets/sounds/viz_tick.mp3"],
  fail: soundModules["../assets/sounds/viz_fail.mp3"],
  complete: soundModules["../assets/sounds/viz_complete.mp3"],
};

let ctx = null;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

const bufferCache = {};
function loadBuffer(name) {
  if (bufferCache[name]) return bufferCache[name];
  if (!SOUND_URLS[name]) return Promise.resolve(null); // file not added yet
  const audio = getCtx();
  bufferCache[name] = fetch(SOUND_URLS[name])
    .then((res) => {
      if (!res.ok) throw new Error("missing sound file");
      return res.arrayBuffer();
    })
    .then((data) => audio.decodeAudioData(data))
    .catch(() => null);
  return bufferCache[name];
}

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // localStorage unavailable (private mode, etc.) — mute preference just won't persist.
  }
}

async function play(name) {
  if (isMuted()) return;
  try {
    const audio = getCtx();
    const buffer = await loadBuffer(name);
    if (!buffer) return; // file not added yet, or failed to decode
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.start(0);
  } catch {
    // Audio can fail before a user gesture unlocks the context; skip silently.
  }
}

export function playTick() {
  play("tick");
}

export function playFail() {
  play("fail");
}

export function playComplete() {
  play("complete");
}
