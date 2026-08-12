import { useMemo } from "react";
import { useTheme } from "../context/ThemeContext";

// Memoised on `dark` alone, which fully determines every field. Returning a
// fresh object each render made `c` a new reference every time, so anything
// depending on it could never memoise.
export function useColors() {
  const { dark } = useTheme();
  return useMemo(() => ({
    isDark: dark,
    outerBorder: dark ? "#374151" : "#D4D9CF",
    headerBg: dark ? "#1e1e2e" : "#F5F4EF",
    languageBg: "#6AAE6F20",
    languageText: "#6AAE6F",
    runDisabledBg: dark ? "#6B7280" : "#B7BDB2",
    tabBarBg: dark ? "#16162a" : "#ECEBE5",
    tabBorder: dark ? "#2a2b3d" : "#D8DDD3",
    tabActiveBg: dark ? "#1a1b2e" : "#FFFFFF",
    tabActiveText: dark ? "#CDD6F4" : "#2F3430",
    tabInactiveText: dark ? "#6B7280" : "#70766D",
    editorBg: dark ? "#1a1b2e" : "#FAF9F5",
    consoleBg: dark ? "#0d0e17" : "#EEF2EB",
    consoleText: dark ? "#CDD6F4" : "#374151",
    consoleLabel: dark ? "#6B7280" : "#7B8077",
    inputText: dark ? "#CDD6F4" : "#374151",
    selectionBg: dark ? "#334155" : "#B3D4FC",
    caretColor: "#6AAE6F",
  }), [dark]);
}
