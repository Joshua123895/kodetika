import { createContext, useContext, useState, useEffect } from "react";

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
};

const SettingsContext = createContext(null);

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    // Spread over the defaults rather than replacing them, so a key added in a
    // later release is present for someone whose stored object predates it.
    return { ...DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

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
