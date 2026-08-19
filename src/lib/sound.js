// One place to make a noise.
//
// This codebase had grown four separate audio implementations before this file
// existed: src/game/arcadeSound.js, src/visualizations/vizSound.js, an inline
// AudioContext in LevelPage, and a module-scope one in Companion. Between them
// they opened up to four AudioContexts on a single page and answered to two
// unrelated mute keys, with no global control anywhere. A browser caps how many
// contexts a page may open, and past that limit sound simply stops with nothing
// in the console to explain it.
//
// New sound goes through here. The two older modules keep their own caches but
// now consult `isSoundOff()` as well, so the single toggle in Settings actually
// means something everywhere.

const MUTE_KEY = "kodetika_soundOff";

// Resolved at build time, so a name with no file behind it is silence rather
// than a 404 in the console. That is what lets a level or a feature reference
// `streak.mp3` today and have it start working the moment someone drops the
// file in, with no code change.
const modules = import.meta.glob("../assets/sounds/*.mp3", {
  eager: true,
  query: "?url",
  import: "default",
});

const url = (file) => modules[`../assets/sounds/${file}.mp3`];

const SOUND_URLS = {
  // Reusing the existing files. Dedicated ones can replace these by name.
  goal: url("complete"),
  milestone: url("complete"),
  reviewDone: url("collect"),
};

/**
 * The global mute, read straight from localStorage rather than through React.
 *
 * Deliberately not in SettingsContext's own state path: arcadeSound and
 * vizSound are plain modules called from event handlers deep inside games, and
 * threading a hook through them would mean rewriting all three. SettingsContext
 * writes this key, everything reads it.
 */
export function isSoundOff() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundOff(off) {
  try {
    localStorage.setItem(MUTE_KEY, off ? "1" : "0");
  } catch {
    // Preference simply does not persist. Nothing else depends on it.
  }
}

let ctx = null;
const buffers = {};

function context() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Created before any user gesture, so it starts suspended and has to be woken
  // from inside the interaction that wants to make noise.
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function load(name) {
  if (buffers[name] !== undefined) return buffers[name];
  const src = SOUND_URLS[name];
  if (!src) {
    buffers[name] = null;
    return null;
  }
  buffers[name] = fetch(src)
    .then((res) => res.arrayBuffer())
    .then((data) => context().decodeAudioData(data))
    .then((buf) => {
      buffers[name] = buf;
      return buf;
    })
    .catch(() => {
      buffers[name] = null;
      return null;
    });
  return buffers[name];
}

/** Fire and forget. Sound is decoration; nothing waits on it and nothing throws. */
export function play(name) {
  if (isSoundOff()) return;
  try {
    const held = load(name);
    const start = (buffer) => {
      if (!buffer) return;
      const audio = context();
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.destination);
      source.start(0);
    };
    if (held && typeof held.then === "function") held.then(start);
    else start(held);
  } catch {
    // Autoplay policy, a closed context, a decode failure: all silence.
  }
}

/** Warms the context and decodes ahead of the first cue. */
export function warmSounds() {
  try {
    for (const name of Object.keys(SOUND_URLS)) load(name);
  } catch {
    // Nothing to do; play() will try again and fall back to silence.
  }
}
