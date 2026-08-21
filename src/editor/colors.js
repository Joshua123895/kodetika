import { useMemo } from "react";
import { useTheme } from "../context/ThemeContext";

// Every colour is a CSS variable reference, so the editor chrome follows
// whichever of the six themes is active (the values live in index.css, one set
// per theme block). Only `isDark` is real state: it picks the syntax-token
// palette (One Dark or the light set), which stays binary on purpose — token
// colours are tuned for contrast against a dark or a light pane, not per theme.
//
// Memoised on `dark` alone, which fully determines every field. Returning a
// fresh object each render made `c` a new reference every time, so anything
// depending on it could never memoise.
export function useColors() {
  const { dark } = useTheme();
  return useMemo(() => ({
    isDark: dark,
    outerBorder: "var(--editor-outer-border)",
    headerBg: "var(--editor-header)",
    languageBg: "#6AAE6F20",
    languageText: "#6AAE6F",
    runDisabledBg: "var(--text-disabled)",
    tabBarBg: "var(--editor-tabbar)",
    tabBorder: "var(--editor-tab-border)",
    tabActiveBg: "var(--editor-bg)",
    tabActiveText: "var(--editor-text)",
    tabInactiveText: "var(--editor-muted)",
    editorBg: "var(--editor-bg)",
    consoleBg: "var(--editor-console-bg)",
    consoleText: "var(--editor-console-text)",
    consoleLabel: "var(--editor-muted)",
    inputText: "var(--editor-console-text)",
    selectionBg: "var(--editor-selection)",
    caretColor: "#6AAE6F",
  }), [dark]);
}
