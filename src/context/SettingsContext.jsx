import { createContext, useContext, useState, useEffect } from "react";
import { DEFAULT_TONE, TONES } from "../lib/companion";
import { setSoundOff } from "../lib/sound";
import { DEFAULT_GOAL } from "../lib/practice";
import { DEFAULT_TIER, normaliseTier } from "../game/arcadeDifficulty";

// Preferences that are neither progress nor theme. Kept separate from
// ProgressContext deliberately: that object is keyed by track slug and its
// counters sum over their own keys, so a stray preference stored beside a
// track would be counted as a level (see PRD 3.7, the same reasoning that keeps
// arcade scores in their own key).
//
// Local only, and not synced to Supabase. A companion someone switched off on
// their laptop is a property of that screen rather than of the account, and
// syncing it would mean a signed-in student's setting changing under them on
// login for no reason they could see.
const STORAGE_KEY = "kodetika_settings";

const DEFAULTS = {
  // On by default so it is discoverable at all; a feature nobody finds in a
  // settings menu they never open may as well not exist. One click turns it off
  // and that choice sticks.
  companion: true,
  // How the companion phrases its own sentences. Casual is the default because
  // the audience is beginners; the other registers exist because "friendly" is
  // not universally welcome and some people just want the fact.
  tone: DEFAULT_TONE,
  // One switch for every noise the app makes. arcadeSound and vizSound read the
  // mirrored localStorage key directly, because they are plain modules called
  // from deep inside game handlers where a React hook cannot reach.
  sound: true,
  // Points, not levels: a level is 2 and an Arcade credit is 1, so 6 is "three
  // levels a day". Stored in points so the arithmetic never meets a fraction.
  dailyGoal: DEFAULT_GOAL,
  // Which difficulty the arcade quiz games deal from. Remembered rather than
  // asked every visit: someone who wants Hard wants it tomorrow too.
  arcadeTier: DEFAULT_TIER,
};

const SettingsContext = createContext(null);

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    // Spread over the defaults rather than replacing them, so a key added in a
    // later release is present for someone whose stored object predates it.
    const merged = { ...DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
    // A tone written by a newer build, or by hand, must not leave the companion
    // reading from a table that has no entry for it.
    if (!TONES.includes(merged.tone)) merged.tone = DEFAULT_TONE;
    // Same guard for the arcade dial: a tier of 0 or "hard" would filter the
    // deck down to nothing and leave the games with no round to show.
    merged.arcadeTier = normaliseTier(merged.arcadeTier);
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  // Mirrored out to the key the non-React sound modules read.
  useEffect(() => {
    setSoundOff(!settings.sound);
  }, [settings.sound]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // A full or blocked localStorage must not take the app down over a
      // preference. The setting simply does not survive the tab.
    }
  }, [settings]);

  const value = {
    ...settings,
    set: (key, val) => setSettings((s) => ({ ...s, [key]: val })),
    toggle: (key) => setSettings((s) => ({ ...s, [key]: !s[key] })),
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
