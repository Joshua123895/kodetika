// Sound for the arcade's quiz games — the same complete/wrong pair the level
// pages use, so answering a round feels like submitting a level.
//
// Only the quiz games use this. The pygame games (Pong, Breakout, Snake, Free
// Build) run inside an iframe with their own runtime, and the shim has no audio
// support at all, so there is nothing to hook there.
//
// Modelled on src/visualizations/vizSound.js: one lazily created AudioContext, a
// decoded-buffer cache, and silent failure — audio cannot play before a user
// gesture unlocks the context, and that should never surface as an error.

import { adoptLegacyKey } from "../lib/legacyStorage";

const MUTE_KEY = "kodetika_arcadeSoundMuted";
adoptLegacyKey(MUTE_KEY, "step-into-code_arcadeSoundMuted");

const soundModules = import.meta.glob("../assets/sounds/*.mp3", {
  eager: true,
  query: "?url",
  import: "default",
});

const SOUND_URLS = {
  complete: soundModules["../assets/sounds/complete.mp3"],
  collect: soundModules["../assets/sounds/collect.mp3"],
  wrong: soundModules["../assets/sounds/wrong.mp3"],
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
  if (!SOUND_URLS[name]) return Promise.resolve(null);
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
    // Private mode: the preference just won't persist.
  }
}

async function play(name) {
  if (isMuted()) return;
  try {
    const audio = getCtx();
    const buffer = await loadBuffer(name);
    if (!buffer) return;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.start(0);
  } catch {
    // Never let a missing/blocked sound break the game.
  }
}

/** A correct answer. */
export function playCorrect() {
  play("complete");
}

/** A milestone worth a lighter cue than a full fanfare — a streak tick. */
export function playCollect() {
  play("collect");
}

/** A wrong answer. */
export function playWrong() {
  play("wrong");
}
